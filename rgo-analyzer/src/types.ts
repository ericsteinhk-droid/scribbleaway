export type TaskStatus =
  | 'STABLE'
  | 'SLIPPED'
  | 'EXTENDED'
  | 'ACCELERATED'
  | 'COMPRESSED'
  | 'NEW'
  | 'REMOVED'

export interface ParsedTask {
  id: number
  name: string
  duration: number
  startDate: Date
  endDate: Date
  isMilestone: boolean
}

export interface Revision {
  id: string
  label: string
  filename: string
  tasks: ParsedTask[]
  loadedAt: number
  sortKey: string | null
}

export interface MatchedTask {
  name: string
  taskA: ParsedTask | null
  taskB: ParsedTask | null
  status: TaskStatus
  deltaStart: number | null
  deltaEnd: number | null
  deltaDur: number | null
  phase: string
}

export interface Phase {
  id: string
  label: string
  taskNames: string[]
}

export interface PhaseOverride {
  phases: Phase[]
}

export interface Settings {
  slippageThresholdDays: number
  durationChangeThresholdDays: number
  phaseHeaderDurationSignal: number
  shortTaskAlertThreshold: number
  milestoneSlippageAlertThreshold: number
  shortTaskKeywords: string[]
  reportLanguage: 'fr' | 'en'
  timelineBarHeight: 'compact' | 'normal' | 'spacious'
}

export interface ComparisonPair {
  revisionAId: string
  revisionBId: string
}

export interface SequenceInversion {
  taskX: string
  taskY: string
  phase: string
  deltaDisplacement: number
}

export interface ProjectEndDates {
  endA: Date | null
  endB: Date | null
  deltaCalendarDays: number | null
}

export interface TaskNote {
  taskName: string
  note: string
}

export interface ElectronAPI {
  openFileDialog(): Promise<{ path: string; buffer: ArrayBuffer }[]>
  readFileAsBuffer(path: string): Promise<ArrayBuffer>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
