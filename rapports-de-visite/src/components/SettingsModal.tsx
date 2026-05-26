import { useState } from 'react';
import Modal from './Modal';

interface Props {
  onClose: () => void;
}

function ApiKeyField({
  label,
  storageKey,
  helpUrl,
}: {
  label: string;
  storageKey: string;
  helpUrl: string;
}) {
  const [value, setValue] = useState(() => localStorage.getItem(storageKey) ?? '');
  const [show, setShow] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  function handleChange(v: string) {
    setValue(v);
    setDirty(true);
    setSaved(false);
  }

  function handleSave() {
    localStorage.setItem(storageKey, value);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="sk-…"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-evoq"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Masquer' : 'Afficher'}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            {show ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            className="px-3 py-2 bg-evoq text-white text-sm rounded-lg hover:bg-evoq-dark transition-colors"
          >
            {saved ? '✓' : 'Sauvegarder'}
          </button>
        )}
      </div>
      <a
        href={helpUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-evoq hover:underline mt-1 inline-block"
      >
        Obtenir une clé API →
      </a>
    </div>
  );
}

export default function SettingsModal({ onClose }: Props) {
  return (
    <Modal title="Paramètres" onClose={onClose}>
      <ApiKeyField
        label="Clé API Anthropic (reformatage IA)"
        storageKey="rdv-anthropic-key"
        helpUrl="https://console.anthropic.com/account/keys"
      />
      <ApiKeyField
        label="Clé API OpenAI (dictée vocale)"
        storageKey="rdv-openai-key"
        helpUrl="https://platform.openai.com/api-keys"
      />
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 leading-relaxed">
        Les clés API sont stockées uniquement dans votre navigateur (localStorage) et ne sont jamais
        envoyées à un serveur autre que le fournisseur IA respectif.
      </p>
    </Modal>
  );
}
