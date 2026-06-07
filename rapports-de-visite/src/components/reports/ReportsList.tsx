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
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Report, Entry, Letterhead } from '../../types';
import { exportGroupedPdf } from '../../utils/pdfExport';
import { shareOrDownload } from '../../utils/shareFile';
import ReportForm from './ReportForm';
import Modal from '../Modal';

interface Props {
  projectId: string;
  projectName: string;
  letterhead?: Letterhead;
  onOpenReport: (report: Report) => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

type ReportData = Omit<Report, 'id' | 'createdAt' | 'updatedAt' | 'entryCount' | 'attendeeCount'>;

export default function ReportsList({ projectId, projectName, letterhead, onOpenReport, onError, onSuccess }: Props) {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [editReport, setEditReport] = useState<Report | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupedExporting, setGroupedExporting] = useState(false);
  const [groupedProgress, setGroupedProgress] = useState<string | null>(null);

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

  // Derive next suggested number from already-loaded reports — no extra Firestore read needed
  const suggestedNumber = reports.length > 0
    ? Math.max(...reports.map((r) => r.number)) + 1
    : 1;

  async function handleSave(data: ReportData) {
    if (!user) return;
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    try {
      if (editReport) {
        await updateDoc(doc(db, `${basePath}/${editReport.id}`), {
          ...clean,
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, `users/${user.uid}/projects/${projectId}`), {
          updatedAt: serverTimestamp(),
        });
        onSuccess('Rapport mis à jour.');
      } else {
        await addDoc(collection(db, basePath), {
          ...clean,
          createdAt: Timestamp.fromDate(new Date()),
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

  async function handleGroupedExport() {
    if (selectedIds.size < 2 || !user) return;
    setGroupedExporting(true);
    setGroupedProgress('Chargement…');
    const selected = reports.filter((r) => selectedIds.has(r.id));

    const visitsData = await Promise.all(
      selected.map(async (report) => {
        const q = query(
          collection(db, `${basePath}/${report.id}/entries`),
          orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(q);
        const entries = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Entry));
        return { report, entries };
      })
    );

    try {
      const blob = await exportGroupedPdf(
        visitsData,
        projectName,
        undefined,
        letterhead ?? 'evoq',
        (c, t) => setGroupedProgress(`${c}/${t}`)
      );
      const nums = selected.map((r) => r.number).join('-');
      await shareOrDownload(blob, `Rapports-${nums}-${projectName.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`, 'application/pdf');
      onSuccess('Rapport group\xE9 export\xE9.');
      setSelectMode(false);
      setSelectedIds(new Set());
    } catch {
      onError('Erreur lors de l\'export group\xE9.');
    } finally {
      setGroupedExporting(false);
      setGroupedProgress(null);
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
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => { setEditReport(null); setShowForm(true); }}
          disabled={selectMode}
          className="flex-1 py-3 rounded-xl border-2 border-dashed border-evoq text-evoq text-sm font-medium hover:bg-evoq-light dark:hover:bg-evoq/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau rapport
        </button>
        {reports.length >= 2 && (
          <button
            onClick={() => {
              setSelectMode((m) => !m);
              setSelectedIds(new Set());
            }}
            className="shrink-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {selectMode ? 'Annuler' : 'S\xE9lectionner'}
          </button>
        )}
      </div>

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
        {reports.map((r) => {
          const isSelected = selectedIds.has(r.id);
          return (
            <div
              key={r.id}
              className={`bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-hidden transition-colors ${
                isSelected
                  ? 'border-evoq ring-1 ring-evoq'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <button
                onClick={() => {
                  if (selectMode) {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    });
                  } else {
                    onOpenReport(r);
                  }
                }}
                className="w-full text-left px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  {selectMode && (
                    <div className="shrink-0 mt-0.5 flex items-center justify-center">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-evoq border-evoq'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
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
                      <span>{entryCounts[r.id] ?? 0} entr\xE9e{(entryCounts[r.id] ?? 0) !== 1 ? 's' : ''}</span>
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
                  {!selectMode && (
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
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Floating action bar for grouped export */}
      {selectMode && selectedIds.size >= 2 && (
        <div
          className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-4 flex items-center justify-between gap-3 pt-3"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {selectedIds.size} rapport{selectedIds.size !== 1 ? 's' : ''} s\xE9lectionn\xE9{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={handleGroupedExport}
            disabled={groupedExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-evoq text-white text-sm font-medium hover:bg-evoq-dark disabled:opacity-60 disabled:cursor-wait transition-colors"
          >
            {groupedExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {groupedProgress ?? '…'}
              </>
            ) : (
              'Exporter PDF'
            )}
          </button>
        </div>
      )}

      {showForm && (
        <Modal
          title={editReport ? 'Modifier le rapport' : 'Nouveau rapport'}
          onClose={() => { setShowForm(false); setEditReport(null); }}
        >
          <ReportForm
            initial={editReport ?? undefined}
            suggestedNumber={editReport ? undefined : suggestedNumber}
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
