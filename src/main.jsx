import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Auto-reload when a new service worker takes control
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

// Reload when restored from bfcache (browser back-forward cache) — avoids stale frozen page
window.addEventListener('pageshow', (e) => {
  if (e.persisted) window.location.reload()
})

// Reload if app was backgrounded for >60 s (Android back-button then return).
// Firebase listeners silently die during Doze/network changes; a fresh load is
// the safest recovery rather than trying to reconnect each individually.
let hiddenAt = null
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
  } else if (hiddenAt !== null) {
    if (Date.now() - hiddenAt > 60_000) window.location.reload()
    hiddenAt = null
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
