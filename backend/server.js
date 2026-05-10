import express from 'express'
import session from 'express-session'
import {Pool, types} from 'pg'
import bcrypt from 'bcrypt'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'

import pkg from '@a2seven/yoo-checkout'
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
    const {username, email, password, name} = req.body
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

        const result =  await pool.query('INSERT INTO users (username, email, password, role, business_id,name) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, role, name',
        [username, email, hashed_password, 'staff', invite.business_id, name])
        

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
            `SELECT id, username, name, email, role, is_active
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

app.listen(process.env.PORT,()=>{
    console.log('SERVER STARTED')
})