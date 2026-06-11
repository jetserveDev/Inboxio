import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
export default function InvitePage(){
    const [businessName, setBusinessName] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [phone, setPhone] = useState('')
    const [name, setName] = useState('')
    const navigate = useNavigate()
    const token = new URLSearchParams(window.location.search).get("token");
    useEffect(() => {
    const fetchData = async () => {
        const res = await fetch('http://localhost:3000/get-name', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token })
        });

        const data = await res.json();
        setBusinessName(data.name);
    };

    fetchData();
    }, []);

    const registration = async()=>{
        const result = await fetch(`http://localhost:3000/reg-by-link/${token}`,{
            method:'POST',
            credentials:'include',
            headers:{
                'Content-Type':'application/json'
            },
            body:JSON.stringify({email, username,password,name, phone})
        })
        const data = await result.json()
        if(result.ok){
            alert(data.message)
            navigate('/home')         
        }
        else{
            alert(data.message)
            return
        }
    }

    console.log(token)
    return(
        <div className="main-box">
            <div className="left">
                <h1 className="title">Inboxio</h1>
                <p className="subtitle">Все заявки в одном месте</p>
            </div>
            <div className="form">
                <h1 className="invite-title">
                    Присоединяйтесь к <span>{businessName}</span>
                    </h1>

                    <p className="invite-subtitle">
                    Зарегистрируйтесь как сотрудник
                    </p>
                <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Имя" ></input>
                <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Username" ></input>
                <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder="Телефон" ></input>
                <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" ></input>

                <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Пароль" ></input>
                <button onClick={registration} className="log-reg-btn" >Зарегестрироваться</button>
            </div>
        </div>
    )
}