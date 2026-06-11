import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import "./index.css"
import App from './App.jsx'
import {BrowserRouter, Routes, Route} from "react-router-dom"
import Home from './Home.jsx'
import Subscription from './Subscription.jsx'
import InvitePage from './InvitePage.jsx'
import Scheule from './Schedule.jsx'
import Clients from './Clients.jsx'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<App/>} />
        <Route path='/home' element={<Home/>}/>
        <Route path='/subscription' element={<Subscription/>} />
        <Route path='/invite' element={<InvitePage/>} />
        <Route path='/schedule' element={<Scheule/>} />
        <Route path='/clients' element={<Clients/>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
