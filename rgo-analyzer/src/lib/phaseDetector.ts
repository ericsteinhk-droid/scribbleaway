import type { ParsedTask, Phase } from '../types'

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou', 'à', 'en',
  'the', 'of', 'and', 'or', 'a', 'an', 'in', 'to', 'for', 'with', 'by',
])

function firstSignificantToken(name: string): string {
  const words = name.toLowerCase().split(/\s+/)
  for (const w of words) {
    if (w.length > 3 && !STOP_WORDS.has(w)) return w
  }
  return words[0] ?? 'divers'
}

export function detectPhases(tasks: ParsedTask[], headerDurationSignal: number): Phase[] {
  if (tasks.length === 0) return []

  const headers = tasks.filter((t) => t.duration >= headerDurationSignal)

  if (headers.length >= 2) {
    const phases: Phase[] = []
    for (let i = 0; i < headers.length; i++) {
      const headerIdx = tasks.findIndex((t) => t.id === headers[i].id)
      const nextHeaderIdx =
        i + 1 < headers.length ? tasks.findIndex((t) => t.id === headers[i + 1].id) : tasks.length
      const phaseTaskNames = tasks
        .slice(headerIdx, nextHeaderIdx)
        .filter((t) => t.duration < headerDurationSignal)
        .map((t) => t.name)
      phases.push({
        id: `phase-${i}`,
        label: headers[i].name,
        taskNames: phaseTaskNames,
      })
    }
    return phases
  }

  const groupMap = new Map<string, string[]>()
  for (const task of tasks) {
    const key = firstSignificantToken(task.name)
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(task.name)
  }

  const phases: Phase[] = []
  let idx = 0
  for (const [key, names] of groupMap.entries()) {
    phases.push({ id: `phase-${idx++}`, label: key, taskNames: names })
  }

  if (phases.length === 0) {
    phases.push({ id: 'phase-0', label: 'Projet', taskNames: tasks.map((t) => t.name) })
  }

  return phases
}

export function buildPhaseMap(phases: Phase[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const phase of phases) {
    for (const name of phase.taskNames) {
      map.set(name.toLowerCase().replace(/\s+/g, ' ').trim(), phase.label)
    }
  }
  return map
}
