import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initializeNative } from '@/lib/native'

initializeNative().catch(error => console.error('Native initialization failed', error)).finally(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
})
