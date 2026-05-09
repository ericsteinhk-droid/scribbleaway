import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { useScheduleStore } from '../../store/scheduleStore'
import type { MatchedTask, TaskStatus } from '../../types'

function sign(n: number) { return n >= 0 ? `+${n}` : `${n}` }
function fmtDate(d: Date | undefined) { return d ? d.toLocaleDateString('fr-CA') : '—' }

const STATUS_LABELS: Record<TaskStatus, string> = {
  STABLE: 'Stable', SLIPPED: 'Glissé', EXTENDED: 'Prolongé',
  ACCELERATED: 'Accéléré', COMPRESSED: 'Compressé', NEW: 'Nouveau', REMOVED: 'Supprimé',
}
const STATUS_COLORS: Record<string, string> = {
  STABLE: '#38bdf8', SLIPPED: '#f59e0b', EXTENDED: '#a78bfa',
  ACCELERATED: '#4ade80', COMPRESSED: '#4ade80', NEW: '#4ade80', REMOVED: '#f87171',
}

const ALL_STATUSES: TaskStatus[] = ['STABLE', 'SLIPPED', 'EXTENDED', 'ACCELERATED', 'COMPRESSED', 'NEW', 'REMOVED']

export function TableTab() {
  const { getMatchedTasks, comparisonPair, revisions, setSelectedTask } = useScheduleStore()
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set())
  const [phaseFilter, setPhaseFilter] = useState<Set<string>>(new Set())
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [deltaRange, setDeltaRange] = useState<[number, number]>([-365, 365])

  const tasks = useMemo(() => getMatchedTasks(), [getMatchedTasks, comparisonPair, revisions])

  const phases = useMemo(() => {
    const s = new Set<string>()
    tasks.forEach((t) => s.add(t.phase))
    return Array.from(s)
  }, [tasks])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter.size > 0 && !statusFilter.has(t.status)) return false
      if (phaseFilter.size > 0 && !phaseFilter.has(t.phase)) return false
      if (t.deltaEnd !== null && (t.deltaEnd < deltaRange[0] || t.deltaEnd > deltaRange[1])) return false
      return true
    })
  }, [tasks, statusFilter, phaseFilter, deltaRange])

  const columns = useMemo<ColumnDef<MatchedTask>[]>(
    () => [
      { id: 'name', accessorKey: 'name', header: 'Nom', size: 260,
        cell: (info) => (
          <span className="cursor-pointer hover:text-[#38bdf8]" onClick={() => setSelectedTask(info.getValue() as string)}>
            {info.getValue() as string}
          </span>
        )
      },
      { id: 'phase', accessorKey: 'phase', header: 'Phase', size: 140 },
      { id: 'durA', accessorFn: (r) => r.taskA?.duration ?? null, header: 'Durée A',
        cell: (i) => i.getValue() !== null ? `${i.getValue()}j` : '—' },
      { id: 'durB', accessorFn: (r) => r.taskB?.duration ?? null, header: 'Durée B',
        cell: (i) => i.getValue() !== null ? `${i.getValue()}j` : '—' },
      { id: 'deltaDur', accessorKey: 'deltaDur', header: 'Δdur',
        cell: (i) => {
          const v = i.getValue() as number | null
          return v !== null ? <span style={{ color: v > 2 ? '#f59e0b' : v < -2 ? '#4ade80' : '#e2e8f0' }} className="font-mono">{sign(v)}j</span> : '—'
        }
      },
      { id: 'startA', accessorFn: (r) => r.taskA?.startDate, header: 'Début A',
        cell: (i) => fmtDate(i.getValue() as Date | undefined) },
      { id: 'startB', accessorFn: (r) => r.taskB?.startDate, header: 'Début B',
        cell: (i) => fmtDate(i.getValue() as Date | undefined) },
      { id: 'deltaStart', accessorKey: 'deltaStart', header: 'Δdébut',
        cell: (i) => {
          const v = i.getValue() as number | null
          return v !== null ? <span className="font-mono text-[#64748b]">{sign(v)}j</span> : '—'
        }
      },
      { id: 'endA', accessorFn: (r) => r.taskA?.endDate, header: 'Fin A',
        cell: (i) => fmtDate(i.getValue() as Date | undefined) },
      { id: 'endB', accessorFn: (r) => r.taskB?.endDate, header: 'Fin B',
        cell: (i) => fmtDate(i.getValue() as Date | undefined) },
      { id: 'deltaEnd', accessorKey: 'deltaEnd', header: 'Δfin',
        cell: (i) => {
          const v = i.getValue() as number | null
          return v !== null ? <span style={{ color: v > 3 ? '#f59e0b' : v < -3 ? '#4ade80' : '#e2e8f0' }} className="font-mono">{sign(v)}j</span> : '—'
        }
      },
      { id: 'status', accessorKey: 'status', header: 'Statut',
        cell: (i) => {
          const s = i.getValue() as TaskStatus
          return (
            <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: STATUS_COLORS[s] + '33', color: STATUS_COLORS[s] }}>
              {STATUS_LABELS[s]}
            </span>
          )
        }
      },
    ],
    [setSelectedTask]
  )

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 100 } },
  })

  function exportCSV() {
    const BOM = '﻿'
    const headers = table.getAllColumns()
      .filter((c) => c.getIsVisible())
      .map((c) => c.columnDef.header as string)
    const rows = filtered.map((t) => [
      t.name, t.phase,
      t.taskA?.duration ?? '', t.taskB?.duration ?? '', t.deltaDur ?? '',
      fmtDate(t.taskA?.startDate), fmtDate(t.taskB?.startDate), t.deltaStart ?? '',
      fmtDate(t.taskA?.endDate), fmtDate(t.taskB?.endDate), t.deltaEnd ?? '',
      t.status,
    ])
    const csv = BOM + [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'schedule-comparison.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function toggleStatus(s: TaskStatus) {
    setStatusFilter((prev) => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  function togglePhase(p: string) {
    setPhaseFilter((prev) => {
      const n = new Set(prev)
      n.has(p) ? n.delete(p) : n.add(p)
      return n
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-[#1e2d45] bg-[#131929] space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Rechercher..."
            className="bg-[#0b0f1a] text-[#e2e8f0] text-sm px-3 py-1.5 rounded border border-[#1e2d45] outline-none focus:border-[#38bdf8] w-56"
          />
          <div className="flex gap-1 flex-wrap">
            {ALL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className="px-2 py-0.5 text-xs rounded-full border transition-all"
                style={{
                  background: statusFilter.has(s) ? STATUS_COLORS[s] + '33' : 'transparent',
                  borderColor: STATUS_COLORS[s],
                  color: statusFilter.has(s) ? STATUS_COLORS[s] : '#64748b',
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} className="ml-auto px-3 py-1.5 text-xs bg-[#1a2235] text-[#38bdf8] border border-[#38bdf8] rounded hover:bg-[#38bdf8] hover:text-[#0b0f1a]">
            ↓ CSV
          </button>
        </div>
        {phases.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {phases.map((p) => (
              <button
                key={p}
                onClick={() => togglePhase(p)}
                className={`px-2 py-0.5 text-xs rounded border ${phaseFilter.has(p) ? 'bg-[#a78bfa33] border-[#a78bfa] text-[#a78bfa]' : 'border-[#1e2d45] text-[#64748b]'}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-[#131929] border-b border-[#1e2d45]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="text-left text-[#64748b] text-xs px-3 py-2 cursor-pointer hover:text-[#e2e8f0] whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id} className={`border-b border-[#1e2d45] hover:bg-[#131929] ${i % 2 === 0 ? 'bg-[#0b0f1a]' : 'bg-[#0d1220]'}`}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 text-[#e2e8f0] whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.getRowModel().rows.length === 0 && (
          <div className="text-center text-[#64748b] py-12">Aucune tâche correspondant aux filtres.</div>
        )}
      </div>

      <div className="flex items-center gap-3 px-4 py-2 border-t border-[#1e2d45] bg-[#131929] text-xs text-[#64748b]">
        <span>{filtered.length} résultats</span>
        <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="px-2 py-1 rounded border border-[#1e2d45] disabled:opacity-30">←</button>
        <span>Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}</span>
        <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="px-2 py-1 rounded border border-[#1e2d45] disabled:opacity-30">→</button>
      </div>
    </div>
  )
}
