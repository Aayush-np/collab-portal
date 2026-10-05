import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import App from './App.jsx'
import favicon from './img/favicon.png'
import './index.css'

// Wire the favicon (works in dev and the production build — Vite bundles it).
const setFavicon = (href) => {
  let link = document.querySelector("link[rel='icon']") || document.querySelector("link[rel='shortcut icon']");
  if (!link) {
    link = document.createElement('link');
    document.head.appendChild(link);
  }
  link.rel = 'icon';
  link.type = 'image/png';
  link.href = href;
};
setFavicon(favicon);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>
)
