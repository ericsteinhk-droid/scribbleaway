import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { useApiKeys } from '../../context/ApiKeysContext'
import { useToast } from '../ui/Toast'

const SERVICES = [
  {
    id: 'anthropic',
    label: 'Clé API Anthropic (Claude)',
    placeholder: 'sk-ant-api03-…',
    hint: 'Utilisée pour la reformulation IA des notes',
    link: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'Clé API OpenAI (Whisper)',
    placeholder: 'sk-proj-…',
    hint: 'Utilisée pour la transcription vocale',
    link: 'https://platform.openai.com/api-keys',
  },
]

export function SettingsModal({ open, onClose }) {
  const { keys, setKey } = useApiKeys()
  const toast = useToast()
  const [draft, setDraft] = useState({})
  const [visible, setVisible] = useState({})

  function handleSave(id) {
    if (draft[id] !== undefined) {
      setKey(id, draft[id])
      setDraft((prev) => { const next = { ...prev }; delete next[id]; return next })
      toast('Clé sauvegardée localement.', 'success')
    }
  }

  function handleChange(id, value) {
    setDraft((prev) => ({ ...prev, [id]: value }))
  }

  function currentValue(id) {
    return draft[id] !== undefined ? draft[id] : keys[id]
  }

  return (
    <Modal open={open} onClose={onClose} title="Paramètres — Clés API">
      <div className="space-y-5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Les clés sont stockées uniquement dans votre navigateur (localStorage) et ne quittent jamais votre appareil.
        </p>

        {SERVICES.map(({ id, label, placeholder, hint, link }) => (
          <div key={id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</label>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
              >
                Obtenir une clé →
              </a>
            </div>

            <div className="flex gap-2">
              <input
                type={visible[id] ? 'text' : 'password'}
                value={currentValue(id)}
                onChange={(e) => handleChange(id, e.target.value)}
                placeholder={placeholder}
                className="input flex-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setVisible((p) => ({ ...p, [id]: !p[id] }))}
                className="btn-ghost p-2 rounded-xl shrink-0"
                aria-label="Afficher / masquer"
              >
                {visible[id] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{hint}</p>
              {draft[id] !== undefined && (
                <button
                  type="button"
                  onClick={() => handleSave(id)}
                  className="btn-primary py-1 px-3 text-xs"
                >
                  Enregistrer
                </button>
              )}
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">Fermer</button>
        </div>
      </div>
    </Modal>
  )
}
