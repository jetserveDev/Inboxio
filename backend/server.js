import express from 'express'
import session from 'express-session'
import {Pool, types} from 'pg'
import bcrypt from 'bcrypt'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import multer from 'multer'
import Papa from 'papaparse'
import pkg from '@a2seven/yoo-checkout'
import * as XLSX from 'xlsx';
const { YooCheckout } = pkg
dotenv.config()
const app = express()
app.use(express.json())

app.use(cors({
    credentials:true,
    origin:'http://localhost:5173'
}))

app.use(session({
    secret:process.env.JWT_SECRET,
    resave:false,
    saveUninitialized:false,
    cookie:{secure:false}
}))

const pool = new Pool({
    host: process.env.DB_HOST,
    port:process.env.DB_PORT,
    password:process.env.DB_PASSWORD,
    user:process.env.DB_USER,
    database:process.env.DB_NAME
})
const checkout = new YooCheckout({
    shopId: '100500',
    secretKey: 'test_secretKey'
})

app.post('/registration', async(req, res)=> {
    const {username, email, password, business_name, name} = req.body
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const check = await client.query("SELECT * FROM users WHERE username=$1",[username])
        if(check.rows.length > 0){
            await client.query('ROLLBACK')
            return res.status(400).json({message:"Username уже используется"})
        }
        const hashed_password = await bcrypt.hash(password,10)
        const business = await client.query("INSERT INTO businesses (name) VALUES ($1) RETURNING id",[business_name])
        const business_id = business.rows[0].id

        const userResult = await client.query(
        `INSERT INTO users (username, email, password, role, business_id, name)
        VALUES ($1, $2, $3, 'owner', $4, $5)
        RETURNING id, username, email, role, business_id, name`,
        [username, email, hashed_password, business_id, name]
        )
        await client.query("COMMIT")

        req.session.user = {
            id: userResult.rows[0].id,
            role: userResult.rows[0].role,
            username: userResult.rows[0].username,
            business_id: userResult.rows[0].business_id,
            name:userResult.rows[0].name
        }

        return res.status(200).json({message:"Регистрация успешна!"})

    }catch(err){
        await client.query("ROLLBACK")
        console.error(err)
        if (err.code === '23505') {
        return res.status(400).json({ message: "Email уже используется" })
        }
        return res.status(500).json({message:"Ошибка сервера"})
    }finally{
        client.release()
    }
})

app.post('/subscription/create-payment', async(req,res)=>{
    if(!req.session.user){
        return res.status(401).json({message:'Не авторизован'})
    }
    const {plan} = req.body

    const prices = {
        month:'900.00',
        threemonth:'2500.00',
        year:'7000.00'
    }
    if(!prices[plan]){
        return res.status(400).json({message:'Неверный план'})
    }
    try {
        const payment = await checkout.createPayment({
            amount: {
                value: prices[plan],
                currency: 'RUB'
            },
            confirmation: {
                type: 'redirect',
                return_url:'http://localhost:3000/subscription/success'
            },
            description: `Подписка на Inboxio CRM - ${plan}`,
            metadata: {
                business_id: req.session.user.business_id,
                plan:plan
            }
        })
        req.session.pending_payment = {
            payment_id: payment.id,
            plan: plan
        }
        return res.status(200).json({
            confirmation_url: payment.confirmation.confirmation_url
        })
    }catch(err){
        console.error(err)
        return res.status(500).json({message:'Ошибка при создании платежа'})
    }
})
app.get('/subscription/success', async(req,res) => {
    if (!req.session.user || !req.session.pending_payment) {
        return res.redirect('/subscribe')
    }
    const {payment_id, plan} = req.session.pending_payment

    try {
        const payment = await checkout.getPayment(payment_id)

        if(payment.status === "succeeded") {
            const planDurations = {month:30, threemonth:180, year:365}
            const now = new Date()
            const expires = new Date()
            expires.setDate(now.getDate()+planDurations[plan])

            await pool.query(`
                UPDATE businesses
                SET subscription_started_at=$1,
                subscription_expires_at=$2,
                subscription_plan=$3
                WHERE id=$4`,
            [now, expires, plan, req.session.user.business_id])

            delete req.session.pending_payment
            return res.redirect('/home')
        }
        return res.redirect('/subscribe?error=payment_failed')
    }catch(err){
        console.error(err)
        return res.redirect('/subscribe?error=server_error')
    }

})
app.post('/subscription/webhook', express.json(), async (req, res) => {
    const event = req.body

    if (event.event === 'payment.succeeded') {
        const { business_id, plan } = event.object.metadata
        const planDurations = { month: 30, threemonth: 180, year: 365 }
        const now = new Date()
        const expires = new Date()
        expires.setDate(now.getDate() + planDurations[plan])

        await pool.query(
            `UPDATE businesses
             SET subscription_started_at=$1,
                 subscription_expires_at=$2,
                 subscription_plan=$3
             WHERE id=$4`,
            [now, expires, plan, business_id]
        )
    }

    return res.status(200).json({ ok: true })
})

