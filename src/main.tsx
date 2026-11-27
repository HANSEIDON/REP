import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/fonts.css'
import './index.css'
import { applyStoredTheme } from './data/theme'
import App from './app/App'

void applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
