import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import { useStore } from '../../store/index.js';
import { adminApi } from '../../api/client.js';

export default function AdminPanel() {
  const { activeModal, closeModal, showToast } = useStore();
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeModal !== 'admin') return;
    setLoading(true);
    Promise.all([
      adminApi.stats().then(setStats).catch(() => {}),
      adminApi.auditLog().then(data => setAudit(Array.isArray(data) ? data : [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [activeModal]);

  if (activeModal !== 'admin') return null;

  const handleReload = async () => {
    try { await adminApi.reloadEnv(); showToast('.env rechargé', 'success'); }
    catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  };

  const handleTtl = async () => {
    try { await adminApi.runTtl(); showToast('Nettoyage TTL effectué', 'success'); }
    catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  };

  const exportAudit = () => {
    const csv = ['Horodatage,Fournisseur,Modèle,Tokens in,Tokens out']
      .concat(audit.map(r => [new Date(r.ts).toISOString(), r.provider, r.model, r.tokenInput || '', r.tokenOutput || ''].join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'audit.csv' }).click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Modal open title="Administration" eyebrow="Tableau de bord" onClose={closeModal} wide>
      {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement…</p>}

      {stats && (
        <>
          <div className="modal-section">Statistiques d'utilisation</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 10 }}>
            {[
              ['Conversations', stats.conversationCount],
              ['Messages', stats.messageCount],
              ['Tokens (entrée)', stats.totalInputTokens?.toLocaleString()],
              ['Tokens (sortie)', stats.totalOutputTokens?.toLocaleString()],
              ['Coût estimé', stats.totalCostUsd != null ? `$${stats.totalCostUsd.toFixed(4)}` : '—'],
            ].map(([label, val]) => (
              <div key={label} style={{ border: '1px solid var(--border)', padding: '10px 14px', background: 'var(--surface)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="modal-section">Actions</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button className="btn" onClick={handleReload}>Recharger .env</button>
        <button className="btn" onClick={handleTtl}>Nettoyage TTL</button>
        {audit.length > 0 && <button className="btn" onClick={exportAudit}>Exporter audit CSV</button>}
      </div>

      <div className="modal-section">Journal d'audit (dernières 50 entrées)</div>
      <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8 }}>
        Ce journal enregistre uniquement l'horodatage, le fournisseur et les comptages de tokens —
        jamais le contenu des messages.
      </p>
      {audit.length > 0 ? (
        <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
          <table className="audit-table">
            <thead>
              <tr>
                <th>Horodatage</th>
                <th>Fournisseur</th>
                <th>Modèle</th>
                <th>Tokens in</th>
                <th>Tokens out</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td>{new Date(r.ts).toLocaleString('fr-CA')}</td>
                  <td>{r.provider}</td>
                  <td style={{ fontSize: 11 }}>{r.model}</td>
                  <td>{r.tokenInput || '—'}</td>
                  <td>{r.tokenOutput || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--faint)', fontSize: 13 }}>Aucune entrée dans le journal.</p>
      )}

      <div className="modal-btns">
        <button className="btn" onClick={closeModal}>Fermer</button>
      </div>
    </Modal>
  );
}
