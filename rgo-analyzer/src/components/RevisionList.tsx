import { useRef, useState } from 'react'
import { useScheduleStore } from '../store/scheduleStore'
import type { Revision } from '../types'

function RevisionItem({
  revision,
  index,
  total,
  isA,
  isB,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  revision: Revision
  index: number
  total: number
  isA: boolean
  isB: boolean
  onDragStart: (i: number) => void
  onDragOver: (e: React.DragEvent, i: number) => void
  onDrop: (i: number) => void
}) {
  const { removeRevision, updateRevisionLabel, comparisonPair, setComparisonPair, revisions } =
    useScheduleStore()
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState(revision.label)

  function commitLabel() {
    if (draftLabel.trim()) updateRevisionLabel(revision.id, draftLabel.trim())
    setEditing(false)
  }

  function selectAsA() {
    if (comparisonPair) setComparisonPair({ ...comparisonPair, revisionAId: revision.id })
    else if (revisions.length > 1) {
      const other = revisions.find((r) => r.id !== revision.id)!
      setComparisonPair({ revisionAId: revision.id, revisionBId: other.id })
    }
  }

  function selectAsB() {
    if (comparisonPair) setComparisonPair({ ...comparisonPair, revisionBId: revision.id })
    else if (revisions.length > 1) {
      const other = revisions.find((r) => r.id !== revision.id)!
      setComparisonPair({ revisionAId: other.id, revisionBId: revision.id })
    }
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className="group flex items-center gap-2 p-2 rounded border border-[#1e2d45] bg-[#131929] cursor-grab active:cursor-grabbing"
    >
      <span className="text-[#64748b] text-xs select-none">⠿</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
            className="w-full bg-[#0b0f1a] text-[#e2e8f0] text-sm px-1 rounded border border-[#38bdf8] outline-none"
          />
        ) : (
          <div
            className="text-[#e2e8f0] text-sm truncate cursor-pointer hover:text-[#38bdf8]"
            onDoubleClick={() => { setEditing(true); setDraftLabel(revision.label) }}
            title={`${revision.filename}\n${revision.tasks.length} tâches — double-cliquer pour renommer`}
          >
            {revision.label}
          </div>
        )}
        <div className="text-[#64748b] text-xs truncate">{revision.tasks.length} tâches</div>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={selectAsA}
          className={`px-1.5 py-0.5 text-xs rounded ${isA ? 'bg-[#64748b] text-white' : 'text-[#64748b] hover:text-[#e2e8f0] border border-[#1e2d45]'}`}
          title="Sélectionner comme révision A"
        >A</button>
        <button
          onClick={selectAsB}
          className={`px-1.5 py-0.5 text-xs rounded ${isB ? 'bg-[#38bdf8] text-[#0b0f1a]' : 'text-[#64748b] hover:text-[#e2e8f0] border border-[#1e2d45]'}`}
          title="Sélectionner comme révision B"
        >B</button>
        <button
          onClick={() => removeRevision(revision.id)}
          className="text-[#64748b] hover:text-[#f87171] px-1 text-xs"
          title="Supprimer"
        >✕</button>
      </div>
    </div>
  )
}

export function RevisionList() {
  const { revisions, reorderRevisions, comparisonPair } = useScheduleStore()
  const dragFrom = useRef<number | null>(null)

  function onDragStart(i: number) { dragFrom.current = i }
  function onDragOver(e: React.DragEvent, _i: number) { e.preventDefault() }
  function onDrop(toIndex: number) {
    if (dragFrom.current !== null && dragFrom.current !== toIndex) {
      reorderRevisions(dragFrom.current, toIndex)
    }
    dragFrom.current = null
  }

  if (revisions.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5 mt-3">
      <div className="text-[#64748b] text-xs uppercase tracking-wider px-1">Révisions</div>
      {revisions.map((rev, i) => (
        <RevisionItem
          key={rev.id}
          revision={rev}
          index={i}
          total={revisions.length}
          isA={comparisonPair?.revisionAId === rev.id}
          isB={comparisonPair?.revisionBId === rev.id}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}
