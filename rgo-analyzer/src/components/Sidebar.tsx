import { useScheduleStore } from '../store/scheduleStore'
import { RevisionList } from './RevisionList'

export function Sidebar() {
  const {
    loadFile,
    comparisonPair,
    revisions,
    setComparisonPair,
    isLoading,
    loadError,
    setSettingsOpen,
    setPhaseEditorOpen,
  } = useScheduleStore()

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const buf = await file.arrayBuffer()
      await loadFile(file.name, buf)
    }
  }

  async function handleFileButton() {
    if (window.electronAPI) {
      const files = await window.electronAPI.openFileDialog()
      for (const { path: filePath, buffer } of files) {
        const filename = filePath.split('/').pop() || filePath.split('\\').pop() || filePath
        await loadFile(filename, buffer)
      }
    }
  }

  const validPairs = revisions.length >= 2
    ? revisions.flatMap((a, i) =>
        revisions.slice(i + 1).map((b) => ({ revisionAId: a.id, revisionBId: b.id }))
      )
    : []

  function pairLabel(aId: string, bId: string) {
    const a = revisions.find((r) => r.id === aId)
    const b = revisions.find((r) => r.id === bId)
    return `${a?.label ?? '?'} → ${b?.label ?? '?'}`
  }

  return (
    <aside className="w-[260px] min-w-[260px] flex flex-col bg-[#131929] border-r border-[#1e2d45] overflow-y-auto">
      <div className="p-4 border-b border-[#1e2d45]">
        <div className="text-[#38bdf8] font-semibold text-base tracking-tight">Schedule Analyzer</div>
        <div className="text-[#64748b] text-xs mt-0.5">Comparateur multi-révisions</div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-4">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-[#1e2d45] rounded-lg p-4 text-center hover:border-[#38bdf8] transition-colors cursor-pointer"
          onClick={handleFileButton}
        >
          {isLoading ? (
            <div className="text-[#38bdf8] text-sm">Chargement...</div>
          ) : (
            <>
              <div className="text-2xl mb-1">📂</div>
              <div className="text-[#e2e8f0] text-sm">Déposer des fichiers ZIP/PDF</div>
              <div className="text-[#64748b] text-xs mt-1">ou cliquer pour parcourir</div>
            </>
          )}
        </div>

        {loadError && (
          <div className="text-[#f87171] text-xs bg-[#1a2235] p-2 rounded border border-[#f87171]/30">
            Erreur: {loadError}
          </div>
        )}

        <RevisionList />

        {revisions.length >= 2 && (
          <div>
            <div className="text-[#64748b] text-xs uppercase tracking-wider mb-2">Comparaison A → B</div>
            <select
              className="w-full bg-[#0b0f1a] text-[#e2e8f0] text-sm px-2 py-1.5 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8]"
              value={comparisonPair ? `${comparisonPair.revisionAId}__${comparisonPair.revisionBId}` : ''}
              onChange={(e) => {
                const [aId, bId] = e.target.value.split('__')
                setComparisonPair({ revisionAId: aId, revisionBId: bId })
              }}
            >
              {validPairs.map((p) => (
                <option key={`${p.revisionAId}__${p.revisionBId}`} value={`${p.revisionAId}__${p.revisionBId}`}>
                  {pairLabel(p.revisionAId, p.revisionBId)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-[#1e2d45] flex gap-2">
        <button
          onClick={() => setPhaseEditorOpen(true)}
          disabled={revisions.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-[#64748b] hover:text-[#e2e8f0] border border-[#1e2d45] rounded hover:border-[#a78bfa] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Éditeur de phases"
        >
          <span>⊞</span> Phases
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-[#64748b] hover:text-[#e2e8f0] border border-[#1e2d45] rounded hover:border-[#38bdf8]"
          title="Paramètres"
        >
          <span>⚙</span> Paramètres
        </button>
      </div>
    </aside>
  )
}
