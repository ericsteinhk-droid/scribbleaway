import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Revision, ComparisonPair, Settings, Phase, MatchedTask, TaskNote } from '../types'
import { parseScheduleFile } from '../lib/parser'
import { detectRevisionLabel } from '../lib/revisionDetector'
import { matchTasks } from '../lib/matcher'
import { compareRevisions } from '../lib/comparator'
import { detectPhases, buildPhaseMap } from '../lib/phaseDetector'

const DEFAULT_SETTINGS: Settings = {
  slippageThresholdDays: 3,
  durationChangeThresholdDays: 2,
  phaseHeaderDurationSignal: 180,
  shortTaskAlertThreshold: 4,
  milestoneSlippageAlertThreshold: 10,
  shortTaskKeywords: [
    'installation', 'construction', 'travaux', 'démolition', 'structure', 'béton',
    'excavation', 'fondation', 'mécanique', 'électrique',
    'concrete', 'demolition', 'structural', 'mechanical', 'electrical',
  ],
  reportLanguage: 'fr',
  timelineBarHeight: 'normal',
}

interface PhaseOverrideMap {
  [key: string]: Phase[]
}

interface ScheduleState {
  revisions: Revision[]
  comparisonPair: ComparisonPair | null
  settings: Settings
  phaseOverrides: PhaseOverrideMap
  taskNotes: TaskNote[]
  activeTab: 'sequence' | 'table' | 'milestones' | 'report'
  selectedTaskName: string | null
  isSettingsOpen: boolean
  isPhaseEditorOpen: boolean
  isLoading: boolean
  loadError: string | null

  loadFile(filename: string, buffer: ArrayBuffer): Promise<void>
  removeRevision(id: string): void
  reorderRevisions(fromIndex: number, toIndex: number): void
  updateRevisionLabel(id: string, label: string): void
  setComparisonPair(pair: ComparisonPair): void
  updateSettings(patch: Partial<Settings>): void
  resetSettings(): void
  setPhases(pairKey: string, phases: Phase[]): void
  resetPhases(pairKey: string): void
  setTaskNote(taskName: string, note: string): void
  setActiveTab(tab: ScheduleState['activeTab']): void
  setSelectedTask(name: string | null): void
  setSettingsOpen(open: boolean): void
  setPhaseEditorOpen(open: boolean): void

  getComputedPhases(): Phase[]
  getMatchedTasks(): MatchedTask[]
  getPairKey(): string
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set, get) => ({
      revisions: [],
      comparisonPair: null,
      settings: DEFAULT_SETTINGS,
      phaseOverrides: {},
      taskNotes: [],
      activeTab: 'sequence',
      selectedTaskName: null,
      isSettingsOpen: false,
      isPhaseEditorOpen: false,
      isLoading: false,
      loadError: null,

      async loadFile(filename: string, buffer: ArrayBuffer) {
        set({ isLoading: true, loadError: null })
        try {
          const tasks = await parseScheduleFile(buffer)
          const { label, sortKey } = detectRevisionLabel(filename)
          const id = `rev-${Date.now()}-${Math.random().toString(36).slice(2)}`
          const revision: Revision = { id, label, filename, tasks, loadedAt: Date.now(), sortKey }

          set((state) => {
            const revisions = [...state.revisions, revision].sort((a, b) => {
              if (a.sortKey && b.sortKey) return a.sortKey.localeCompare(b.sortKey)
              return a.loadedAt - b.loadedAt
            })
            let comparisonPair = state.comparisonPair
            if (revisions.length >= 2 && !comparisonPair) {
              comparisonPair = {
                revisionAId: revisions[revisions.length - 2].id,
                revisionBId: revisions[revisions.length - 1].id,
              }
            }
            return { revisions, comparisonPair, isLoading: false }
          })
        } catch (e) {
          set({ isLoading: false, loadError: String(e) })
        }
      },

      removeRevision(id) {
        set((state) => {
          const revisions = state.revisions.filter((r) => r.id !== id)
          let comparisonPair = state.comparisonPair
          if (
            comparisonPair?.revisionAId === id ||
            comparisonPair?.revisionBId === id
          ) {
            comparisonPair =
              revisions.length >= 2
                ? { revisionAId: revisions[0].id, revisionBId: revisions[1].id }
                : null
          }
          return { revisions, comparisonPair }
        })
      },

      reorderRevisions(fromIndex, toIndex) {
        set((state) => {
          const revisions = [...state.revisions]
          const [moved] = revisions.splice(fromIndex, 1)
          revisions.splice(toIndex, 0, moved)
          return { revisions }
        })
      },

      updateRevisionLabel(id, label) {
        set((state) => ({
          revisions: state.revisions.map((r) => (r.id === id ? { ...r, label } : r)),
        }))
      },

      setComparisonPair(pair) {
        set({ comparisonPair: pair })
      },

      updateSettings(patch) {
        set((state) => ({ settings: { ...state.settings, ...patch } }))
      },

      resetSettings() {
        set({ settings: DEFAULT_SETTINGS })
      },

      setPhases(pairKey, phases) {
        set((state) => ({
          phaseOverrides: { ...state.phaseOverrides, [pairKey]: phases },
        }))
      },

      resetPhases(pairKey) {
        set((state) => {
          const overrides = { ...state.phaseOverrides }
          delete overrides[pairKey]
          return { phaseOverrides: overrides }
        })
      },

      setTaskNote(taskName, note) {
        set((state) => {
          const notes = state.taskNotes.filter((n) => n.taskName !== taskName)
          if (note.trim()) notes.push({ taskName, note })
          return { taskNotes: notes }
        })
      },

      setActiveTab(tab) {
        set({ activeTab: tab })
      },

      setSelectedTask(name) {
        set({ selectedTaskName: name })
      },

      setSettingsOpen(open) {
        set({ isSettingsOpen: open })
      },

      setPhaseEditorOpen(open) {
        set({ isPhaseEditorOpen: open })
      },

      getPairKey() {
        const { comparisonPair } = get()
        if (!comparisonPair) return ''
        return `${comparisonPair.revisionAId}__${comparisonPair.revisionBId}`
      },

      getComputedPhases() {
        const { revisions, comparisonPair, settings, phaseOverrides } = get()
        if (!comparisonPair) return []
        const pairKey = get().getPairKey()
        if (phaseOverrides[pairKey]) return phaseOverrides[pairKey]
        const revB = revisions.find((r) => r.id === comparisonPair.revisionBId)
        if (!revB) return []
        return detectPhases(revB.tasks, settings.phaseHeaderDurationSignal)
      },

      getMatchedTasks() {
        const { revisions, comparisonPair, settings } = get()
        if (!comparisonPair) return []
        const revA = revisions.find((r) => r.id === comparisonPair.revisionAId)
        const revB = revisions.find((r) => r.id === comparisonPair.revisionBId)
        if (!revA || !revB) return []
        const phases = get().getComputedPhases()
        const phaseMap = buildPhaseMap(phases)
        const matches = matchTasks(revA.tasks, revB.tasks)
        return compareRevisions(matches, phaseMap, settings)
      },
    }),
    {
      name: 'schedule-analyzer-store',
      partialize: (state) => ({
        settings: state.settings,
        phaseOverrides: state.phaseOverrides,
        taskNotes: state.taskNotes,
      }),
    }
  )
)
