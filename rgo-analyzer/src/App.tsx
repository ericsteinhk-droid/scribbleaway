import { useScheduleStore } from './store/scheduleStore'
import { Sidebar } from './components/Sidebar'
import { SettingsPanel } from './components/SettingsPanel'
import { PhaseEditor } from './components/PhaseEditor'
import { TaskDrawer } from './components/TaskDrawer'
import { SequenceTab } from './components/tabs/SequenceTab'
import { TableTab } from './components/tabs/TableTab'
import { MilestonesTab } from './components/tabs/MilestonesTab'
import { ReportTab } from './components/tabs/ReportTab'

const TABS = [
  { id: 'sequence' as const, label: 'Séquence' },
  { id: 'table' as const, label: 'Tableau' },
  { id: 'milestones' as const, label: 'Jalons & alertes' },
  { id: 'report' as const, label: 'Rapport' },
]

export default function App() {
  const { activeTab, setActiveTab, isSettingsOpen, isPhaseEditorOpen, selectedTaskName } =
    useScheduleStore()

  return (
    <div className="h-screen flex bg-[#0b0f1a] text-[#e2e8f0] overflow-hidden">
      <Sidebar />

      <div className={`flex-1 flex flex-col overflow-hidden transition-all ${selectedTaskName ? 'mr-[380px]' : ''}`}>
        <nav className="flex border-b border-[#1e2d45] bg-[#131929]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-[#38bdf8] text-[#38bdf8]'
                  : 'border-transparent text-[#64748b] hover:text-[#e2e8f0]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'sequence' && <SequenceTab />}
          {activeTab === 'table' && <TableTab />}
          {activeTab === 'milestones' && <MilestonesTab />}
          {activeTab === 'report' && <ReportTab />}
        </main>
      </div>

      <TaskDrawer />
      {isSettingsOpen && <SettingsPanel />}
      {isPhaseEditorOpen && <PhaseEditor />}
    </div>
  )
}
