import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// ── Global UX fix: select-all on focus for every number input ──────────────
// When a number field has value 0 (or any default), clicking it selects
// the existing text so the user's first keystroke replaces it instead of
// appending to it (avoiding "015" when typing "15" into a field showing "0").
document.addEventListener(
  'focus',
  (e) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLInputElement && el.type === 'number') {
      el.select();
    }
  },
  true, // capture phase so it fires before React's own handlers
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
