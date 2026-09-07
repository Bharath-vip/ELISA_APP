import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Offline Service Worker for 100% on-device flight mode
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('[SW] ServiceWorker registered with scope:', registration.scope);
    }).catch((err) => {
      console.log('[SW] ServiceWorker registration failed:', err);
    });
  });
}

