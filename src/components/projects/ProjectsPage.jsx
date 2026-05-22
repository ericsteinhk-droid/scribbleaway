import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, MapPin, FileText, Pencil, Trash2 } from 'lucide-react'
import { useProjects } from '../../hooks/useProjects'
import { useToast } from '../ui/Toast'
import { AppHeader } from '../layout/AppHeader'
import { Modal } from '../ui/Modal'
import { EmptyState } from '../ui/EmptyState'
import { ProjectForm } from './ProjectForm'
import { formatRelative } from '../../utils/format'

export function ProjectsPage() {
  const { projects, loading, createProject, updateProject, deleteProject } = useProjects()
  const toast = useToast()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [editProject, setEditProject] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function handleCreate(data) {
    try {
      await createProject(data)
      setShowCreate(false)
      toast('Projet créé avec succès.', 'success')
    } catch (err) {
      toast(`Erreur: ${err.message}`, 'error')
    }
  }

  async function handleEdit(data) {
    try {
      await updateProject(editProject.id, data)
      setEditProject(null)
      toast('Projet mis à jour.', 'success')
    } catch (err) {
      toast(`Erreur: ${err.message}`, 'error')
    }
  }

  async function handleDelete() {
    try {
      await deleteProject(confirmDelete.id)
      setConfirmDelete(null)
      toast('Projet supprimé.', 'success')
    } catch (err) {
      toast(`Erreur: ${err.message}`, 'error')
    }
  }

  return (
    <div className="min-h-svh bg-gray-50 dark:bg-gray-950">
      <AppHeader
        title="Mes projets"
        actions={
          <button onClick={() => setShowCreate(true)} className="btn-primary px-3 py-2 text-sm">
            <Plus size={16} />
            <span className="hidden sm:inline">Nouveau projet</span>
          </button>
        }
      />

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Aucun projet"
            description="Créez votre premier projet pour commencer à rédiger des rapports de chantier."
            action={
              <button onClick={() => setShowCreate(true)} className="btn-primary">
                <Plus size={16} />
                Créer un projet
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="card overflow-hidden">
                <button
                  className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{project.name}</h2>
                      </div>
                      {project.address && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-2">
                          <MapPin size={11} className="shrink-0" />
                          <span className="truncate">{project.address}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
                        <span className="flex items-center gap-1">
                          <FileText size={11} />
                          {project.reportCount || 0} rapport{project.reportCount !== 1 ? 's' : ''}
                        </span>
                        {project.updatedAt && (
                          <span>Modifié {formatRelative(project.updatedAt)}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setEditProject(project)}
                        className="btn-ghost p-2 rounded-lg"
                        aria-label="Modifier"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(project)}
                        className="btn-ghost p-2 rounded-lg text-red-400 hover:text-red-500"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau projet">
        <ProjectForm onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>

      <Modal open={!!editProject} onClose={() => setEditProject(null)} title="Modifier le projet">
        {editProject && (
          <ProjectForm
            initialValues={editProject}
            onSubmit={handleEdit}
            onCancel={() => setEditProject(null)}
          />
        )}
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Supprimer le projet" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Êtes-vous sûr de vouloir supprimer <strong>{confirmDelete?.name}</strong> ? Cette action est irréversible.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Annuler</button>
          <button onClick={handleDelete} className="btn-danger">Supprimer</button>
        </div>
      </Modal>
    </div>
  )
}