app.post('/login', async (req, res) => {
    const { username, password } = req.body
    try {
        const userResult = await pool.query(
            `SELECT users.*, businesses.subscription_expires_at 
             FROM users 
             JOIN businesses ON users.business_id = businesses.id
             WHERE users.username = $1`,
            [username]
        )

        if (userResult.rows.length === 0) {
            return res.status(400).json({ message: 'Неверный username или пароль' })
        }

        const user = userResult.rows[0]
        const check = await bcrypt.compare(password, user.password)

        if (!check) {
            return res.status(400).json({ message: 'Неверный username или пароль' })
        }

        req.session.user = {
            id: user.id,
            role: user.role,
            username: user.username,
            business_id: user.business_id
        }


        const now = new Date()
        const expires = user.subscription_expires_at

        if (!expires || new Date(expires) < now) {
            return res.status(400).json({
                redirect: '/subscription',
                message: 'Подписка истекла или не активна'
            })
        }

        return res.status(200).json({
            redirect: '/dashboard',
            message: 'Добро пожаловать!'
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ message: 'Ошибка сервера' })
    }
})
app.post('/generate-link', async(req,res)=>{
    const business_id = req.session.user.business_id

    const token = crypto.randomBytes(32).toString('hex')

    await pool.query("INSERT INTO invites (token, business_id, expires_at) VALUES($1,$2, NOW() + INTERVAL '2 days') ",
        [token,business_id]
    )
    const link = `http://localhost:5173/invite?token=${token}`

    res.json({link})
})
app.post('/get-name', async(req,res)=>{
    const {token} = req.body
    const result = await pool.query(`
    SELECT b.name
    FROM invites i
    JOIN businesses b ON b.id = i.business_id
    WHERE i.token = $1;`,[token])

    res.json({ name: result.rows[0].name });
})
app.post("/reg-by-link/:token", async(req,res)=>{
    const {token} = req.params
    const {username, email, password, name, phone} = req.body
    console.log('BODY: ', req.body)
    try {
        const check = await pool.query("SELECT * FROM invites WHERE token=$1",[token])

        if(check.rows.length === 0){
            return res.status(400).json({message:'Неверная ссылка'})
        }
        const invite = check.rows[0]

        if(invite.used){
            return res.status(400).json({message:'Ссылка уже использована'})
        }
        if(invite.expires_at && new Date(invite.expires_at)< new Date()){
            return res.status(400).json({message:'Срок действия ссылки истек'})
        }

        const check2 = await pool.query('SELECT * FROM users WHERE username=$1',[username])
        if(check2.rows.length>0){
            return res.status(400).json({message:'Username уже используется'})
        }


        const hashed_password = await bcrypt.hash(password,10)

        const result =  await pool.query('INSERT INTO users (username, email,phone, password, role, business_id,name) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, role, name',
        [username, email,phone, hashed_password, 'staff', invite.business_id, name])
        

        await pool.query('UPDATE invites SET used = true, used_at = NOW() WHERE token = $1',[token])
        const id = result.rows[0].id
        const role = result.rows[0].role

        req.session.user = {
            username: username,
            name: result.rows[0].name,
            email: email,
            id:id,
            role:role,
            business_id:invite.business_id
        }

        return res.status(200).json({message:'Добро пожаловать!'})
        

    }catch(err){
        console.error(err)
        if (err.code === '23505') {
        return res.status(400).json({ message: "Email уже используется" })
        }
        return res.status(500).json({message:'Ошибка сервера!'})
    }
})
app.get("/staff", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, name, email, role, is_active,phone
            FROM users 
            WHERE business_id = $1 AND role IN ('owner', 'staff')
            ORDER BY is_active DESC NULLS LAST, name`,
            [req.session.user.business_id]
        );
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.post("/services", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может создавать услуги" });
    }

    const { name, duration, price } = req.body;
    const business_id = req.session.user.business_id;
    try {
        const check = await pool.query(
            `SELECT 1 FROM services 
             WHERE business_id = $1 AND name = $2 AND is_active = TRUE`,
            [business_id, name.trim()]
        );
        if (check.rows.length > 0) {
            return res.status(400).json({ message: "Услуга с таким названием уже есть" });
        }
        const result = await pool.query(
            `INSERT INTO services (business_id, name, duration_minutes, price)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, duration_minutes, price, is_active`,
            [business_id, name.trim(), duration, price]
        );

        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.get("/services", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    try {
        const result = await pool.query(
            `SELECT id, name, duration_minutes, price, is_active
             FROM services 
             WHERE business_id = $1 AND is_active = TRUE
             ORDER BY name`,
            [req.session.user.business_id]
        );
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.put("/services/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может редактировать услуги" });
    }

    const { id } = req.params;
    const { name, duration, price } = req.body;
    const business_id = req.session.user.business_id;

    if (name !== undefined && (!name || !name.trim())) {
        return res.status(400).json({ message: "Название не может быть пустым" });
    }
    if (duration !== undefined && (duration === null || duration <= 0)) {
        return res.status(400).json({ message: "Некорректная длительность" });
    }
    if (price !== undefined && (price === null || price < 0)) {
        return res.status(400).json({ message: "Некорректная цена" });
    }

    try {
        const result = await pool.query(
            `UPDATE services
             SET name = COALESCE($1, name),
                 duration_minutes = COALESCE($2, duration_minutes),
                 price = COALESCE($3, price),
                 updated_at = NOW()
             WHERE id = $4 AND business_id = $5
             RETURNING id, name, duration_minutes, price, is_active`,
            [
                name ? name.trim() : null,
                duration ?? null,
                price ?? null,
                id,
                business_id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Услуга не найдена" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.delete("/services/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может удалять услуги" });
    }

    const { id } = req.params;
    const business_id = req.session.user.business_id;

    try {
        const result = await pool.query(
            `UPDATE services 
             SET is_active = FALSE, updated_at = NOW()
             WHERE id = $1 AND business_id = $2 AND is_active = TRUE
             RETURNING id, name, duration_minutes, price, is_active`,
            [id, business_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Услуга не найдена или уже удалена" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
// Получить ID услуг, которые делает мастер
app.get("/staff/:id/services", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Не авторизован" });
  }
  const { id } = req.params;
  const business_id = req.session.user.business_id;

  try {
    // Проверка, что мастер из нашего бизнеса
    const check = await pool.query(
      `SELECT 1 FROM users WHERE id = $1 AND business_id = $2`,
      [id, business_id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: "Сотрудник не найден" });
    }

    const result = await pool.query(
      `SELECT service_id FROM staff_services WHERE staff_id = $1`,
      [id]
    );
    return res.status(200).json(result.rows.map(r => r.service_id));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Ошибка сервера" });
  }
});

// Заменить весь список услуг мастера (целиком)
app.put("/staff/:id/services", async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: "Не авторизован" });
  }
  if (req.session.user.role !== "owner") {
    return res.status(403).json({ message: "Только владелец может назначать услуги" });
  }

  const { id } = req.params;
  const { service_ids } = req.body;
  const business_id = req.session.user.business_id;

  if (!Array.isArray(service_ids)) {
    return res.status(400).json({ message: "service_ids должен быть массивом" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Проверка мастера
    const staffCheck = await client.query(
      `SELECT 1 FROM users WHERE id = $1 AND business_id = $2`,
      [id, business_id]
    );
    if (staffCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Сотрудник не найден" });
    }

    // Проверка, что все услуги — из нашего бизнеса и активные
    if (service_ids.length > 0) {
      const servicesCheck = await client.query(
        `SELECT id FROM services 
         WHERE id = ANY($1) AND business_id = $2 AND is_active = TRUE`,
        [service_ids, business_id]
      );
      if (servicesCheck.rows.length !== service_ids.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Одна или несколько услуг не найдены" });
      }
    }

    // Удаляем старые связи и вставляем новые
    await client.query(`DELETE FROM staff_services WHERE staff_id = $1`, [id]);

    for (const service_id of service_ids) {
      await client.query(
        `INSERT INTO staff_services (staff_id, service_id) VALUES ($1, $2)`,
        [id, service_id]
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({ service_ids });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Ошибка сервера" });
  } finally {
    client.release();
  }
});
// Получить часы работы бизнеса
app.get("/business-hours", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }

    const business_id = req.session.user.business_id;

    try {
        const result = await pool.query(
            `SELECT day_of_week, is_open, open_time, close_time
             FROM business_hours
             WHERE business_id = $1
             ORDER BY day_of_week`,
            [business_id]
        );

        // Если в БД ничего нет — возвращаем дефолтный шаблон (все дни закрыты)
        // Фронт будет знать, что надо сохранить, чтобы создать
        if (result.rows.length === 0) {
            const empty = [1, 2, 3, 4, 5, 6, 7].map(d => ({
                day_of_week: d,
                is_open: false,
                open_time: null,
                close_time: null,
            }));
            return res.status(200).json(empty);
        }

        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Сохранить часы работы бизнеса (заменяем весь график целиком)
app.put("/business-hours", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может менять график" });
    }

    const { hours } = req.body;
    const business_id = req.session.user.business_id;

    if (!Array.isArray(hours) || hours.length !== 7) {
        return res.status(400).json({ message: "Нужно передать массив из 7 дней" });
    }

    // Валидация каждого дня
    for (const day of hours) {
        if (!Number.isInteger(day.day_of_week) || day.day_of_week < 1 || day.day_of_week > 7) {
            return res.status(400).json({ message: "Некорректный день недели" });
        }
        if (day.is_open) {
            if (!day.open_time || !day.close_time) {
                return res.status(400).json({ message: "Укажите время открытия и закрытия" });
            }
            if (day.open_time >= day.close_time) {
                return res.status(400).json({ message: "Время закрытия должно быть позже открытия" });
            }
        }
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            `DELETE FROM business_hours WHERE business_id = $1`,
            [business_id]
        );

        for (const day of hours) {
            await client.query(
                `INSERT INTO business_hours 
                    (business_id, day_of_week, is_open, open_time, close_time)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    business_id,
                    day.day_of_week,
                    day.is_open,
                    day.is_open ? day.open_time : null,
                    day.is_open ? day.close_time : null,
                ]
            );
        }

        await client.query("COMMIT");

        const result = await client.query(
            `SELECT day_of_week, is_open, open_time, close_time
             FROM business_hours
             WHERE business_id = $1
             ORDER BY day_of_week`,
            [business_id]
        );

        return res.status(200).json(result.rows);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    } finally {
        client.release();
    }
});
app.get("/staff/:id/hours", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }

    const { id } = req.params;
    const business_id = req.session.user.business_id;

    try {
        const check = await pool.query(
            `SELECT 1 FROM users WHERE id = $1 AND business_id = $2`,
            [id, business_id]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ message: "Сотрудник не найден" });
        }

        const [hoursResult, businessResult] = await Promise.all([
            pool.query(
                `SELECT day_of_week, is_working, start_time, end_time
                 FROM staff_hours
                 WHERE staff_id = $1`,
                [id]
            ),
            pool.query(
                `SELECT day_of_week, is_open, open_time, close_time
                 FROM business_hours
                 WHERE business_id = $1`,
                [business_id]
            ),
        ]);

        const staffByDay = new Map(hoursResult.rows.map(r => [r.day_of_week, r]));
        const businessByDay = new Map(businessResult.rows.map(r => [r.day_of_week, r]));

        const hours = [1, 2, 3, 4, 5, 6, 7].map(dow => {
            const business = businessByDay.get(dow);
            const override = staffByDay.get(dow);

            const biz_is_open = business?.is_open || false;
            const biz_start = business?.open_time ? business.open_time.slice(0, 5) : null;
            const biz_end = business?.close_time ? business.close_time.slice(0, 5) : null;

            if (override) {
                return {
                    day_of_week: dow,
                    is_working: override.is_working,
                    start_time: override.start_time ? override.start_time.slice(0, 5) : null,
                    end_time: override.end_time ? override.end_time.slice(0, 5) : null,
                    is_overridden: true,
                    business_is_open: biz_is_open,
                    business_start_time: biz_start,
                    business_end_time: biz_end,
                };
            }

            return {
                day_of_week: dow,
                is_working: biz_is_open,
                start_time: biz_start,
                end_time: biz_end,
                is_overridden: false,
                business_is_open: biz_is_open,
                business_start_time: biz_start,
                business_end_time: biz_end,
            };
        });

        return res.status(200).json(hours);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Сохранить график мастера (заменяем целиком)
