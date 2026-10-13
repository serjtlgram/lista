import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App.tsx'
import './index.css'
import { triggerFullscreen } from './utils/telegram.ts'

// 1. Immediate call before any auth/renders
triggerFullscreen();

// 2. Safe retry timers for Telegram IPC delay
[100, 500].forEach((ms) => {
  setTimeout(triggerFullscreen, ms);
});

// 3. User gesture fallback
['click', 'touchstart', 'pointerdown'].forEach((evt) => {
  window.addEventListener(evt, triggerFullscreen, { once: true, passive: true });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
