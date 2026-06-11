import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function App() {
  const [mode, setMode] = useState('login')
  const [business_name, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const navigate = useNavigate()

  const registration = async () => {
    if (
      !business_name.trim() ||
      !email.trim() ||
      !username.trim() ||
      !password.trim()
    ) {
      return
    }

    try {
      const response = await fetch('http://localhost:3000/registration',{
        method:'POST',
        credentials:'include',
        headers:{
          'Content-Type':'application/json'
        },
        body: JSON.stringify({username, email, password, business_name, name})
      })
      const data = await response.json()
      if(response.ok){
        navigate('/subscription')
        setBusinessName('')
        setEmail('')
        setUsername('')
        setPassword('')
      }else{
        alert(data.message)
        return
      }
    }catch(err){
      console.error(err)
      return
    }
  }
  const login = async()=>{
    if (
      !username.trim() ||
      !password.trim()
    ) {
      return
    }
    try {
      const response = await fetch('http://localhost:3000/login',{
        method:'POST',
        credentials:'include',
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({username,password})
      })
      const data = await response.json()
      if(response.ok){
        navigate('/home')
      }
      if(data.message === "Подписка истекла или не активна"){
        alert(data.message)
        navigate('/subscription')
        return
      }
      else{
        alert(data.message)
      }

    }catch(err){
      console.error(err)
      return
    }


  }

  return (
    <>
      
      <div className='main-box'>
        <div className="left">
          <h1 className="title">Inboxio</h1>
          <p className="subtitle">Все записи в одном месте</p>
        </div>
      <div className='form'>
        <div className='options'>
          <button className={mode === 'login' ? 'options-btn active' : 'options-btn'} onClick={()=>setMode('login')} >Вход</button>
          <button className={mode === 'registration' ? 'options-btn active' : 'options-btn'} onClick={()=>setMode('registration')} >Регистрация</button>
        </div>
        {mode === 'login' && (
          <>
            <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder='Username' ></input>
            <input value={password} onChange={(e)=>setPassword(e.target.value)} type='password' placeholder='Пароль' ></input>
            <button onClick={login} className='log-reg-btn' >Войти</button>
          </>
        )}
        {mode === 'registration' && (
          <>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder='Имя'  ></input>
            <input value={business_name} onChange={(e)=>setBusinessName(e.target.value)} placeholder='Название компании' ></input>
            <input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder='Username' ></input>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type='Email' placeholder='email' ></input>
            <input value={password} onChange={(e)=>setPassword(e.target.value)} type='password' placeholder='Пароль' ></input>
            <button onClick={registration} className='log-reg-btn'>Регистрация</button>
          </>
        )}
      </div>
      </div>
    </>
  )
}

export default App
