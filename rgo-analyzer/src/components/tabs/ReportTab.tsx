import { useMemo, useState } from 'react'
import { useScheduleStore } from '../../store/scheduleStore'
import { generateReport } from '../../lib/reportGenerator'
import { detectInversions, computeProjectEndDates } from '../../lib/sequenceAnalyzer'

export function ReportTab() {
  const { getMatchedTasks, comparisonPair, revisions, settings, updateSettings } = useScheduleStore()
  const [projectTitle, setProjectTitle] = useState('Analyse du calendrier')
  const [copied, setCopied] = useState(false)

  const tasks = useMemo(() => getMatchedTasks(), [getMatchedTasks, comparisonPair, revisions])
  const inversions = useMemo(() => detectInversions(tasks), [tasks])
  const projectEnd = useMemo(() => computeProjectEndDates(tasks), [tasks])

  const revA = revisions.find((r) => r.id === comparisonPair?.revisionAId)
  const revB = revisions.find((r) => r.id === comparisonPair?.revisionBId)

  const reportText = useMemo(() => {
    if (!revA || !revB) return ''
    return generateReport({
      revisionA: revA,
      revisionB: revB,
      tasks,
      inversions,
      projectEnd,
      settings,
      projectTitle,
      language: settings.reportLanguage,
    })
  }, [revA, revB, tasks, inversions, projectEnd, settings, projectTitle])

  async function copyToClipboard() {
    await navigator.clipboard.writeText(reportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!revA || !revB) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#64748b]">
        Sélectionnez une paire de révisions pour générer un rapport.
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-[#1e2d45] bg-[#131929]">
        <input
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          className="flex-1 bg-[#0b0f1a] text-[#e2e8f0] text-sm px-3 py-1.5 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8] max-w-sm"
          placeholder="Titre du rapport..."
        />
        <div className="flex gap-2 ml-auto">
          <div className="flex gap-1">
            {(['fr', 'en'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => updateSettings({ reportLanguage: lang })}
                className={`px-3 py-1.5 text-xs rounded ${settings.reportLanguage === lang ? 'bg-[#38bdf8] text-[#0b0f1a]' : 'bg-[#1a2235] text-[#64748b] border border-[#1e2d45]'}`}
              >
                {lang === 'fr' ? 'FR' : 'EN'}
              </button>
            ))}
          </div>
          <button
            onClick={copyToClipboard}
            className="px-3 py-1.5 text-xs bg-[#1a2235] text-[#38bdf8] border border-[#38bdf8] rounded hover:bg-[#38bdf8] hover:text-[#0b0f1a]"
          >
            {copied ? '✓ Copié !' : 'Copier (Markdown)'}
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs bg-[#1a2235] text-[#64748b] border border-[#1e2d45] rounded hover:text-[#e2e8f0]"
          >
            Imprimer
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          <ReportPreview markdown={reportText} />
        </div>
      </div>
    </div>
  )
}

function ReportPreview({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n')
  const elements: React.ReactNode[] = []
  let tableRows: string[][] = []
  let inTable = false
  let key = 0

  function flushTable() {
    if (tableRows.length < 2) { tableRows = []; inTable = false; return }
    const headers = tableRows[0]
    const body = tableRows.slice(2)
    elements.push(
      <div key={key++} className="overflow-x-auto my-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>{headers.map((h, i) => <th key={i} className="text-left text-[#64748b] text-xs px-3 py-2 border-b border-[#1e2d45]">{h.trim()}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, i) => (
              <tr key={i} className="border-b border-[#1e2d45]">
                {row.map((cell, j) => <td key={j} className="px-3 py-1.5 text-[#e2e8f0] text-xs">{cell.trim()}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []; inTable = false
  }

  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true
      tableRows.push(line.split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1))
      continue
    }
    if (inTable) flushTable()

    if (line.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-[#e2e8f0] text-2xl font-bold mb-4 mt-6">{renderInline(line.slice(2))}</h1>)
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-[#38bdf8] text-lg font-semibold mb-3 mt-6 border-b border-[#1e2d45] pb-2">{renderInline(line.slice(3))}</h2>)
    } else if (line.startsWith('- ')) {
      elements.push(<li key={key++} className="text-[#e2e8f0] text-sm ml-4 mb-1 list-disc">{renderInline(line.slice(2))}</li>)
    } else if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />)
    } else {
      elements.push(<p key={key++} className="text-[#e2e8f0] text-sm mb-2">{renderInline(line)}</p>)
    }
  }
  if (inTable) flushTable()

  return <div className="report-content font-sans">{elements}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="text-[#e2e8f0]">{p.slice(2, -2)}</strong>
    if (p.startsWith('_') && p.endsWith('_')) return <em key={i} className="text-[#64748b]">{p.slice(1, -1)}</em>
    return p
  })
}
