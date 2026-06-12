import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import { useStore } from '../../store/index.js';
import { useSettings } from '../../hooks/useSettings.js';
import { adminApi } from '../../api/client.js';

const TABS = ['Général', 'Modèles', 'Génération', 'Contexte', 'Confidentialité', 'Sécurité'];

export default function SettingsModal() {
  const { activeModal, closeModal, settings, showToast } = useStore();
  const { saveSettings } = useSettings();
  const [tab, setTab] = useState('Général');
  const [form, setForm] = useState({ ...settings });

  useEffect(() => { setForm({ ...settings }); }, [settings, activeModal]);

  if (activeModal !== 'settings') return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => { saveSettings(form); closeModal(); };

  const handleReloadEnv = async () => {
    try { await adminApi.reloadEnv(); showToast('Variables d\'environnement rechargées', 'success'); }
    catch (e) { showToast('Erreur : ' + e.message, 'error'); }
  };

  return (
    <Modal open title="Paramètres" eyebrow="Configuration" onClose={closeModal} wide>
      <div className="tabs">
        {TABS.map(t => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Général' && (
        <>
          <div className="field">
            <label>Fournisseur par défaut</label>
            <select value={form.defaultProvider} onChange={e => set('defaultProvider', e.target.value)}>
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="openai">GPT (OpenAI)</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </div>
          <div className="field">
            <label>Prompt système global par défaut</label>
            <textarea
              value={form.defaultSystemPrompt || ''}
              onChange={e => set('defaultSystemPrompt', e.target.value)}
              placeholder="Instructions permanentes appliquées à toutes les nouvelles conversations…"
              rows={4}
            />
          </div>
        </>
      )}

      {tab === 'Modèles' && (
        <>
          <p className="modal-warn">
            Ces identifiants sont utilisés par défaut. Vérifiez la documentation de chaque fournisseur
            pour les modèles actuellement disponibles.
          </p>
          <div className="modal-section">Claude (Anthropic)</div>
          <div className="field"><label>Identifiant de modèle</label>
            <input value={form.claudeModel || ''} onChange={e => set('claudeModel', e.target.value)} />
          </div>
          <div className="modal-section">GPT (OpenAI)</div>
          <div className="field"><label>Identifiant de modèle</label>
            <input value={form.gptModel || ''} onChange={e => set('gptModel', e.target.value)} />
          </div>
          <div className="modal-section">Gemini (Google)</div>
          <div className="field-row">
            <div className="field"><label>Modèle texte</label>
              <input value={form.geminiModel || ''} onChange={e => set('geminiModel', e.target.value)} />
            </div>
            <div className="field"><label>Modèle image</label>
              <input value={form.geminiImageModel || ''} onChange={e => set('geminiImageModel', e.target.value)} />
            </div>
          </div>
        </>
      )}

      {tab === 'Génération' && (
        <>
          <div className="field">
            <label>Température ({form.temperature?.toFixed(1)})</label>
            <div className="range-field">
              <input type="range" min="0" max="2" step="0.1"
                value={form.temperature || 0.7}
                onChange={e => set('temperature', parseFloat(e.target.value))} />
              <span className="range-val">{(form.temperature || 0.7).toFixed(1)}</span>
            </div>
            <div className="field-note">0 = déterministe · 1 = équilibré · 2 = créatif</div>
          </div>
          <div className="field">
            <label>Tokens maximum par réponse</label>
            <input type="number" min="256" max="32000" step="256"
              value={form.maxTokens || 4096}
              onChange={e => set('maxTokens', parseInt(e.target.value))} />
          </div>
        </>
      )}

      {tab === 'Contexte' && (
        <>
          <div className="field">
            <label>Stratégie de contexte</label>
            <select value={form.contextStrategy || 'all'} onChange={e => set('contextStrategy', e.target.value)}>
              <option value="all">Garder tout l'historique</option>
              <option value="last_n">Garder les N derniers messages</option>
              <option value="auto_summarize">Résumé automatique à la limite</option>
            </select>
          </div>
          {form.contextStrategy === 'last_n' && (
            <div className="field">
              <label>Nombre de messages à conserver</label>
              <input type="number" min="4" max="200" step="2"
                value={form.contextLastN || 20}
                onChange={e => set('contextLastN', parseInt(e.target.value))} />
            </div>
          )}
          <div className="modal-warn">
            La fenêtre de contexte estime ~4 caractères par token. Claude supporte 200k tokens,
            GPT 128k, Gemini 1M. Un résumé sera proposé automatiquement à 80% d'utilisation.
          </div>
        </>
      )}

      {tab === 'Confidentialité' && (
        <>
          <div className="field">
            <label>Expiration automatique des conversations (jours, 0 = désactivé)</label>
            <input type="number" min="0" max="365"
              value={form.convTtlDays || 0}
              onChange={e => set('convTtlDays', parseInt(e.target.value))} />
            <div className="field-note">Les conversations plus anciennes que cette durée seront supprimées automatiquement.</div>
          </div>
          <div className="field">
            <label>Délai d'inactivité avant verrouillage (minutes, 0 = désactivé)</label>
            <input type="number" min="0" max="480"
              value={form.sessionTimeoutMin || 0}
              onChange={e => set('sessionTimeoutMin', parseInt(e.target.value))} />
          </div>
          <div className="field">
            <label>Taille maximale des pièces jointes (Mo)</label>
            <input type="number" min="1" max="100"
              value={form.maxFileSizeMb || 10}
              onChange={e => set('maxFileSizeMb', parseInt(e.target.value))} />
          </div>
        </>
      )}

      {tab === 'Sécurité' && (
        <>
          <p className="modal-warn">
            Les clés API sont stockées dans le fichier <code>.env</code> côté serveur et
            ne transitent jamais dans le navigateur.
          </p>
          <div className="modal-section">Rechargement des variables d'environnement</div>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
            Permet de mettre à jour les clés API sans redémarrer le serveur.
          </p>
          <button className="btn btn-primary" onClick={handleReloadEnv}>
            Recharger .env
          </button>
        </>
      )}

      <div className="modal-btns">
        <button className="btn" onClick={closeModal}>Annuler</button>
        <button className="btn btn-primary" onClick={handleSave}>Enregistrer</button>
      </div>
    </Modal>
  );
}
