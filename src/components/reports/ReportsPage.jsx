import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, FileText, User, Trash2, ChevronRight, Users } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../services/firebase'
import { useReports } from '../../hooks/useReports'
import { useToast } from '../ui/Toast'
import { AppHeader } from '../layout/AppHeader'
import { Modal } from '../ui/Modal'
import { EmptyState } from '../ui/EmptyState'
import { ReportForm } from './ReportForm'
import { formatDateShort, formatReportNumber } from '../../utils/format'

export function ReportsPage() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { reports, loading, createReport, deleteReport } = useReports(projectId)
  const [project, setProject] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    if (!projectId) return
    getDoc(doc(db, 'projects', projectId)).then((snap) => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() })
    })
  }, [projectId])

  const nextNumber = (project?.reportCount || 0) + 1

  async function handleCreate(data) {
    try {
      const ref = await createReport(projectId, nextNumber, data)
      setShowCreate(false)
      toast('Rapport créé.', 'success')
      navigate(`/projects/${projectId}/reports/${ref.id}`)
    } catch (err) {
      toast(`Erreur: ${err.message}`, 'error')
    }
  }

  async function handleDelete() {
    try {
      await deleteReport(projectId, confirmDelete.id)
      setConfirmDelete(null)
      toast('Rapport supprimé.', 'success')
    } catch (err) {
      toast(`Erreur: ${err.message}`, 'error')
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 dark:bg-gray-950">
      <AppHeader
        title={project?.name || 'Rapports'}
        subtitle="Mes projets"
        backTo="/"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary px-3 py-2 text-sm">
            <Plus size={16} />
            <span className="hidden sm:inline">Nouveau rapport</span>
          </button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {project?.address && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{project.address}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Aucun rapport"
            description="Créez le premier rapport de chantier pour ce projet."
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus size={16} />
                Créer un rapport
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <div key={report.id} className="card overflow-hidden">
                <button
                  className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => navigate(`/projects/${projectId}/reports/${report.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-medium text-primary-600 dark:text-primary-400">
                          #{formatReportNumber(report.number)}
                        </span>
                        <ChevronRight size={12} className="text-gray-400" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          Rapport du {formatDateShort(report.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1">
                          <User size={11} />
                          {report.authorName}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText size={11} />
                          {(report.entries || []).length} entrée{(report.entries || []).length !== 1 ? 's' : ''}
                        </span>
                        {report.attendees?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users size={11} />
                            {report.attendees.length} présent{report.attendees.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(report) }}
                      className="btn-ghost p-2 rounded-lg text-red-400 hover:text-red-500 shrink-0"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={`Nouveau rapport #${formatReportNumber(nextNumber)}`}>
        <ReportForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Supprimer le rapport" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Supprimer le rapport <strong>#{confirmDelete && formatReportNumber(confirmDelete.number)}</strong> ? Cette action est irréversible.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Annuler</button>
          <button onClick={handleDelete} className="btn-danger">Supprimer</button>
        </div>
      </Modal>
    </div>
  )
}
