import React, { useState, useCallback } from 'react';
import Modal from '../common/Modal.jsx';
import { useStore } from '../../store/index.js';
import { streamChat } from '../../api/client.js';
import { renderMarkdown } from '../../utils/markdown.js';

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'openai',    label: 'GPT'    },
  { id: 'gemini',    label: 'Gemini' },
];

function CompareColumn({ provider, label, content, streaming }) {
  const html = content ? renderMarkdown(content) : '';
  return (
    <div className="compare-col">
      <div className="compare-col-header" data-p={provider}>
        {label}
        {streaming && <span className="streaming-dot" style={{ marginLeft: 6 }} />}
      </div>
      <div className="compare-col-body">
        {html
          ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <span style={{ color: 'var(--faint)', fontSize: 13 }}>En attente…</span>
        }
      </div>
    </div>
  );
}

export default function CompareModal() {
  const { activeModal, closeModal, settings } = useStore();
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState(['anthropic', 'openai', 'gemini']);
  const [results, setResults] = useState({});
  const [streaming, setStreaming] = useState({});
  const [running, setRunning] = useState(false);
  const aborts = React.useRef({});

  if (activeModal !== 'compare') return null;

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const modelFor = (p) => {
    if (p === 'anthropic') return settings.claudeModel;
    if (p === 'openai')    return settings.gptModel;
    return settings.geminiModel;
  };

  const run = useCallback(async () => {
    if (!prompt.trim() || running) return;
    setResults({});
    setStreaming({});
    setRunning(true);

    const msgs = [{ role: 'user', content: prompt }];

    await Promise.all(selected.map(async (p) => {
      setStreaming(s => ({ ...s, [p]: true }));
      const ctrl = new AbortController();
      aborts.current[p] = ctrl;
      let text = '';

      await streamChat(
        { provider: p, model: modelFor(p), messages: msgs, temperature: settings.temperature, maxTokens: settings.maxTokens },
        (chunk) => {
          text += chunk;
          setResults(r => ({ ...r, [p]: text }));
        },
        () => { setStreaming(s => ({ ...s, [p]: false })); },
        () => { setStreaming(s => ({ ...s, [p]: false })); },
        ctrl.signal,
      );
    }));

    setRunning(false);
  }, [prompt, selected, settings, running]);

  const stop = () => {
    Object.values(aborts.current).forEach(c => c?.abort());
    setRunning(false);
    setStreaming({});
  };

  const clear = () => { setResults({}); setPrompt(''); };

  return (
    <Modal open title="Comparaison de modèles" eyebrow="Mode comparaison" onClose={closeModal} wide>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {PROVIDERS.map(p => (
          <button
            key={p.id}
            className={`route-btn${selected.includes(p.id) ? ' active' : ''}`}
            data-p={p.id}
            onClick={() => toggle(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Message à envoyer à tous les modèles sélectionnés…"
        style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--surface)', padding: '10px 12px', fontSize: 14, resize: 'vertical', minHeight: 80, outline: 'none', color: 'var(--ink)', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={run} disabled={running || !prompt.trim() || !selected.length}>
          {running ? 'Génération en cours…' : 'Comparer'}
        </button>
        {running && <button className="btn btn-danger" onClick={stop}>Interrompre</button>}
        {Object.keys(results).length > 0 && <button className="btn" onClick={clear}>Effacer</button>}
      </div>

      {selected.length > 0 && (
        <div className="compare-grid" style={{ minHeight: Object.keys(results).length > 0 ? 300 : 0 }}>
          {selected.map(p => {
            const prov = PROVIDERS.find(x => x.id === p);
            return (
              <CompareColumn
                key={p}
                provider={p}
                label={prov?.label || p}
                content={results[p] || ''}
                streaming={!!streaming[p]}
              />
            );
          })}
        </div>
      )}

      <div className="modal-btns">
        <button className="btn" onClick={closeModal}>Fermer</button>
      </div>
    </Modal>
  );
}