app.put("/staff/:id/hours", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может менять график" });
    }

    const { id } = req.params;
    const { overrides } = req.body;
    const business_id = req.session.user.business_id;

    if (!Array.isArray(overrides)) {
        return res.status(400).json({ message: "overrides должен быть массивом" });
    }
    if (overrides.length > 7) {
        return res.status(400).json({ message: "Не больше 7 дней" });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const staffCheck = await client.query(
            `SELECT 1 FROM users WHERE id = $1 AND business_id = $2`,
            [id, business_id]
        );
        if (staffCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Сотрудник не найден" });
        }

        const businessHours = await client.query(
            `SELECT day_of_week, is_open, open_time, close_time
             FROM business_hours WHERE business_id = $1`,
            [business_id]
        );
        const businessByDay = new Map(businessHours.rows.map(r => [r.day_of_week, r]));

        // Валидация каждого переопределения
        for (const day of overrides) {
            if (!Number.isInteger(day.day_of_week) || day.day_of_week < 1 || day.day_of_week > 7) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Некорректный день недели" });
            }
            
            if (!day.is_working) continue;
            
            if (!day.start_time || !day.end_time) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Укажите время начала и конца" });
            }
            if (day.start_time >= day.end_time) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Время конца должно быть позже начала" });
            }

            const biz = businessByDay.get(day.day_of_week);
            if (!biz || !biz.is_open) {
                await client.query("ROLLBACK");
                return res.status(400).json({ 
                    message: "Заведение в этот день закрыто. Сначала измените график заведения." 
                });
            }
            if (
                day.start_time < biz.open_time.slice(0, 5) || 
                day.end_time > biz.close_time.slice(0, 5)
            ) {
                await client.query("ROLLBACK");
                return res.status(400).json({ 
                    message: `Часы должны быть в пределах ${biz.open_time.slice(0, 5)}–${biz.close_time.slice(0, 5)}` 
                });
            }
        }

        // Заменяем все переопределения мастера
        await client.query(`DELETE FROM staff_hours WHERE staff_id = $1`, [id]);

        for (const day of overrides) {
            await client.query(
                `INSERT INTO staff_hours 
                    (staff_id, day_of_week, is_working, start_time, end_time)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    id,
                    day.day_of_week,
                    day.is_working,
                    day.is_working ? day.start_time : null,
                    day.is_working ? day.end_time : null,
                ]
            );
        }

        await client.query("COMMIT");

        const result = await pool.query(
            `SELECT day_of_week, is_working, start_time, end_time
             FROM staff_hours WHERE staff_id = $1 ORDER BY day_of_week`,
            [id]
        );
        return res.status(200).json(result.rows);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    } finally {
        client.release();
    }
});
// Список клиентов с поиском
app.get("/customers", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    
    const business_id = req.session.user.business_id;
    const { q } = req.query; // поисковый запрос
    
    try {
        let result;
        
        if (q && q.trim()) {
            const searchPattern = `%${q.trim()}%`;
            // Поиск по имени ИЛИ по телефону
            result = await pool.query(
                `SELECT id, name, phone, email, birth_date, notes, created_at
                 FROM customers
                 WHERE business_id = $1 
                   AND (name ILIKE $2 OR phone ILIKE $2)
                 ORDER BY name NULLS LAST, created_at DESC
                 LIMIT 100`,
                [business_id, searchPattern]
            );
        } else {
            result = await pool.query(
                `SELECT id, name, phone, email, birth_date, notes, created_at
                 FROM customers
                 WHERE business_id = $1
                 ORDER BY created_at DESC
                 LIMIT 100`,
                [business_id]
            );
        }
        
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Получить одного клиента по id (для модалки и истории)
app.get("/customers/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    
    const { id } = req.params;
    const business_id = req.session.user.business_id;
    
    try {
        const result = await pool.query(
            `SELECT id, name, phone, email, birth_date, notes, 
                    created_via, created_at, updated_at
             FROM customers
             WHERE id = $1 AND business_id = $2`,
            [id, business_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Клиент не найден" });
        }
        
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Поиск или создание клиента по телефону (для использования при записи)
// Если клиент с таким номером есть — возвращаем его. Если нет — создаём.
app.post("/customers/find-or-create", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    
    const { name, phone, email } = req.body;
    const business_id = req.session.user.business_id;
    
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ message: "Некорректный номер телефона" });
    }
    
    try {
        // Ищем существующего
        const existing = await pool.query(
            `SELECT id, name, phone, email, birth_date, notes
             FROM customers
             WHERE business_id = $1 AND phone = $2`,
            [business_id, normalizedPhone]
        );
        
        if (existing.rows.length > 0) {
            const customer = existing.rows[0];
            // Если имя пришло, а у клиента было пустое — заполним
            if (name && name.trim() && !customer.name) {
                const updated = await pool.query(
                    `UPDATE customers 
                     SET name = $1, updated_at = NOW()
                     WHERE id = $2 
                     RETURNING id, name, phone, email, birth_date, notes`,
                    [name.trim(), customer.id]
                );
                return res.status(200).json({ 
                    customer: updated.rows[0], 
                    created: false 
                });
            }
            return res.status(200).json({ customer, created: false });
        }
        
        // Создаём
        const result = await pool.query(
            `INSERT INTO customers (business_id, name, phone, email, created_via)
             VALUES ($1, $2, $3, $4, 'admin')
             RETURNING id, name, phone, email, birth_date, notes`,
            [business_id, name?.trim() || null, normalizedPhone, email?.trim() || null]
        );
        
        return res.status(201).json({ 
            customer: result.rows[0], 
            created: true 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Создать клиента (явно, без поиска)
app.post("/customers", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    
    const { name, phone, email, birth_date, notes } = req.body;
    const business_id = req.session.user.business_id;
    
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return res.status(400).json({ message: "Укажите корректный номер телефона" });
    }
    
    try {
        const result = await pool.query(
            `INSERT INTO customers (business_id, name, phone, email, birth_date, notes, created_via)
             VALUES ($1, $2, $3, $4, $5, $6, 'admin')
             RETURNING id, name, phone, email, birth_date, notes, created_at`,
            [
                business_id,
                name?.trim() || null,
                normalizedPhone,
                email?.trim() || null,
                birth_date || null,
                notes?.trim() || null,
            ]
        );
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        // 23505 — нарушение UNIQUE constraint
        if (err.code === '23505') {
            return res.status(400).json({ 
                message: "Клиент с таким номером уже есть" 
            });
        }
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

// Обновить клиента
app.put("/customers/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    
    const { id } = req.params;
    const { name, phone, email, birth_date, notes } = req.body;
    const business_id = req.session.user.business_id;
    
    // Если меняют телефон — нормализуем
    let normalizedPhone = null;
    if (phone !== undefined) {
        normalizedPhone = normalizePhone(phone);
        if (!normalizedPhone) {
            return res.status(400).json({ message: "Некорректный номер телефона" });
        }
    }
    
    try {
        const result = await pool.query(
            `UPDATE customers
             SET name = COALESCE($1, name),
                 phone = COALESCE($2, phone),
                 email = COALESCE($3, email),
                 birth_date = COALESCE($4, birth_date),
                 notes = COALESCE($5, notes),
                 updated_at = NOW()
             WHERE id = $6 AND business_id = $7
             RETURNING id, name, phone, email, birth_date, notes, updated_at`,
            [
                name?.trim() || null,
                normalizedPhone,
                email?.trim() || null,
                birth_date || null,
                notes?.trim() || null,
                id,
                business_id,
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Клиент не найден" });
        }
        
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(400).json({ 
                message: "Этот номер уже использует другой клиент" 
            });
        }
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});


app.delete("/customers/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может удалять клиентов" });
    }
    
    const { id } = req.params;
    const business_id = req.session.user.business_id;
    
    try {
        const result = await pool.query(
            `DELETE FROM customers WHERE id = $1 AND business_id = $2 RETURNING id`,
            [id, business_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Клиент не найден" });
        }
        
        return res.status(200).json({ message: "Удалено" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});


function normalizePhone(phone) {
    if (phone == null) return null;

    let str = phone.toString().trim();
    if (/e/i.test(str) && !isNaN(parseFloat(str))) {
        try {
            str = BigInt(Math.round(parseFloat(str))).toString();
        } catch {
            return null;
        }
    }

    let cleaned = str.replace(/[^\d+]/g, '');

    if (cleaned.startsWith('8') && cleaned.length === 11) {
        cleaned = '+7' + cleaned.slice(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 11 && !cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    if (!/^\+\d{10,15}$/.test(cleaned)) return null;

    return cleaned;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedExt = ['.csv', '.xlsx', '.xls'];
        const ext = '.' + file.originalname.split('.').pop().toLowerCase();
        if (allowedExt.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Поддерживаются только CSV и Excel файлы (.csv, .xlsx, .xls)'));
        }
    },
});
const COLUMN_SYNONYMS = {
    name: [
        'name', 'фио', 'имя', 'имя клиента', 'полное имя', 'клиент',
        'full name', 'client', 'client name', 'customer', 'customer name',
        'фамилия имя', 'firstname', 'first name'
    ],
    phone: [
        'phone', 'телефон', 'номер', 'номер телефона', 'мобильный', 
        'mobile', 'tel', 'tel.', 'phone number', 'contact', 'whatsapp'
    ],
    email: [
        'email', 'e-mail', 'почта', 'эл. почта', 'электронная почта',
        'mail', 'почтовый ящик'
    ],
    notes: [
        'notes', 'заметки', 'комментарий', 'комментарии', 'примечание',
        'примечания', 'comment', 'note', 'description', 'описание'
    ],
};


function normalizeHeader(header) {
    return (header || '').toString().trim().toLowerCase();
}


function detectColumns(headers) {
    const result = {};
    const normalizedHeaders = headers.map(normalizeHeader);
    
    for (const [field, synonyms] of Object.entries(COLUMN_SYNONYMS)) {
        for (let i = 0; i < normalizedHeaders.length; i++) {
            if (synonyms.includes(normalizedHeaders[i])) {
                result[field] = i; 
                break;
            }
        }
    }
    return result;
}
// Парсит CSV или Excel → возвращает массив массивов [[h1, h2], [v1, v2], ...]
function parseUploadedFile(buffer, originalname) {
    const ext = originalname.split('.').pop().toLowerCase();

    if (ext === 'csv') {
        const text = buffer.toString('utf-8');
        const parsed = Papa.parse(text, {
            header: false,
            skipEmptyLines: true,
            delimiter: '',
        });
        if (parsed.data.length === 0) throw new Error('Файл пустой');
        return parsed.data;
    }

    if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Excel-файл не содержит листов');

        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,    
            defval: '',   
            raw: false,  
        });
        // Убираем полностью пустые строки
        const filtered = rows.filter(row =>
            row.some(cell => cell != null && cell.toString().trim() !== '')
        );
        if (filtered.length === 0) throw new Error('Файл пустой');
        return filtered;
    }

    throw new Error('Неподдерживаемый формат файла');
}

app.post("/customers/import", upload.single('file'), async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может импортировать клиентов" });
    }
    if (!req.file) {
        return res.status(400).json({ message: "Файл не загружен" });
    }
    const business_id = req.session.user.business_id;
    let allRows;
    try {
        allRows = parseUploadedFile(req.file.buffer, req.file.originalname);
    } catch (parseErr) {
        return res.status(400).json({ message: parseErr.message });
    }

    if (allRows.length < 2) {
        return res.status(400).json({ 
            message: "Файл пустой или содержит только заголовки" 
        });
    }
    const headers = allRows[0].map(h => h?.toString() || '');
    const rows = allRows.slice(1);
    if (rows.length > 5000) {
        return res.status(400).json({ 
            message: `Слишком много строк (${rows.length}). Лимит — 5000. Разделите файл на части.` 
        });
    }
    const columnMap = detectColumns(headers);
    if (columnMap.phone === undefined) {
        return res.status(400).json({ 
            message: "В файле не найдена колонка с телефоном. Ожидаемые названия: Phone, Телефон, Номер, Mobile" 
        });
    }
    const client = await pool.connect();
    const stats = {
        total: rows.length,
        imported: 0,
        skipped_duplicate: 0,
        errors: [],
    };
    try {
        await client.query('BEGIN');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;
            const rawPhone = row[columnMap.phone];
            const normalizedPhone = normalizePhone(rawPhone);
            
            if (!normalizedPhone) {
                stats.errors.push({
                    row: rowNum,
                    reason: `Невалидный телефон: "${rawPhone || 'пусто'}"`,
                });
                continue;
            }
            
            const name = columnMap.name !== undefined 
                ? (row[columnMap.name] || '').toString().trim() || null 
                : null;
            const email = columnMap.email !== undefined 
                ? (row[columnMap.email] || '').toString().trim() || null 
                : null;
            const notes = columnMap.notes !== undefined 
                ? (row[columnMap.notes] || '').toString().trim() || null 
                : null;
            
            try {
                const insertResult = await client.query(
                    `INSERT INTO customers (business_id, name, phone, email, notes, created_via)
                     VALUES ($1, $2, $3, $4, $5, 'import')
                     ON CONFLICT (business_id, phone) DO NOTHING
                     RETURNING id`,
                    [business_id, name, normalizedPhone, email, notes]
                );
                
                if (insertResult.rows.length > 0) {
                    stats.imported++;
                } else {
                    stats.skipped_duplicate++;
                }
            } catch (rowErr) {
                stats.errors.push({
                    row: rowNum,
                    reason: 'Ошибка БД',
                });
            }
        }
        
        await client.query('COMMIT');
        const errorsToReturn = stats.errors.slice(0, 20);
        
        return res.status(200).json({
            total: stats.total,
            imported: stats.imported,
            skipped_duplicate: stats.skipped_duplicate,
            errors_count: stats.errors.length,
            errors: errorsToReturn,
            detected_columns: Object.keys(columnMap),
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера при импорте" });
    } finally {
        client.release();
    }
});
app.get("/staff/:id/free-slots", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    const { id } = req.params;
    const { date, duration } = req.query;
    const business_id = req.session.user.business_id;
    if (!date || !duration) {
        return res.status(400).json({ message: "Укажите date и duration" });
    }
    const durationMin = parseInt(duration);
    if (isNaN(durationMin) || durationMin <= 0) {
        return res.status(400).json({ message: "Некорректная длительность" });
    }
    try {
        const staffCheck = await pool.query(
            `SELECT 1 FROM users WHERE id = $1 AND business_id = $2`,
            [id, business_id]
        );
        if (staffCheck.rows.length === 0) {
            return res.status(404).json({ message: "Мастер не найден" });
        }

        const dateObj = new Date(date + "T00:00:00");
        const jsDay = dateObj.getDay();
        const dayOfWeek = jsDay === 0 ? 7 : jsDay;
        let exceptionStart = null;
        let exceptionEnd = null;
        const exception = await pool.query(
            `SELECT is_open, open_time, close_time, label
             FROM business_date_exceptions
             WHERE business_id = $1 AND exception_date = $2`,
            [business_id, date]
        );
        if (exception.rows.length > 0) {
            const exc = exception.rows[0];
            if (!exc.is_open) {
                return res.status(200).json({
                    slots: [],
                    reason: exc.label ? `Выходной: ${exc.label}` : "Выходной день",
                });
            }
            exceptionStart = exc.open_time.slice(0, 5);
            exceptionEnd = exc.close_time.slice(0, 5);
        }

        let workStart, workEnd;
        const staffHours = await pool.query(
            `SELECT is_working, start_time, end_time
             FROM staff_hours
             WHERE staff_id = $1 AND day_of_week = $2`,
            [id, dayOfWeek]
        );

        if (staffHours.rows.length > 0) {
            const sh = staffHours.rows[0];
            if (!sh.is_working) {
                return res.status(200).json({ slots: [], reason: "Мастер не работает в этот день" });
            }
            workStart = sh.start_time.slice(0, 5);
            workEnd = sh.end_time.slice(0, 5);
        } else if (exceptionStart) {
            workStart = exceptionStart;
            workEnd = exceptionEnd;
        } else {
            const businessHours = await pool.query(
                `SELECT is_open, open_time, close_time
                 FROM business_hours
                 WHERE business_id = $1 AND day_of_week = $2`,
                [business_id, dayOfWeek]
            );
            if (businessHours.rows.length === 0 || !businessHours.rows[0].is_open) {
                return res.status(200).json({ slots: [], reason: "Заведение закрыто в этот день" });
            }
            workStart = businessHours.rows[0].open_time.slice(0, 5);
            workEnd = businessHours.rows[0].close_time.slice(0, 5);
        }
        if (exceptionStart) {
            const wStart = timeToMinutes(workStart);
            const wEnd = timeToMinutes(workEnd);
            const eStart = timeToMinutes(exceptionStart);
            const eEnd = timeToMinutes(exceptionEnd);
            const clampedStart = Math.max(wStart, eStart);
            const clampedEnd = Math.min(wEnd, eEnd);
            if (clampedStart >= clampedEnd) {
                return res.status(200).json({
                    slots: [],
                    reason: "Мастер не работает в особые часы этого дня",
                });
            }
            workStart = minutesToTime(clampedStart);
            workEnd = minutesToTime(clampedEnd);
        }
        const dayStart = `${date}T00:00:00`;
        const dayEnd = `${date}T23:59:59`;
        const appointments = await pool.query(
            `SELECT starts_at, ends_at
             FROM appointments
             WHERE staff_id = $1
               AND status != 'cancelled'
               AND starts_at >= $2
               AND starts_at <= $3
             ORDER BY starts_at`,
            [id, dayStart, dayEnd]
        );
        const busyIntervals = appointments.rows.map(a => ({
            start: toMinutes(new Date(a.starts_at)),
            end: toMinutes(new Date(a.ends_at)),
        }));
        const SLOT_STEP = 30;
        const workStartMin = timeToMinutes(workStart);
        const workEndMin = timeToMinutes(workEnd);
        const slots = [];
        for (let t = workStartMin; t + durationMin <= workEndMin; t += SLOT_STEP) {
            const slotStart = t;
            const slotEnd = t + durationMin;
            const overlaps = busyIntervals.some(
                (busy) => slotStart < busy.end && slotEnd > busy.start
            );
            if (!overlaps) {
                slots.push(minutesToTime(slotStart));
            }
        }

        return res.status(200).json({ slots, work_start: workStart, work_end: workEnd });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.post("/appointments", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }

    const { customer_id, staff_id, starts_at, service_ids, notes } = req.body;
    const business_id = req.session.user.business_id;

    if (!customer_id || !staff_id || !starts_at) {
        return res.status(400).json({ message: "Укажите customer_id, staff_id, starts_at" });
    }
    if (!Array.isArray(service_ids) || service_ids.length === 0) {
        return res.status(400).json({ message: "Укажите хотя бы одну услугу" });
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(starts_at)) {
        return res.status(400).json({ message: "Некорректный формат времени" });
    }
    const startsAt = starts_at.length === 16 ? `${starts_at}:00` : starts_at;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // === Проверка: не выходной ли это день (исключение по дате) ===
        const dateOnly = startsAt.split('T')[0]; // "2026-01-01"
        const excCheck = await client.query(
            `SELECT is_open, label FROM business_date_exceptions
             WHERE business_id = $1 AND exception_date = $2`,
            [business_id, dateOnly]
        );
        if (excCheck.rows.length > 0 && !excCheck.rows[0].is_open) {
            await client.query("ROLLBACK");
            const label = excCheck.rows[0].label;
            return res.status(400).json({
                message: label
                    ? `Нельзя записать: выходной (${label})`
                    : "Нельзя записать: выходной день",
            });
        }

        const customerCheck = await client.query(
            `SELECT 1 FROM customers WHERE id = $1 AND business_id = $2`,
            [customer_id, business_id]
        );
        if (customerCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Клиент не найден" });
        }
        const staffCheck = await client.query(
            `SELECT 1 FROM users 
             WHERE id = $1 AND business_id = $2 AND role IN ('owner','staff')`,
            [staff_id, business_id]
        );
        if (staffCheck.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Мастер не найден" });
        }
        const servicesResult = await client.query(
            `SELECT id, price, duration_minutes
             FROM services
             WHERE id = ANY($1) AND business_id = $2 AND is_active = TRUE`,
            [service_ids, business_id]
        );
        if (servicesResult.rows.length !== service_ids.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Одна или несколько услуг не найдены или неактивны" });
        }
        const masterServices = await client.query(
            `SELECT service_id FROM staff_services 
             WHERE staff_id = $1 AND service_id = ANY($2)`,
            [staff_id, service_ids]
        );
        if (masterServices.rows.length !== service_ids.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Мастер не выполняет одну или несколько выбранных услуг" });
        }

        // Считаем суммарную длительность (в порядке, как услуги пришли с фронта)
        const servicesById = new Map(servicesResult.rows.map(s => [s.id, s]));
        const orderedServices = service_ids.map(id => servicesById.get(id));
        const totalDuration = orderedServices.reduce((sum, s) => sum + s.duration_minutes, 0);

        const endsAt = addMinutesToTimestamp(startsAt, totalDuration);

        const conflict = await hasStaffConflict(client, staff_id, startsAt, endsAt);
        if (conflict) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "В это время у мастера уже есть запись" });
        }

        const apptInsert = await client.query(
            `INSERT INTO appointments 
                (business_id, customer_id, staff_id, starts_at, ends_at, notes, created_via)
             VALUES ($1, $2, $3, $4, $5, $6, 'admin')
             RETURNING id, starts_at, ends_at`,
            [business_id, customer_id, staff_id, startsAt, endsAt, notes?.trim() || null]
        );
        const appointment = apptInsert.rows[0];

        for (let i = 0; i < orderedServices.length; i++) {
            const s = orderedServices[i];
            await client.query(
                `INSERT INTO appointment_services 
                    (appointment_id, service_id, price_snapshot, duration_snapshot, position)
                 VALUES ($1, $2, $3, $4, $5)`,
                [appointment.id, s.id, s.price, s.duration_minutes, i]
            );
        }

        await client.query("COMMIT");

        return res.status(201).json({
            id: appointment.id,
            starts_at: appointment.starts_at,
            ends_at: appointment.ends_at,
            total_duration: totalDuration,
            message: "Запись создана",
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    } finally {
        client.release();
    }
});
app.get("/appointments", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }

    const business_id = req.session.user.business_id;
    const { from, to, staff_id } = req.query;

    if (!from || !to) {
        return res.status(400).json({ message: "Укажите параметры from и to" });
    }

    try {
        const params = [business_id, from, to];
        let staffFilter = '';
        if (staff_id) {
            params.push(staff_id);
            staffFilter = ' AND a.staff_id = $4';
        }
        const apptResult = await pool.query(
            `SELECT 
            a.id, a.customer_id, a.staff_id,
            to_char(a.starts_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS starts_at,
            to_char(a.ends_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS ends_at,
            a.status, a.notes, a.created_via, a.created_at,
                c.name AS customer_name, c.phone AS customer_phone,
                u.name AS staff_name, u.username AS staff_username
             FROM appointments a
             JOIN customers c ON c.id = a.customer_id
             JOIN users u ON u.id = a.staff_id
             WHERE a.business_id = $1
               AND a.starts_at >= $2
               AND a.starts_at < $3
               ${staffFilter}
             ORDER BY a.starts_at`,
            params
        );

        if (apptResult.rows.length === 0) {
            return res.status(200).json([]);
        }

        // Подтягиваем услуги всех записей одним запросом
        const ids = apptResult.rows.map(a => a.id);
        const servicesResult = await pool.query(
            `SELECT 
                ap.appointment_id, ap.service_id, ap.price_snapshot, 
                ap.duration_snapshot, ap.position,
                s.name AS service_name
             FROM appointment_services ap
             JOIN services s ON s.id = ap.service_id
             WHERE ap.appointment_id = ANY($1)
             ORDER BY ap.appointment_id, ap.position`,
            [ids]
        );
        const servicesByAppt = new Map();
        for (const row of servicesResult.rows) {
            if (!servicesByAppt.has(row.appointment_id)) {
                servicesByAppt.set(row.appointment_id, []);
            }
            servicesByAppt.get(row.appointment_id).push({
                service_id: row.service_id,
                name: row.service_name,
                price: row.price_snapshot,
                duration: row.duration_snapshot,
                position: row.position,
            });
        }
        const result = apptResult.rows.map(a => {
            const services = servicesByAppt.get(a.id) || [];
            return {
                ...a,
                services,
                total_price: services.reduce((sum, s) => sum + parseFloat(s.price), 0),
                total_duration: services.reduce((sum, s) => sum + s.duration, 0),
            };
        });

        return res.status(200).json(result);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.put("/appointments/:id/status", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }

    const { id } = req.params;
    const { status, cancellation_reason } = req.body;  
    const business_id = req.session.user.business_id;

    const allowedStatuses = ['scheduled', 'completed', 'cancelled', 'no_show'];
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Некорректный статус" });
    }

    try {
        // Если отмена — фиксируем когда и почему
        const isCancellation = status === 'cancelled';
        const cancelledAt = isCancellation ? new Date() : null;
        const cancelReason = isCancellation ? (cancellation_reason || null) : null;

        const result = await pool.query(
            `UPDATE appointments
             SET status = $1,
                 cancelled_at = $2,
                 cancellation_reason = $3,
                 updated_at = NOW()
             WHERE id = $4 AND business_id = $5
             RETURNING id, status, cancelled_at, cancellation_reason`,
            [status, cancelledAt, cancelReason, id, business_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Запись не найдена" });
        }

        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.delete("/appointments/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может удалять записи" });
    }

    const { id } = req.params;
    const business_id = req.session.user.business_id;

    try {
        const result = await pool.query(
            `DELETE FROM appointments WHERE id = $1 AND business_id = $2 RETURNING id`,
            [id, business_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Запись не найдена" });
        }
        return res.status(200).json({ message: "Удалено" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
async function hasStaffConflict(client, staffId, starts, ends, excludeId = null) {
    const params = [staffId, starts, ends];
    let excludeClause = '';
    if (excludeId) {
        params.push(excludeId);
        excludeClause = ' AND id != $4';
    }
    const result = await client.query(
        `SELECT id FROM appointments
         WHERE staff_id = $1
           AND status != 'cancelled'
           AND starts_at < $3
           AND ends_at > $2
           ${excludeClause}
         LIMIT 1`,
        params
    );
    return result.rows.length > 0;
}
app.get("/date-exceptions", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    const business_id = req.session.user.business_id;
    const { from, to } = req.query;

    try {
        let result;
        if (from && to) {
            result = await pool.query(
                `SELECT id, 
                        to_char(exception_date, 'YYYY-MM-DD') AS exception_date,
                        is_open, open_time, close_time, label
                 FROM business_date_exceptions
                 WHERE business_id = $1 
                   AND exception_date >= $2 AND exception_date <= $3
                 ORDER BY exception_date`,
                [business_id, from, to]
            );
        } else {
            result = await pool.query(
                `SELECT id, 
                        to_char(exception_date, 'YYYY-MM-DD') AS exception_date,
                        is_open, open_time, close_time, label
                 FROM business_date_exceptions
                 WHERE business_id = $1
                 ORDER BY exception_date`,
                [business_id]
            );
        }
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});

app.put("/date-exceptions", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может менять график" });
    }

    const { exception_date, is_open, open_time, close_time, label } = req.body;
    const business_id = req.session.user.business_id;

    if (!exception_date || !/^\d{4}-\d{2}-\d{2}$/.test(exception_date)) {
        return res.status(400).json({ message: "Укажите дату в формате ГГГГ-ММ-ДД" });
    }

    if (is_open) {
        if (!open_time || !close_time) {
            return res.status(400).json({ message: "Для рабочего дня укажите часы" });
        }
        if (open_time >= close_time) {
            return res.status(400).json({ message: "Время закрытия должно быть позже открытия" });
        }
    }

    try {
        const result = await pool.query(
            `INSERT INTO business_date_exceptions 
                (business_id, exception_date, is_open, open_time, close_time, label)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (business_id, exception_date) 
             DO UPDATE SET 
                is_open = EXCLUDED.is_open,
                open_time = EXCLUDED.open_time,
                close_time = EXCLUDED.close_time,
                label = EXCLUDED.label
             RETURNING id, 
                       to_char(exception_date, 'YYYY-MM-DD') AS exception_date,
                       is_open, open_time, close_time, label`,
            [
                business_id,
                exception_date,
                !!is_open,
                is_open ? open_time : null,
                is_open ? close_time : null,
                label?.trim() || null,
            ]
        );
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
app.delete("/date-exceptions/:id", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ message: "Не авторизован" });
    }
    if (req.session.user.role !== "owner") {
        return res.status(403).json({ message: "Только владелец может менять график" });
    }
    const { id } = req.params;
    const business_id = req.session.user.business_id;

    try {
        const result = await pool.query(
            `DELETE FROM business_date_exceptions 
             WHERE id = $1 AND business_id = $2 RETURNING id`,
            [id, business_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Исключение не найдено" });
        }
        return res.status(200).json({ message: "Удалено" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: "Ошибка сервера" });
    }
});
function addMinutesToTimestamp(timestampStr, minutes) {
    const [datePart, timePart] = timestampStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [h, m, s = 0] = timePart.split(':').map(Number);

    const d = new Date(Date.UTC(year, month - 1, day, h, m, s));
    d.setUTCMinutes(d.getUTCMinutes() + minutes);

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}
function timeToMinutes(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
}

function minutesToTime(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function toMinutes(date) {
    return date.getHours() * 60 + date.getMinutes();
}
app.listen(process.env.PORT,()=>{
    console.log('SERVER STARTED')
})