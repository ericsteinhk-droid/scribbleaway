import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { ref, getBlob } from 'firebase/storage'
import { db, storage } from '../../services/firebase'
import { Plus, Download, Share2, FileText, FileType2, Pencil, Users, Images } from 'lucide-react'
import { pdf } from '@react-pdf/renderer'
import { useReports } from '../../hooks/useReports'
import { useToast } from '../ui/Toast'
import { AppHeader } from '../layout/AppHeader'
import { Modal } from '../ui/Modal'
import { EntryCard } from '../entries/EntryCard'
import { EntryForm } from '../entries/EntryForm'
import { ReportForm } from './ReportForm'
import { ReportPDF } from '../../services/pdfGenerator'
import { generateDocx } from '../../services/docxGenerator'
import { buildPhotosZip } from '../../services/photoZip'
import { ENTRY_TYPES, ENTRY_TYPE_ORDER } from '../../utils/constants'
import { formatDate, formatReportNumber } from '../../utils/format'
import { v4 as uuidv4 } from 'uuid'
import React from 'react'

const PDF_PHOTO_TIMEOUT = 10000

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function fetchPhotoDataUrl(photo) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), PDF_PHOTO_TIMEOUT))
  if (photo.storagePath) {
    try {
      const blob = await Promise.race([getBlob(ref(storage, photo.storagePath)), timeout])
      return await blobToDataUrl(blob)
    } catch { /* fall through */ }
  }
  try {
    const res = await Promise.race([fetch(photo.url), timeout])
    if (res.ok) return await blobToDataUrl(await res.blob())
  } catch { /* ignore */ }
  return null
}

async function prefetchReportPhotos(report) {
  const entries = await Promise.all((report.entries || []).map(async (entry) => {
    if (!entry.photos?.length) return entry
    const photos = await Promise.all(entry.photos.map(async (photo) => {
      const dataUrl = await fetchPhotoDataUrl(photo)
      return dataUrl ? { ...photo, dataUrl } : photo
    }))
    return { ...entry, photos }
  }))
  return { ...report, entries }
}

