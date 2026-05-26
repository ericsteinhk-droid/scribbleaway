import { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Project } from '../../types';
import ProjectForm from './ProjectForm';
import Modal from '../Modal';

interface Props {
  onOpenProject: (project: Project) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export default function ProjectsDashboard({ onOpenProject, onError, onSuccess }: Props) {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportCounts, setReportCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, `users/${user.uid}/projects`),
      orderBy('updatedAt', 'desc')
    );
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project));
      setProjects(docs);
      setLoading(false);

      // Fetch report counts
      const counts: Record<string, number> = {};
      await Promise.all(
        docs.map(async (p) => {
          try {
            const snap2 = await getCountFromServer(
              collection(db, `users/${user.uid}/projects/${p.id}/reports`)
            );
            counts[p.id] = snap2.data().count;
          } catch {
            counts[p.id] = 0;
          }
        })
      );
      setReportCounts(counts);
    });
    return unsub;
  }, [user]);

  async function handleSave(name: string, address?: string) {
    if (!user) return;
    try {
      if (editProject) {
        await updateDoc(doc(db, `users/${user.uid}/projects/${editProject.id}`), {
          name,
          address: address ?? '',
          updatedAt: serverTimestamp(),
        });
        onSuccess('Projet mis à jour.');
      } else {
        await addDoc(collection(db, `users/${user.uid}/projects`), {
          name,
          address: address ?? '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onSuccess('Projet créé.');
      }
      setShowForm(false);
      setEditProject(null);
    } catch {
      onError('Erreur lors de la sauvegarde du projet.');
    }
  }

  async function handleDelete() {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, `users/${user.uid}/projects/${deleteTarget.id}`));
      onSuccess('Projet supprimé.');
    } catch {
      onError('Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function formatDate(ts: Project['updatedAt']) {
    if (!ts?.toDate) return '';
    return ts.toDate().toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Add button */}
      <button
        onClick={() => { setEditProject(null); setShowForm(true); }}
        className="w-full mb-6 py-3 rounded-xl border-2 border-dashed border-evoq text-evoq text-sm font-medium hover:bg-evoq-light dark:hover:bg-evoq/10 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nouveau projet
      </button>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-600">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-sm">Aucun projet. Créez-en un pour commencer.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
          >
            <button
              onClick={() => onOpenProject(p)}
              className="w-full text-left px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{p.name}</p>
                  {p.address && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{p.address}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                    <span>{reportCounts[p.id] ?? 0} rapport{(reportCounts[p.id] ?? 0) !== 1 ? 's' : ''}</span>
                    <span>•</span>
                    <span>Modifié {formatDate(p.updatedAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditProject(p); setShowForm(true); }}
                    aria-label="Modifier le projet"
                    className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-evoq hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(p); }}
                    aria-label="Supprimer le projet"
                    className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Create/Edit form */}
      {showForm && (
        <Modal
          title={editProject ? 'Modifier le projet' : 'Nouveau projet'}
          onClose={() => { setShowForm(false); setEditProject(null); }}
        >
          <ProjectForm
            initial={editProject ?? undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditProject(null); }}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Supprimer le projet" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Supprimer «&nbsp;<strong>{deleteTarget.name}</strong>&nbsp;» et tous ses rapports ?
            Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setDeleteTarget(null)}
              className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Supprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
