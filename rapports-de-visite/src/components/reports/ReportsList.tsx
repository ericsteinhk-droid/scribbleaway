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
import type { Report } from '../../types';
import ReportForm from './ReportForm';
import Modal from '../Modal';

interface Props {
  projectId: string;
  projectName: string;
  onOpenReport: (report: Report) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type ReportData = Omit<Report, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'entryCount' | 'attendeeCount'>;

export default function ReportsList({ projectId, projectName, onOpenReport, onError, onSuccess }: Props) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [editReport, setEditReport] = useState<Report | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);

  const basePath = `users/${user!.uid}/projects/${projectId}/reports`;

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, basePath), orderBy('number', 'desc'));
    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
      setReports(docs);
      setLoading(false);

      const counts: Record<string, number> = {};
      await Promise.all(
        docs.map(async (r) => {
          try {
            const s = await getCountFromServer(
              collection(db, `${basePath}/${r.id}/entries`)
            );
            counts[r.id] = s.data().count;
          } catch {
            counts[r.id] = 0;
          }
        })
      );
      setEntryCounts(counts);
    });
    return unsub;
  }, [user, projectId]);

  async function getNextNumber() {
    const snap = await getCountFromServer(collection(db, basePath));
    return snap.data().count + 1;
  }

  async function handleSave(data: ReportData) {
    if (!user) return;
    // Firestore rejects undefined values — strip them before writing
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    try {
      if (editReport) {
        await updateDoc(doc(db, `${basePath}/${editReport.id}`), {
          ...clean,
          updatedAt: serverTimestamp(),
        });
        // Also update project updatedAt
        await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}`), {
          updatedAt: serverTimestamp(),
        });
        onSuccess('Rapport mis à jour.');
      } else {
        const number = await getNextNumber();
        await addDoc(collection(db, basePath), {
          ...clean,
          number,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}`), {
          updatedAt: serverTimestamp(),
        });
        onSuccess('Rapport créé.');
      }
      setShowForm(false);
      setEditReport(null);
    } catch {
      onError('Erreur lors de la sauvegarde du rapport.');
    }
  }

  async function handleDelete() {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, `${basePath}/${deleteTarget.id}`));
      onSuccess('Rapport supprimé.');
    } catch {
      onError('Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function formatDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => { setEditReport(null); setShowForm(true); }}
        className="w-full mb-6 py-3 rounded-xl border-2 border-dashed border-evoq text-evoq text-sm font-medium hover:bg-evoq-light dark:hover:bg-evoq/10 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Nouveau rapport
      </button>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && reports.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-600">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">Aucun rapport pour ce projet.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {reports.map((r) => (
          <div
            key={r.id}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
          >
            <button
              onClick={() => onOpenReport(r)}
              className="w-full text-left px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-evoq bg-evoq-light dark:bg-evoq/20 px-2 py-0.5 rounded-full">
                      #{r.number}
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {formatDate(r.date)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.authorName}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span>{entryCounts[r.id] ?? 0} entrée{(entryCounts[r.id] ?? 0) !== 1 ? 's' : ''}</span>
                    {r.attendees?.length > 0 && (
                      <>
                        <span>•</span>
                        <span>{r.attendees.length} participant{r.attendees.length !== 1 ? 's' : ''}</span>
                      </>
                    )}
                    {r.weather && (
                      <>
                        <span>•</span>
                        <span>{r.weather}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditReport(r); setShowForm(true); }}
                    aria-label="Modifier le rapport"
                    className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-evoq hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
                    aria-label="Supprimer le rapport"
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

      {showForm && (
        <Modal
          title={editReport ? 'Modifier le rapport' : 'Nouveau rapport'}
          onClose={() => { setShowForm(false); setEditReport(null); }}
        >
          <ReportForm
            initial={editReport ?? undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditReport(null); }}
          />
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Supprimer le rapport" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Supprimer le rapport&nbsp;<strong>#{deleteTarget.number}</strong> du {formatDate(deleteTarget.date)} ?
            Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
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
