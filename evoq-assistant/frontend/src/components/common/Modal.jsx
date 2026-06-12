import React, { useEffect } from 'react';

export default function Modal({ open, onClose, title, eyebrow, children, wide, topColor }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal-box${wide ? ' settings-modal' : ''}`}
           style={topColor ? { borderTopColor: topColor } : undefined}>
        <button className="modal-close" onClick={onClose} title="Fermer">✕</button>
        {eyebrow && <div className="eyebrow" style={{ color: topColor, marginBottom: 4 }}>{eyebrow}</div>}
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
