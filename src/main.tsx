import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css' // self-hosted @font-face (before styles.css, which references the families)
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
