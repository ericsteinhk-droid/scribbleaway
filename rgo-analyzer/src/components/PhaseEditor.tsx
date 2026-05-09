import { useState } from 'react'
import { useScheduleStore } from '../store/scheduleStore'
import type { Phase } from '../types'

export function PhaseEditor() {
  const { setPhaseEditorOpen, getComputedPhases, setPhases, resetPhases, getPairKey } =
    useScheduleStore()
  const pairKey = getPairKey()
  const phases = getComputedPhases()
  const [localPhases, setLocalPhases] = useState<Phase[]>(phases)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftLabel, setDraftLabel] = useState('')

  function commitLabel(id: string) {
    if (draftLabel.trim()) {
      setLocalPhases((ps) => ps.map((p) => (p.id === id ? { ...p, label: draftLabel.trim() } : p)))
    }
    setEditingId(null)
  }

  function saveChanges() {
    setPhases(pairKey, localPhases)
    setPhaseEditorOpen(false)
  }

  function resetToAuto() {
    resetPhases(pairKey)
    setPhaseEditorOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPhaseEditorOpen(false)}>
      <div
        className="bg-[#131929] border border-[#1e2d45] rounded-lg w-[600px] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#1e2d45]">
          <h2 className="text-[#e2e8f0] text-lg font-semibold">Éditeur de phases</h2>
          <button onClick={() => setPhaseEditorOpen(false)} className="text-[#64748b] hover:text-[#e2e8f0] text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {localPhases.map((phase, idx) => (
            <div key={phase.id} className="border border-[#1e2d45] rounded bg-[#1a2235] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-[#0b0f1a]">
                <span className="text-[#64748b] text-xs">#{idx + 1}</span>
                {editingId === phase.id ? (
                  <input
                    autoFocus
                    value={draftLabel}
                    onChange={(e) => setDraftLabel(e.target.value)}
                    onBlur={() => commitLabel(phase.id)}
                    onKeyDown={(e) => e.key === 'Enter' && commitLabel(phase.id)}
                    className="flex-1 bg-[#131929] text-[#e2e8f0] text-sm px-1 rounded border border-[#38bdf8] outline-none"
                  />
                ) : (
                  <span
                    className="flex-1 text-[#e2e8f0] text-sm font-medium cursor-pointer hover:text-[#38bdf8]"
                    onDoubleClick={() => { setEditingId(phase.id); setDraftLabel(phase.label) }}
                    title="Double-cliquer pour renommer"
                  >
                    {phase.label}
                  </span>
                )}
                <span className="text-[#64748b] text-xs">{phase.taskNames.length} tâches</span>
                <div className="flex gap-1">
                  {idx > 0 && (
                    <button
                      onClick={() => {
                        const ps = [...localPhases]
                        const prev = ps[idx - 1]
                        const merged: Phase = {
                          ...prev,
                          taskNames: [...prev.taskNames, ...phase.taskNames],
                        }
                        ps.splice(idx - 1, 2, merged)
                        setLocalPhases(ps)
                      }}
                      className="text-[#64748b] hover:text-[#a78bfa] text-xs px-1.5 py-0.5 rounded border border-[#1e2d45]"
                      title="Fusionner avec la phase précédente"
                    >
                      ↑ Fusionner
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 py-2 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {phase.taskNames.slice(0, 30).map((name) => (
                  <span key={name} className="text-[#64748b] text-xs bg-[#131929] px-1.5 py-0.5 rounded truncate max-w-[200px]">
                    {name}
                  </span>
                ))}
                {phase.taskNames.length > 30 && (
                  <span className="text-[#64748b] text-xs italic">+{phase.taskNames.length - 30} autres</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-[#1e2d45] flex justify-between">
          <button
            onClick={resetToAuto}
            className="text-[#64748b] text-sm hover:text-[#f87171]"
          >
            Réinitialiser (auto-détection)
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => setPhaseEditorOpen(false)}
              className="px-3 py-1.5 text-sm text-[#64748b] border border-[#1e2d45] rounded hover:text-[#e2e8f0]"
            >
              Annuler
            </button>
            <button
              onClick={saveChanges}
              className="px-4 py-1.5 bg-[#38bdf8] text-[#0b0f1a] text-sm rounded font-medium hover:bg-[#7dd3fc]"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
