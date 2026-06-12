import React from 'react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      {message && <p style={{ color: 'var(--muted)', fontSize: 14, margin: '10px 0 20px' }}>{message}</p>}
      <div className="modal-btns">
        <button className="btn" onClick={onCancel}>Annuler</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirmer</button>
      </div>
    </Modal>
  );
}
