import React from 'react';
import { useStore } from '../../store/index.js';

export default function ToastContainer() {
  const { toasts, hideToast } = useStore();

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast ${t.type === 'error' ? 'error' : t.type === 'success' ? 'success' : ''}`}
          onClick={() => hideToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
