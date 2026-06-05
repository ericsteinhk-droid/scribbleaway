import { useEffect, useState } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { Report, Entry, EntryType, Photo } from '../../types';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../../types';
import EntryForm from './EntryForm';
import PhotoGrid from './PhotoGrid';
import Modal from '../Modal';
import { exportPdf } from '../../utils/pdfExport';
import { exportDocx } from '../../utils/docxExport';
import { exportZip } from '../../utils/zipExport';
import { shareOrDownload } from '../../utils/shareFile';

function slugify(s: string) {
  return s.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
}

interface Props {
  report: Report;
  projectId: string;
  projectName: string;
  projectAddress?: string;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onNeedApiKey: (type: 'anthropic' | 'openai') => void;
  onEditReport: () => void;
  onExportActionsReady: (actions: React.ReactNode) => void;
}

export default function ReportDetail({
  report,
  projectId,
  projectName,
  projectAddress,
  onError,
  onSuccess,
  onNeedApiKey,
  onEditReport,
  onExportActionsReady,
}: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editEntry, setEditEntry] = useState<Entry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAttendees, setShowAttendees] = useState(false);

  // Export states
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [docxProgress, setDocxProgress] = useState<string | null>(null);
  const [zipProgress, setZipProgress] = useState<string | null>(null);

  const basePath = `users/${user!.uid}/projects/${projectId}/reports/${report.id}/entries`;

  useEffect(() => {
    const q = query(collection(db, basePath), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Entry)));
      setLoading(false);
    });
    return unsub;
  }, [basePath]);

  // Inject export buttons into header
  useEffect(() => {
    onExportActionsReady(
      <>
        <ExportButton
          label={pdfProgress ?? 'PDF'}
          busy={!!pdfProgress}
          onClick={handlePdfExport}
          icon="📄"
          title="Exporter en PDF"
        />
        <ExportButton
          label={docxProgress ?? 'DOCX'}
          busy={!!docxProgress}
          onClick={handleDocxExport}
          icon="📝"
          title="Exporter en Word"
        />
        <ExportButton
          label={zipProgress ?? 'ZIP'}
          busy={!!zipProgress}
          onClick={handleZipExport}
          icon="🗜"
          title="Exporter les photos"
        />
      </>
    );
  }, [pdfProgress, docxProgress, zipProgress, entries]);

  async function handlePdfExport() {
    setPdfProgress('…');
    try {
      const blob = await exportPdf(report, entries, projectName, projectAddress, (c, t) => {
        setPdfProgress(`${c}/${t}`);
      });
      const name = `Rapport-${report.number}-${slugify(projectName)}.pdf`;
      await shareOrDownload(blob, name, 'application/pdf');
      onSuccess('PDF exporté.');
    } catch (err) {
      onError('Export PDF: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfProgress(null);
    }
  }

  async function handleDocxExport() {
    setDocxProgress('…');
    const firmName = user?.displayName?.split(' — ')[1] ?? 'EVOQ Architecture';
    let blob: Blob | undefined;
    try {
      blob = await exportDocx(report, entries, projectName, projectAddress, firmName, (c, t) => {
        setDocxProgress(`${c}/${t}`);
      });
    } catch (err) {
      onError('Erreur lors de l\'export Word.');
      setDocxProgress(null);
      return;
    }
    try {
      const name = `Rapport-${report.number}-${slugify(projectName)}.docx`;
      await shareOrDownload(blob, name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      onSuccess('Document Word exporté.');
    } catch (err) {
      onError('Erreur lors du partage Word.');
    } finally {
      setDocxProgress(null);
    }
  }

  async function handleZipExport() {
    setZipProgress('…');
    try {
      const blob = await exportZip(entries, report.number, projectName, (c, t) => {
        setZipProgress(`${c}/${t}`);
      });
      const name = `Photos-Rapport-${report.number}-${slugify(projectName)}.zip`;
      await shareOrDownload(blob, name, 'application/zip');
      onSuccess('Photos exportées.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'export ZIP.';
      onError(msg);
    } finally {
      setZipProgress(null);
    }
  }

  async function handleSubmitEntry(type: EntryType, content: string, photos: Photo[]) {
    if (!user) return;
    if (editEntry) {
      await updateDoc(doc(db, `${basePath}/${editEntry.id}`), {
        type, content, photos, updatedAt: serverTimestamp(),
      });
      onSuccess('Entrée mise à jour.');
    } else {
      await addDoc(collection(db, basePath), {
        type, content, photos,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: serverTimestamp(),
      });
      onSuccess('Entrée ajoutée.');
    }
    setShowEntryForm(false);
    setEditEntry(null);
  }

  async function handleDeleteEntry() {
    if (!user || !deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, `${basePath}/${deleteTarget.id}`));
      onSuccess('Entrée supprimée.');
    } catch {
      onError('Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const typeOrder: EntryType[] = ['observation', 'avancement', 'discussion', 'directive'];
  const grouped = typeOrder
    .map((t) => ({ type: t, entries: entries.filter((e) => e.type === t) }))
    .filter((g) => g.entries.length > 0);

  function formatDate(s: string) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      {/* Report header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-evoq bg-evoq-light dark:bg-evoq/20 px-2 py-0.5 rounded-full">
                #{report.number}
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatDate(report.date)}{report.time ? ` à ${report.time}` : ''}
              </span>
            </div>
            {report.weather && <p className="text-xs text-gray-400 dark:text-gray-500">{report.weather}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.authorName}</p>
          </div>
          <button
            onClick={onEditReport}
            aria-label="Modifier le rapport"
            className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-evoq hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>

        {report.attendees?.length > 0 && (
          <button
            onClick={() => setShowAttendees(true)}
            className="text-xs text-evoq hover:underline"
          >
            {report.attendees.length} participant{report.attendees.length !== 1 ? 's' : ''} →
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-gray-600">
          <p className="text-sm">Aucune entrée. Appuyez sur + pour ajouter.</p>
        </div>
      )}

      {/* Grouped entries */}
      {grouped.map((group) => {
        const colors = ENTRY_TYPE_COLORS[group.type];
        return (
          <div key={group.type} className="mb-6">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${colors.bg} ${colors.border} border`}>
              <span className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
              <span className={`text-xs font-semibold ${colors.text}`}>
                {ENTRY_TYPE_LABELS[group.type]} ({group.entries.length})
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {group.entries.map((entry, idx) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  index={idx + 1}
                  storagePath={`users/${user!.uid}/projects/${projectId}/reports/${report.id}/entries/${entry.id}`}
                  onEdit={() => { setEditEntry(entry); setShowEntryForm(true); }}
                  onDelete={() => setDeleteTarget(entry)}
                  onPhotosChange={(photos) => {
                    updateDoc(doc(db, `${basePath}/${entry.id}`), { photos, updatedAt: serverTimestamp() });
                  }}
                  onError={onError}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* FAB */}
      <button
        onClick={() => { setEditEntry(null); setShowEntryForm(true); }}
        aria-label="Ajouter une entrée"
        className="fixed bottom-6 right-6 w-14 h-14 bg-evoq text-white rounded-full shadow-lg flex items-center justify-center hover:bg-evoq-dark transition-colors"
        style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Entry form */}
      {showEntryForm && (
        <Modal
          title={editEntry ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
          onClose={() => { setShowEntryForm(false); setEditEntry(null); }}
          maxWidth="max-w-lg"
        >
          <EntryForm
            initial={editEntry ?? undefined}
            storagePath={`users/${user!.uid}/projects/${projectId}/reports/${report.id}/entries/${editEntry?.id ?? 'new'}`}
            onSubmit={handleSubmitEntry}
            onCancel={() => { setShowEntryForm(false); setEditEntry(null); }}
            onNeedApiKey={onNeedApiKey}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Modal title="Supprimer l'entrée" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Supprimer cette entrée ? Cette action est irréversible.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
              Annuler
            </button>
            <button
              onClick={handleDeleteEntry}
              disabled={deleting}
              className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {deleting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              Supprimer
            </button>
          </div>
        </Modal>
      )}

      {/* Attendees */}
      {showAttendees && (
        <Modal title="Participants" onClose={() => setShowAttendees(false)}>
          <ul className="flex flex-col gap-2">
            {report.attendees.map((a, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-evoq shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}

// Export button helper
function ExportButton({
  label, busy, onClick, icon, title,
}: { label: string; busy: boolean; onClick: () => void; icon: string; title: string }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={title}
      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 disabled:cursor-wait"
    >
      {busy ? (
        <div className="w-3 h-3 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
      ) : (
        <span>{icon}</span>
      )}
      {label}
    </button>
  );
}

// Entry card
function EntryCard({
  entry, index, storagePath, onEdit, onDelete, onPhotosChange, onError,
}: {
  entry: Entry;
  index: number;
  storagePath: string;
  onEdit: () => void;
  onDelete: () => void;
  onPhotosChange: (photos: Photo[]) => void;
  onError: (msg: string) => void;
}) {
  const colors = ENTRY_TYPE_COLORS[entry.type];
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border ${colors.border} shadow-sm p-4`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${colors.text}`}>{index}.</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
            {ENTRY_TYPE_LABELS[entry.type]}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            aria-label="Modifier l'entrée"
            className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-evoq hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Supprimer l'entrée"
              className="touch-target flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={onDelete} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded-md">Supprimer</button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded-md text-gray-500">Annuler</button>
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed mb-3">
        {entry.content}
      </p>

      <PhotoGrid
        photos={entry.photos}
        storagePath={storagePath}
        onPhotosChange={onPhotosChange}
        onError={onError}
      />
    </div>
  );
}
