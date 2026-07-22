import React from 'react';
import ReactDOM from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './index.css';

// Register service worker — web/PWA only. Inside a Capacitor native WebView
// (WKWebView on iOS, especially) the native bridge already serves the app
// assets, and a service worker intercepting fetches conflicts with it and can
// pin stale assets, so we skip registration on native platforms.
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available — reload silently
              window.location.reload();
            }
          });
        });
      })
      .catch(console.error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
