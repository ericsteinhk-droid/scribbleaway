import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import { useStore } from '../../store/index.js';
import { useSettings } from '../../hooks/useSettings.js';
import { convApi } from '../../api/client.js';

export default function PromptLibraryModal() {
  const { activeModal, closeModal, promptLibrary, activeConvId, updateConversation, showToast } = useStore();
  const { addPrompt, deletePrompt, loadPromptLibrary } = useSettings();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => { if (activeModal === 'prompts') loadPromptLibrary(); }, [activeModal]);

  if (activeModal !== 'prompts') return null;

  const filtered = search.trim()
    ? promptLibrary.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.content.toLowerCase().includes(search.toLowerCase()))
    : promptLibrary;

  const handleAdd = async () => {
    if (!name.trim() || !content.trim()) { showToast('Nom et contenu requis', 'error'); return; }
    await addPrompt(name.trim(), content.trim());
    setName(''); setContent('');
  };

  const handleApply = async (p) => {
    if (!activeConvId) { showToast('Sélectionnez une conversation d\'abord', 'error'); return; }
    try {
      await convApi.update(activeConvId, { systemPrompt: p.content });
      updateConversation(activeConvId, { systemPrompt: p.content });
      showToast(`Prompt « ${p.name} » appliqué`, 'success');
      closeModal();
    } catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  };

  return (
    <Modal open title="Bibliothèque de prompts" eyebrow="Prompts système" onClose={closeModal} wide>
      {/* Search */}
      <input
        placeholder="Rechercher…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', border: '1px solid var(--border)', padding: '8px 12px', marginBottom: 14, background: 'var(--surface)', fontSize: 13, outline: 'none', color: 'var(--ink)' }}
      />

      {/* Saved prompts */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {filtered.map(p => (
          <div key={p.id} className="prompt-item">
            <div style={{ flex: 1 }}>
              <div className="p-name">{p.name}</div>
              <div className="p-preview">{p.content}</div>
            </div>
            <div className="p-actions">
              <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 10 }} onClick={() => handleApply(p)}>
                Appliquer
              </button>
              <button className="btn" style={{ padding: '4px 10px', fontSize: 10, color: 'var(--error)' }} onClick={() => deletePrompt(p.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
        {!filtered.length && (
          <p style={{ color: 'var(--faint)', fontSize: 13, padding: '12px 0' }}>
            {search ? 'Aucun résultat' : 'Aucun prompt enregistré. Créez-en un ci-dessous.'}
          </p>
        )}
      </div>

      {/* Add new */}
      <div className="modal-section">Nouveau prompt</div>
      <div className="field">
        <label>Nom</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex. : Architecte patrimonial" />
      </div>
      <div className="field">
        <label>Contenu du prompt</label>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
          placeholder="Tu es un expert en conservation du patrimoine architectural…" />
      </div>
      <div className="modal-btns">
        <button className="btn" onClick={closeModal}>Fermer</button>
        <button className="btn btn-primary" onClick={handleAdd}>Enregistrer</button>
      </div>
    </Modal>
  );
}
