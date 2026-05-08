import { useState } from 'react'
import { useScheduleStore } from '../store/scheduleStore'

export function SettingsPanel() {
  const { settings, updateSettings, resetSettings, setSettingsOpen } = useScheduleStore()
  const [newKeyword, setNewKeyword] = useState('')

  function addKeyword() {
    const kw = newKeyword.trim()
    if (kw && !settings.shortTaskKeywords.includes(kw)) {
      updateSettings({ shortTaskKeywords: [...settings.shortTaskKeywords, kw] })
    }
    setNewKeyword('')
  }

  function removeKeyword(kw: string) {
    updateSettings({ shortTaskKeywords: settings.shortTaskKeywords.filter((k) => k !== kw) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSettingsOpen(false)}>
      <div
        className="bg-[#131929] border border-[#1e2d45] rounded-lg w-[520px] max-h-[80vh] overflow-y-auto p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[#e2e8f0] text-lg font-semibold">Paramètres / Settings</h2>
          <button onClick={() => setSettingsOpen(false)} className="text-[#64748b] hover:text-[#e2e8f0] text-xl">✕</button>
        </div>

        <div className="space-y-4">
          <NumberField
            label="Seuil glissement (jours cal.) / Slippage threshold (cal. days)"
            value={settings.slippageThresholdDays}
            onChange={(v) => updateSettings({ slippageThresholdDays: v })}
            min={0}
          />
          <NumberField
            label="Seuil Δdurée (jours trav.) / Duration change threshold (working days)"
            value={settings.durationChangeThresholdDays}
            onChange={(v) => updateSettings({ durationChangeThresholdDays: v })}
            min={0}
          />
          <NumberField
            label="Signal en-tête de phase (j) / Phase header duration signal (d)"
            value={settings.phaseHeaderDurationSignal}
            onChange={(v) => updateSettings({ phaseHeaderDurationSignal: v })}
            min={10}
          />
          <NumberField
            label="Alerte durée courte (j) / Short task alert threshold (d)"
            value={settings.shortTaskAlertThreshold}
            onChange={(v) => updateSettings({ shortTaskAlertThreshold: v })}
            min={1}
          />
          <NumberField
            label="Alerte glissement jalon (j) / Milestone slippage alert (d)"
            value={settings.milestoneSlippageAlertThreshold}
            onChange={(v) => updateSettings({ milestoneSlippageAlertThreshold: v })}
            min={0}
          />

          <div>
            <label className="block text-[#64748b] text-xs mb-1">
              Langue du rapport / Report language
            </label>
            <div className="flex gap-2">
              {(['fr', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => updateSettings({ reportLanguage: lang })}
                  className={`px-3 py-1 rounded text-sm ${settings.reportLanguage === lang ? 'bg-[#38bdf8] text-[#0b0f1a]' : 'bg-[#1a2235] text-[#64748b] border border-[#1e2d45]'}`}
                >
                  {lang === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#64748b] text-xs mb-1">
              Hauteur barres timeline / Timeline bar height
            </label>
            <div className="flex gap-2">
              {(['compact', 'normal', 'spacious'] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => updateSettings({ timelineBarHeight: h })}
                  className={`px-3 py-1 rounded text-sm capitalize ${settings.timelineBarHeight === h ? 'bg-[#38bdf8] text-[#0b0f1a]' : 'bg-[#1a2235] text-[#64748b] border border-[#1e2d45]'}`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#64748b] text-xs mb-2">
              Mots-clés complexité / Complexity keywords
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {settings.shortTaskKeywords.map((kw) => (
                <span key={kw} className="flex items-center gap-1 bg-[#1a2235] text-[#e2e8f0] text-xs px-2 py-0.5 rounded-full border border-[#1e2d45]">
                  {kw}
                  <button onClick={() => removeKeyword(kw)} className="text-[#64748b] hover:text-[#f87171] ml-0.5">✕</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                placeholder="Ajouter un mot-clé..."
                className="flex-1 bg-[#0b0f1a] text-[#e2e8f0] text-sm px-2 py-1 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8]"
              />
              <button
                onClick={addKeyword}
                className="px-3 py-1 bg-[#1a2235] text-[#38bdf8] text-sm rounded border border-[#38bdf8] hover:bg-[#38bdf8] hover:text-[#0b0f1a]"
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[#1e2d45] flex justify-between">
          <button
            onClick={resetSettings}
            className="text-[#64748b] text-sm hover:text-[#f87171]"
          >
            Réinitialiser les paramètres
          </button>
          <button
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-1.5 bg-[#38bdf8] text-[#0b0f1a] text-sm rounded font-medium hover:bg-[#7dd3fc]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
}) {
  return (
    <div>
      <label className="block text-[#64748b] text-xs mb-1">{label}</label>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 bg-[#0b0f1a] text-[#e2e8f0] text-sm px-2 py-1 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8]"
      />
    </div>
  )
}
