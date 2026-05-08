import { useMemo } from 'react'
import { useScheduleStore } from '../store/scheduleStore'
import type { Revision } from '../types'
import { matchTasks } from '../lib/matcher'
import { buildPhaseMap } from '../lib/phaseDetector'
import { compareRevisions } from '../lib/comparator'

function sign(n: number) { return n >= 0 ? `+${n}` : `${n}` }
function fmtDate(d: Date) { return d.toLocaleDateString('fr-CA') }

const STATUS_COLORS: Record<string, string> = {
  STABLE: '#38bdf8', SLIPPED: '#f59e0b', EXTENDED: '#a78bfa',
  ACCELERATED: '#4ade80', COMPRESSED: '#4ade80', NEW: '#4ade80', REMOVED: '#f87171',
}

export function TaskDrawer() {
  const { selectedTaskName, setSelectedTask, revisions, settings, taskNotes, setTaskNote, getComputedPhases } =
    useScheduleStore()

  const note = taskNotes.find((n) => n.taskName === selectedTaskName)?.note ?? ''

  const history = useMemo(() => {
    if (!selectedTaskName) return []
    const phases = getComputedPhases()
    const phaseMap = buildPhaseMap(phases)
    const result: Array<{
      revA: Revision
      revB: Revision
      deltaEnd: number | null
      deltaDur: number | null
      status: string
      endA: Date | null
      endB: Date | null
    }> = []
    for (let i = 0; i < revisions.length - 1; i++) {
      const revA = revisions[i]
      const revB = revisions[i + 1]
      const matches = matchTasks(revA.tasks, revB.tasks)
      const compared = compareRevisions(matches, phaseMap, settings)
      const t = compared.find((c) => c.name === selectedTaskName)
      if (t) {
        result.push({
          revA,
          revB,
          deltaEnd: t.deltaEnd,
          deltaDur: t.deltaDur,
          status: t.status,
          endA: t.taskA?.endDate ?? null,
          endB: t.taskB?.endDate ?? null,
        })
      }
    }
    return result
  }, [selectedTaskName, revisions, settings, getComputedPhases])

  if (!selectedTaskName) return null

  const currentTask = revisions.at(-1)?.tasks.find((t) => t.name === selectedTaskName)

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[380px] bg-[#131929] border-l border-[#1e2d45] z-40 flex flex-col shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-[#1e2d45]">
        <h3 className="text-[#e2e8f0] font-medium text-sm flex-1 pr-2">{selectedTaskName}</h3>
        <button onClick={() => setSelectedTask(null)} className="text-[#64748b] hover:text-[#e2e8f0] text-xl">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {currentTask && (
          <div className="bg-[#1a2235] rounded p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-[#64748b]">Durée</span>
              <span className="text-[#e2e8f0] font-mono">{currentTask.duration}j</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">Début</span>
              <span className="text-[#e2e8f0] font-mono">{fmtDate(currentTask.startDate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#64748b]">Fin</span>
              <span className="text-[#e2e8f0] font-mono">{fmtDate(currentTask.endDate)}</span>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div>
            <div className="text-[#64748b] text-xs uppercase tracking-wider mb-2">Historique</div>
            <div className="space-y-1.5">
              {history.map((h, i) => (
                <div key={i} className="bg-[#1a2235] rounded p-2.5 text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[#64748b]">{h.revA.label} → {h.revB.label}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ background: STATUS_COLORS[h.status] + '33', color: STATUS_COLORS[h.status] }}
                    >
                      {h.status}
                    </span>
                  </div>
                  <div className="flex gap-3 font-mono">
                    <span className="text-[#64748b]">Δfin: <span style={{ color: (h.deltaEnd ?? 0) > 3 ? '#f59e0b' : '#4ade80' }}>{h.deltaEnd !== null ? sign(h.deltaEnd) + 'j' : '—'}</span></span>
                    <span className="text-[#64748b]">Δdur: <span className="text-[#e2e8f0]">{h.deltaDur !== null ? sign(h.deltaDur) + 'j' : '—'}</span></span>
                    {h.endB && <span className="text-[#64748b]">Fin B: <span className="text-[#e2e8f0]">{fmtDate(h.endB)}</span></span>}
                  </div>
                </div>
              ))}
            </div>

            {history.length >= 2 && (
              <DeltaSparkline history={history} />
            )}
          </div>
        )}

        <div>
          <div className="text-[#64748b] text-xs uppercase tracking-wider mb-2">Notes</div>
          <textarea
            value={note}
            onChange={(e) => setTaskNote(selectedTaskName, e.target.value)}
            placeholder="Ajouter des notes pour cette tâche..."
            rows={4}
            className="w-full bg-[#0b0f1a] text-[#e2e8f0] text-sm px-3 py-2 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8] resize-none font-mono"
          />
        </div>
      </div>
    </div>
  )
}

function DeltaSparkline({ history }: { history: Array<{ deltaEnd: number | null; revB: Revision }> }) {
  const values = history.map((h) => h.deltaEnd ?? 0)
  const max = Math.max(...values.map(Math.abs), 1)
  const W = 300
  const H = 50
  const pad = 8
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2)
    const y = H / 2 - (v / max) * (H / 2 - pad)
    return `${x},${y}`
  })

  return (
    <div className="mt-2">
      <div className="text-[#64748b] text-xs mb-1">Tendance Δfin</div>
      <svg width={W} height={H} className="bg-[#0b0f1a] rounded">
        <line x1={pad} y1={H / 2} x2={W - pad} y2={H / 2} stroke="#1e2d45" strokeWidth={1} />
        <polyline
          points={pts.join(' ')}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={1.5}
        />
        {values.map((v, i) => {
          const x = pad + (i / (values.length - 1)) * (W - pad * 2)
          const y = H / 2 - (v / max) * (H / 2 - pad)
          return <circle key={i} cx={x} cy={y} r={3} fill="#f59e0b" />
        })}
      </svg>
    </div>
  )
}
