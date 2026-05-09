import type { ParsedTask } from '../types'

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

export interface MatchResult {
  name: string
  taskA: ParsedTask | null
  taskB: ParsedTask | null
}

export function matchTasks(tasksA: ParsedTask[], tasksB: ParsedTask[]): MatchResult[] {
  const normalizedA = tasksA.map((t) => ({ ...t, _norm: normalizeName(t.name) }))
  const normalizedB = tasksB.map((t) => ({ ...t, _norm: normalizeName(t.name) }))

  const results: MatchResult[] = []
  const usedBIndices = new Set<number>()

  for (const a of normalizedA) {
    const candidates = normalizedB
      .map((b, i) => ({ b, i }))
      .filter(({ i }) => !usedBIndices.has(i) && normalizedB[i]._norm === a._norm)

    if (candidates.length > 0) {
      const { b, i } = candidates[0]
      usedBIndices.add(i)
      results.push({ name: a.name, taskA: a, taskB: b })
    } else {
      results.push({ name: a.name, taskA: a, taskB: null })
    }
  }

  for (let i = 0; i < normalizedB.length; i++) {
    if (!usedBIndices.has(i)) {
      results.push({ name: normalizedB[i].name, taskA: null, taskB: normalizedB[i] })
    }
  }

  return results
}
