import type { MatchedTask, SequenceInversion, ProjectEndDates } from '../types'

export function detectInversions(tasks: MatchedTask[]): SequenceInversion[] {
  const byPhase = new Map<string, MatchedTask[]>()
  for (const t of tasks) {
    if (!t.taskA || !t.taskB) continue
    if (!byPhase.has(t.phase)) byPhase.set(t.phase, [])
    byPhase.get(t.phase)!.push(t)
  }

  const inversions: SequenceInversion[] = []

  for (const [phase, phaseTasks] of byPhase.entries()) {
    const sortedByA = [...phaseTasks].sort(
      (a, b) => a.taskA!.startDate.getTime() - b.taskA!.startDate.getTime()
    )
    const sortedByB = [...phaseTasks].sort(
      (a, b) => a.taskB!.startDate.getTime() - b.taskB!.startDate.getTime()
    )

    const posInA = new Map<string, number>()
    sortedByA.forEach((t, i) => posInA.set(t.name, i))
    const posInB = new Map<string, number>()
    sortedByB.forEach((t, i) => posInB.set(t.name, i))

    for (let i = 0; i < sortedByA.length; i++) {
      for (let j = i + 1; j < sortedByA.length; j++) {
        const x = sortedByA[i].name
        const y = sortedByA[j].name
        if ((posInB.get(x) ?? 0) > (posInB.get(y) ?? 0)) {
          const dispX = Math.abs((sortedByA[i].deltaEnd ?? 0) - (sortedByA[j].deltaEnd ?? 0))
          inversions.push({ taskX: x, taskY: y, phase, deltaDisplacement: dispX })
        }
      }
    }
  }

  inversions.sort((a, b) => b.deltaDisplacement - a.deltaDisplacement)
  return inversions.slice(0, 10)
}

export function computeProjectEndDates(tasks: MatchedTask[]): ProjectEndDates {
  let endA: Date | null = null
  let endB: Date | null = null

  for (const t of tasks) {
    if (t.taskA && (!endA || t.taskA.endDate > endA)) endA = t.taskA.endDate
    if (t.taskB && (!endB || t.taskB.endDate > endB)) endB = t.taskB.endDate
  }

  let deltaCalendarDays: number | null = null
  if (endA && endB) {
    deltaCalendarDays = Math.round((endB.getTime() - endA.getTime()) / 86400000)
  }

  return { endA, endB, deltaCalendarDays }
}

export function criticalChain(tasks: MatchedTask[]): MatchedTask[] {
  return tasks
    .filter((t) => t.taskA && t.taskB && t.deltaEnd !== null)
    .sort((a, b) => (b.deltaEnd ?? 0) - (a.deltaEnd ?? 0))
    .slice(0, 20)
}
