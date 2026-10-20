import React from 'react'
import ReactDOM from 'react-dom/client'
import BaristaApp from './barista/BaristaApp'

// schedule.brbcoffee-atx.com: log in or sign up, then the schedule. The admin
// side is the Schedule tab on staff.brbcoffee-atx.com (brb-baristas-admin).
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BaristaApp />
  </React.StrictMode>,
)
