import type { MatchResult } from './matcher'
import type { MatchedTask, Settings, TaskStatus } from '../types'

function daysDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function compareRevisions(
  matches: MatchResult[],
  phaseMap: Map<string, string>,
  settings: Settings
): MatchedTask[] {
  const { slippageThresholdDays: st, durationChangeThresholdDays: dt } = settings

  return matches.map(({ name, taskA, taskB }) => {
    const phase = phaseMap.get(name.toLowerCase().replace(/\s+/g, ' ').trim()) ?? 'Divers'

    if (!taskA && taskB) {
      return { name, taskA, taskB, status: 'NEW' as TaskStatus, deltaStart: null, deltaEnd: null, deltaDur: null, phase }
    }
    if (taskA && !taskB) {
      return { name, taskA, taskB, status: 'REMOVED' as TaskStatus, deltaStart: null, deltaEnd: null, deltaDur: null, phase }
    }
    if (!taskA || !taskB) {
      return { name, taskA, taskB, status: 'STABLE' as TaskStatus, deltaStart: null, deltaEnd: null, deltaDur: null, phase }
    }

    const deltaStart = daysDiff(taskA.startDate, taskB.startDate)
    const deltaEnd = daysDiff(taskA.endDate, taskB.endDate)
    const deltaDur = taskB.duration - taskA.duration

    let status: TaskStatus
    if (Math.abs(deltaEnd) <= st && Math.abs(deltaDur) <= 1) {
      status = 'STABLE'
    } else if (deltaEnd > st && deltaDur <= dt) {
      status = 'SLIPPED'
    } else if (deltaEnd > st && deltaDur > dt) {
      status = 'EXTENDED'
    } else if (deltaEnd < -st && deltaDur >= -dt) {
      status = 'ACCELERATED'
    } else if (deltaEnd < -st && deltaDur < -dt) {
      status = 'COMPRESSED'
    } else {
      status = 'STABLE'
    }

    return { name, taskA, taskB, status, deltaStart, deltaEnd, deltaDur, phase }
  })
}
