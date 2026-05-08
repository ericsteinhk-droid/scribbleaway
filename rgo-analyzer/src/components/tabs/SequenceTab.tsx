import { useMemo, useState } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { GanttTimeline } from '../GanttTimeline'
import { detectInversions, computeProjectEndDates, criticalChain } from '../../lib/sequenceAnalyzer'

function sign(n: number) { return n >= 0 ? `+${n}` : `${n}` }

export function SequenceTab() {
  const { getMatchedTasks, setSelectedTask, comparisonPair, revisions } = useScheduleStore()
  const [analysisOpen, setAnalysisOpen] = useState(true)

  const tasks = useMemo(() => getMatchedTasks(), [getMatchedTasks, comparisonPair, revisions])
  const inversions = useMemo(() => detectInversions(tasks), [tasks])
  const projectEnd = useMemo(() => computeProjectEndDates(tasks), [tasks])
  const chain = useMemo(() => criticalChain(tasks), [tasks])

  if (!comparisonPair || revisions.length < 2) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#64748b]">
        Chargez au moins 2 révisions pour comparer.
      </div>
    )
  }

  const revA = revisions.find((r) => r.id === comparisonPair.revisionAId)
  const revB = revisions.find((r) => r.id === comparisonPair.revisionBId)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1e2d45] bg-[#131929] text-sm">
        <span className="text-[#64748b]">A: <span className="text-[#e2e8f0]">{revA?.label}</span></span>
        <span className="text-[#64748b]">→ B: <span className="text-[#e2e8f0]">{revB?.label}</span></span>
        <span className="ml-auto text-[#64748b]">{tasks.length} tâches</span>
        {projectEnd.deltaCalendarDays !== null && (
          <span className={`font-mono font-semibold ${projectEnd.deltaCalendarDays > 0 ? 'text-[#f59e0b]' : 'text-[#4ade80]'}`}>
            Fin projet: {sign(projectEnd.deltaCalendarDays)}j
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <GanttTimeline tasks={tasks} onTaskClick={setSelectedTask} />
      </div>

      <div className="border-t border-[#1e2d45]">
        <button
          onClick={() => setAnalysisOpen((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 text-[#64748b] text-sm hover:text-[#e2e8f0] bg-[#131929]"
        >
          <span>{analysisOpen ? '▼' : '▶'}</span>
          Analyse de séquence
        </button>

        {analysisOpen && (
          <div className="grid grid-cols-2 gap-px bg-[#1e2d45] border-t border-[#1e2d45]">
            <div className="bg-[#0b0f1a] p-4">
              <h4 className="text-[#a78bfa] text-xs uppercase tracking-wider mb-3">
                Inversions de séquence (top 10)
              </h4>
              {inversions.length === 0 ? (
                <div className="text-[#64748b] text-sm">Aucune inversion détectée.</div>
              ) : (
                <div className="space-y-1.5">
                  {inversions.map((inv, i) => (
                    <div key={i} className="text-xs bg-[#131929] rounded p-2">
                      <div className="text-[#64748b] mb-0.5">{inv.phase}</div>
                      <div className="text-[#e2e8f0]">
                        <span className="text-[#f59e0b]">{inv.taskX}</span>
                        <span className="text-[#64748b] mx-1">↔</span>
                        <span className="text-[#a78bfa]">{inv.taskY}</span>
                      </div>
                      <div className="text-[#64748b] mt-0.5">Δ: {inv.deltaDisplacement}j</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#0b0f1a] p-4">
              <h4 className="text-[#f59e0b] text-xs uppercase tracking-wider mb-3">
                Chaîne critique (top 20 par Δfin)
              </h4>
              {chain.length === 0 ? (
                <div className="text-[#64748b] text-sm">Aucune donnée.</div>
              ) : (
                <div className="space-y-0.5">
                  {chain.map((t, i) => {
                    const cumul = chain.slice(0, i + 1).reduce((s, c) => s + (c.deltaEnd ?? 0), 0)
                    return (
                      <div
                        key={t.name}
                        className="flex items-center gap-2 text-xs py-1 border-b border-[#131929] cursor-pointer hover:bg-[#131929] rounded px-1"
                        onClick={() => setSelectedTask(t.name)}
                      >
                        <span className="text-[#64748b] w-4 text-right">{i + 1}</span>
                        <span className="flex-1 text-[#e2e8f0] truncate">{t.name}</span>
                        <span className="text-[#f59e0b] font-mono">{sign(t.deltaEnd ?? 0)}j</span>
                        <span className="text-[#64748b] font-mono">∑{sign(cumul)}j</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
