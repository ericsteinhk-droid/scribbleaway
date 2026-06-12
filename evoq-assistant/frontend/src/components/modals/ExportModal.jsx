import React, { useState } from 'react';
import Modal from '../common/Modal.jsx';
import { useStore } from '../../store/index.js';
import { exportAsMarkdown, exportAsJson, exportAllAsZip, parseChatGPTExport } from '../../utils/exportUtils.js';
import { msgApi, convApi } from '../../api/client.js';

export default function ExportModal() {
  const { activeModal, closeModal, activeConvId, conversations, messages: allMessages, showToast, addConversation, setActiveConvId } = useStore();
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef();

  if (activeModal !== 'export') return null;

  const conv = conversations.find(c => c.id === activeConvId);
  const messages = activeConvId ? (allMessages[activeConvId] || []) : [];

  const handleExportMd = () => {
    if (!conv) { showToast('Aucune conversation active', 'error'); return; }
    exportAsMarkdown(conv, messages);
    closeModal();
  };

  const handleExportJson = () => {
    if (!conv) { showToast('Aucune conversation active', 'error'); return; }
    exportAsJson(conv, messages);
    closeModal();
  };

  const handleExportAll = async () => {
    await exportAllAsZip(conversations, async (id) => {
      if (allMessages[id]) return allMessages[id];
      try { return await msgApi.list(id); } catch { return []; }
    });
    closeModal();
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = parseChatGPTExport(json);
      for (const item of imported) {
        const res = await convApi.create({ title: item.title });
        addConversation(res);
        // We'd need to post messages too — simplified here
      }
      showToast(`${imported.length} conversation(s) importée(s)`, 'success');
      closeModal();
    } catch (err) {
      showToast('Erreur importation : ' + err.message, 'error');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <Modal open title="Export · Import" eyebrow="Données" onClose={closeModal}>
      <div className="modal-section">Exporter la conversation active</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button className="btn" onClick={handleExportMd} disabled={!conv}>Markdown (.md)</button>
        <button className="btn" onClick={handleExportJson} disabled={!conv}>JSON</button>
      </div>
      {!conv && <p className="field-note">Sélectionnez une conversation dans le panneau latéral.</p>}

      <div className="modal-section">Tout exporter</div>
      <button className="btn" onClick={handleExportAll}>
        Exporter toutes les conversations (.zip)
      </button>

      <div className="modal-section">Importer depuis ChatGPT</div>
      <p className="field-note" style={{ marginBottom: 8 }}>
        Importez un fichier d'export ChatGPT (format JSON) pour migrer vos conversations.
      </p>
      <input ref={fileInputRef} type="file" accept=".json" hidden onChange={handleImport} />
      <button className="btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
        {importing ? 'Importation…' : 'Choisir un fichier JSON'}
      </button>

      <div className="modal-btns">
        <button className="btn" onClick={closeModal}>Fermer</button>
      </div>
    </Modal>
  );
}
