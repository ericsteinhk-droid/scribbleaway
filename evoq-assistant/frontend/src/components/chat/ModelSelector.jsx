import React from 'react';
import { useStore } from '../../store/index.js';

const PROVIDERS = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'openai',    label: 'GPT'    },
  { id: 'gemini',    label: 'Gemini' },
];

export default function ModelSelector({ hasImage }) {
  const { currentProvider, currentModel, settings, setCurrentProvider, setCurrentModel } = useStore();

  const modelsFor = (provider) => {
    if (provider === 'anthropic') return [
      { id: settings.claudeModel, label: 'Opus 4.5' },
      { id: 'claude-sonnet-4-5-20251022', label: 'Sonnet 4.5' },
      { id: 'claude-haiku-4-5-20251001',  label: 'Haiku 4.5'  },
    ];
    if (provider === 'openai') return [
      { id: settings.gptModel, label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    ];
    if (provider === 'gemini') return [
      { id: settings.geminiModel, label: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro' },
    ];
    return [];
  };

  return (
    <div className="route-row">
      <span className="route-label">Modèle</span>
      {PROVIDERS.map(p => (
        <button
          key={p.id}
          className={`route-btn${currentProvider === p.id ? ' active' : ''}`}
          data-p={p.id}
          onClick={() => setCurrentProvider(p.id)}
          title={`Utiliser ${p.label}`}
        >
          {p.label}
        </button>
      ))}
      {hasImage && (
        <span className="image-badge visible">🖼 Image → Gemini</span>
      )}
    </div>
  );
}