export function ReportDetailPage() {
  const { projectId, reportId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { updateReport } = useReports(projectId)

  const [project, setProject] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [editEntry, setEditEntry] = useState(null)
  const [showEditReport, setShowEditReport] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [exportProgress, setExportProgress] = useState(null)
  const [showAttendees, setShowAttendees] = useState(false)

  useEffect(() => {
    if (!projectId) return
    getDoc(doc(db, 'projects', projectId)).then((snap) => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() })
    })
  }, [projectId])

  useEffect(() => {
    if (!projectId || !reportId) return
    const unsub = onSnapshot(doc(db, 'projects', projectId, 'reports', reportId), (snap) => {
      if (snap.exists()) setReport({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    return unsub
  }, [projectId, reportId])

  async function handleAddEntry(entryData) {
    const entries = [...(report.entries || []), { id: uuidv4(), ...entryData, createdAt: new Date().toISOString() }]
    await updateReport(projectId, reportId, { entries })
    setShowAddEntry(false)
    toast('Entrée ajoutée.', 'success')
  }

  async function handleEditEntry(entryData) {
    const entries = (report.entries || []).map((e) =>
      e.id === editEntry.id ? { ...e, ...entryData, updatedAt: new Date().toISOString() } : e
    )
    await updateReport(projectId, reportId, { entries })
    setEditEntry(null)
    toast('Entrée modifiée.', 'success')
  }

  async function handleDeleteEntry(entryId) {
    const entries = (report.entries || []).filter((e) => e.id !== entryId)
    await updateReport(projectId, reportId, { entries })
    toast('Entrée supprimée.', 'success')
  }

  async function handleUpdatePhotos(entryId, photos) {
    const entries = (report.entries || []).map((e) =>
      e.id === entryId ? { ...e, photos } : e
    )
    await updateReport(projectId, reportId, { entries })
  }

  async function handleEditReport(data) {
    await updateReport(projectId, reportId, data)
    setShowEditReport(false)
    toast('Rapport mis à jour.', 'success')
  }

  async function exportPDF() {
    if (!report || !project) return
    setExporting('pdf')
    try {
      const enriched = await prefetchReportPhotos(report)
      const blob = await pdf(<ReportPDF report={enriched} project={project} />).toBlob()
      const fileName = `Rapport-${formatReportNumber(report.number)}-${project.name.replace(/\s+/g, '-')}.pdf`
      await shareOrDownload(blob, fileName, 'application/pdf')
    } catch (err) {
      toast(`Erreur PDF: ${err.message}`, 'error')
    } finally {
      setExporting(null)
    }
  }

  async function exportDocx() {
    if (!report || !project) return
    setExporting('docx')
    setExportProgress(null)
    try {
      const blob = await generateDocx(report, project, (cur, tot) => {
        if (tot > 0) setExportProgress({ cur, tot })
      })
      const fileName = `Rapport-${formatReportNumber(report.number)}-${project.name.replace(/\s+/g, '-')}.docx`
      await shareOrDownload(blob, fileName, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    } catch (err) {
      toast(`Erreur Word: ${err.message}`, 'error')
    } finally {
      setExporting(null)
      setExportProgress(null)
    }
  }

  async function exportPhotos() {
    if (!report || !project) return
    setExporting('photos')
    setExportProgress(null)
    try {
      const blob = await buildPhotosZip(report, project, (cur, tot) => {
        if (tot > 0) setExportProgress({ cur, tot })
      })
      const fileName = `Photos-Rapport-${formatReportNumber(report.number)}-${project.name.replace(/\s+/g, '-')}.zip`
      await shareOrDownload(blob, fileName, 'application/zip')
    } catch (err) {
      toast(`Erreur photos: ${err.message}`, 'error')
    } finally {
      setExporting(null)
      setExportProgress(null)
    }
  }

  async function shareOrDownload(blob, fileName, mimeType) {
    const file = new File([blob], fileName, { type: mimeType })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName })
        return
      } catch (err) {
        // AbortError = user dismissed the share sheet — don't also trigger download
        if (err.name === 'AbortError') return
        // Any other error (e.g. "must be handling a user gesture") → fall through to download
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (loading) {
    return (
      <div className="min-h-svh bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="min-h-svh bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-gray-500 dark:text-gray-400 text-sm">Rapport introuvable.</p>
        <button onClick={() => navigate(`/projects/${projectId}`)} className="btn-secondary">
          ← Retour aux rapports
        </button>
      </div>
    )
  }

  const totalPhotos = (report.entries || []).reduce((n, e) => n + (e.photos?.length || 0), 0)

  const groupedEntries = ENTRY_TYPE_ORDER.reduce((acc, type) => {
    const typed = (report.entries || []).filter((e) => e.type === type)
    if (typed.length > 0) acc[type] = typed
    return acc
  }, {})

  const totalEntries = (report.entries || []).length

  return (
    <div className="min-h-svh bg-gray-50 dark:bg-gray-950">
      <AppHeader
        title={`Rapport #${formatReportNumber(report.number)}`}
        subtitle={project?.name}
        backTo={`/projects/${projectId}`}
        actions={
          <div className="flex items-center gap-1">
            <button onClick={() => setShowEditReport(true)} className="btn-ghost p-2 rounded-xl" aria-label="Modifier le rapport">
              <Pencil size={16} />
            </button>
            <button
              onClick={exportPDF}
              disabled={!!exporting}
              className="btn-ghost px-2.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium"
              aria-label="Exporter PDF"
            >
              {exporting === 'pdf'
                ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <FileText size={15} />}
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={exportDocx}
              disabled={!!exporting}
              className="btn-ghost px-2.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium"
              aria-label="Exporter Word"
            >
              {exporting === 'docx'
                ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <FileType2 size={15} />}
              <span className="hidden sm:inline">
                {exporting === 'docx' && exportProgress
                  ? `${exportProgress.cur} / ${exportProgress.tot}`
                  : 'Word'}
              </span>
            </button>
            {totalPhotos > 0 && (
              <button
                onClick={exportPhotos}
                disabled={!!exporting}
                className="btn-ghost px-2.5 py-2 rounded-xl flex items-center gap-1.5 text-xs font-medium"
                aria-label="Télécharger les photos"
              >
                {exporting === 'photos'
                  ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <Images size={15} />}
                <span className="hidden sm:inline">
                  {exporting === 'photos' && exportProgress
                    ? `${exportProgress.cur} / ${exportProgress.tot}`
                    : 'Photos'}
                </span>
              </button>
            )}
          </div>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Report info card */}
        <div className="card p-4 mb-6">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-semibold text-primary-600 dark:text-primary-400">
                  #{formatReportNumber(report.number)}
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {formatDate(report.date)}
                </span>
                {report.time && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{report.time}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>Architecte : {report.authorName}</span>
                {report.weather && <span>Météo : {report.weather}</span>}
                <span>{totalEntries} entrée{totalEntries !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {report.attendees?.length > 0 && (
            <button
              onClick={() => setShowAttendees(true)}
              className="mt-3 flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              <Users size={12} />
              {report.attendees.length} participant{report.attendees.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>

        {/* Entries by group */}
        {Object.keys(groupedEntries).length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            Aucune entrée. Ajoutez votre première observation.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEntries).map(([type, entries]) => (
              <div key={type}>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 ${ENTRY_TYPES[type].color}`}>
                  <span className={`w-2 h-2 rounded-full ${ENTRY_TYPES[type].dot}`} />
                  <span className="text-xs font-semibold">{ENTRY_TYPES[type].label}</span>
                  <span className="text-xs opacity-70">{entries.length}</span>
                </div>
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      projectId={projectId}
                      reportId={reportId}
                      onEdit={() => setEditEntry(entry)}
                      onDelete={() => handleDeleteEntry(entry.id)}
                      onUpdatePhotos={(photos) => handleUpdatePhotos(entry.id, photos)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 right-4 z-30">
        <button
          onClick={() => setShowAddEntry(true)}
          className="btn-primary w-14 h-14 rounded-2xl shadow-lg text-lg"
          aria-label="Ajouter une entrée"
        >
          <Plus size={24} />
        </button>
      </div>

      <Modal open={showAddEntry} onClose={() => setShowAddEntry(false)} title="Nouvelle entrée" size="lg">
        <EntryForm onSubmit={handleAddEntry} onCancel={() => setShowAddEntry(false)} />
      </Modal>

      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title="Modifier l'entrée" size="lg">
        {editEntry && (
          <EntryForm
            initialValues={editEntry}
            onSubmit={handleEditEntry}
            onCancel={() => setEditEntry(null)}
          />
        )}
      </Modal>

      <Modal open={showEditReport} onClose={() => setShowEditReport(false)} title="Modifier le rapport">
        <ReportForm
          initialValues={{
            ...report,
            attendees: (report.attendees || []).map((a) => ({ name: a })),
          }}
          onSubmit={handleEditReport}
          onCancel={() => setShowEditReport(false)}
        />
      </Modal>

      <Modal open={showAttendees} onClose={() => setShowAttendees(false)} title="Personnes présentes" size="sm">
        <ul className="space-y-2">
          {(report.attendees || []).map((a, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
