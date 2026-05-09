import { useMemo } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import type { MatchedTask, TaskStatus } from '../../types'

function sign(n: number) { return n >= 0 ? `+${n}` : `${n}` }

const STATUS_COLORS: Record<string, string> = {
  STABLE: '#38bdf8', SLIPPED: '#f59e0b', EXTENDED: '#a78bfa',
  ACCELERATED: '#4ade80', COMPRESSED: '#4ade80', NEW: '#4ade80', REMOVED: '#f87171',
}

export function MilestonesTab() {
  const { getMatchedTasks, comparisonPair, revisions, settings, setSelectedTask } = useScheduleStore()

  const tasks = useMemo(() => getMatchedTasks(), [getMatchedTasks, comparisonPair, revisions])

  const milestones = useMemo(
    () =>
      tasks
        .filter((t) => t.taskA?.isMilestone || t.taskB?.isMilestone)
        .sort((a, b) => (b.deltaEnd ?? 0) - (a.deltaEnd ?? 0)),
    [tasks]
  )

  const shortComplex = useMemo(() => {
    const kws = settings.shortTaskKeywords
    return tasks.filter((t) => {
      if (!t.taskB) return false
      if (t.taskB.duration >= settings.shortTaskAlertThreshold) return false
      const nl = t.name.toLowerCase()
      return kws.some((kw) => nl.includes(kw.toLowerCase()))
    })
  }, [tasks, settings])

  const phaseStats = useMemo(() => {
    const map = new Map<string, Record<TaskStatus, number>>()
    for (const t of tasks) {
      if (!map.has(t.phase)) {
        map.set(t.phase, { STABLE: 0, SLIPPED: 0, EXTENDED: 0, ACCELERATED: 0, COMPRESSED: 0, NEW: 0, REMOVED: 0 })
      }
      map.get(t.phase)![t.status]++
    }
    return map
  }, [tasks])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8">
      <section>
        <h2 className="text-[#e2e8f0] font-semibold text-base mb-4">Jalons ({milestones.length})</h2>
        {milestones.length === 0 ? (
          <div className="text-[#64748b]">Aucun jalon (0j) détecté.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#1e2d45]">
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Jalon</th>
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Phase</th>
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Fin A</th>
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Fin B</th>
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Δfin</th>
                <th className="text-left text-[#64748b] text-xs px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((t) => {
                const isAtRisk = (t.deltaEnd ?? 0) > settings.milestoneSlippageAlertThreshold
                return (
                  <tr
                    key={t.name}
                    className="border-b border-[#1e2d45] hover:bg-[#131929] cursor-pointer"
                    onClick={() => setSelectedTask(t.name)}
                  >
                    <td className="px-3 py-2 text-[#e2e8f0]">
                      {isAtRisk && <span className="text-[#f87171] mr-1">⚠</span>}
                      {t.name}
                    </td>
                    <td className="px-3 py-2 text-[#64748b]">{t.phase}</td>
                    <td className="px-3 py-2 font-mono text-[#64748b] text-xs">
                      {t.taskA?.endDate?.toLocaleDateString('fr-CA') ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[#64748b] text-xs">
                      {t.taskB?.endDate?.toLocaleDateString('fr-CA') ?? '—'}
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: (t.deltaEnd ?? 0) > 3 ? '#f59e0b' : (t.deltaEnd ?? 0) < -3 ? '#4ade80' : '#64748b' }}>
                      {t.deltaEnd !== null ? sign(t.deltaEnd) + 'j' : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: STATUS_COLORS[t.status] + '33', color: STATUS_COLORS[t.status] }}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2 className="text-[#e2e8f0] font-semibold text-base mb-4">
          Durées suspectes — tâches complexes &lt; {settings.shortTaskAlertThreshold}j ({shortComplex.length})
        </h2>
        {shortComplex.length === 0 ? (
          <div className="text-[#64748b]">Aucune durée suspecte détectée.</div>
        ) : (
          <div className="space-y-1.5">
            {shortComplex.map((t) => (
              <div
                key={t.name}
                className="flex items-center gap-3 bg-[#131929] rounded px-3 py-2 cursor-pointer hover:bg-[#1a2235]"
                onClick={() => setSelectedTask(t.name)}
              >
                <span className="text-[#f87171]">⚠</span>
                <span className="flex-1 text-[#e2e8f0] text-sm">{t.name}</span>
                <span className="text-[#f59e0b] font-mono text-xs">{t.taskB?.duration}j</span>
                <span className="text-[#64748b] text-xs">{t.phase}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[#e2e8f0] font-semibold text-base mb-4">Résumé par phase</h2>
        <div className="space-y-2">
          {Array.from(phaseStats.entries()).map(([phase, counts]) => (
            <div key={phase} className="bg-[#131929] rounded p-3">
              <div className="text-[#a78bfa] text-sm font-medium mb-2">{phase}</div>
              <div className="flex gap-3 flex-wrap text-xs">
                {(Object.entries(counts) as [TaskStatus, number][])
                  .filter(([, n]) => n > 0)
                  .map(([status, n]) => (
                    <span key={status} className="px-2 py-0.5 rounded-full" style={{ background: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status] }}>
                      {status}: {n}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
