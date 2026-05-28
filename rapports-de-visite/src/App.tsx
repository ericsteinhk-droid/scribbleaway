import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { useToast } from './hooks/useToast';
import SplashScreen from './components/SplashScreen';
import AuthScreen from './components/AuthScreen';
import Header from './components/Header';
import Toast from './components/Toast';
import SettingsModal from './components/SettingsModal';
import ApiGateModal from './components/ApiGateModal';
import ProjectsDashboard from './components/projects/ProjectsDashboard';
import ReportsList from './components/reports/ReportsList';
import ReportForm from './components/reports/ReportForm';
import ReportDetail from './components/report-detail/ReportDetail';
import Modal from './components/Modal';
import type { NavState, Project, Report } from './types';
import {
  doc, updateDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

function AppShell() {
  const { user, loading } = useAuth();
  const { toasts, addToast, removeToast } = useToast();

  const [nav, setNav] = useState<NavState>({ screen: 'projects' });
  const [showSettings, setShowSettings] = useState(false);
  const [apiGate, setApiGate] = useState<'anthropic' | 'openai' | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [headerActions, setHeaderActions] = useState<React.ReactNode>(null);

  // Edit report modal state (accessible from ReportDetail header)
  const [editReportModal, setEditReportModal] = useState<Report | null>(null);

  // Background-resume guard (60s)
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else {
        if (hiddenAt.current && Date.now() - hiddenAt.current > 60000) {
          window.location.reload();
        }
        hiddenAt.current = null;
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // bfcache guard
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) window.location.reload();
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Online/offline
  useEffect(() => {
    const up = () => setOnline(true);
    const dn = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', dn);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn); };
  }, []);

  if (loading) return <SplashScreen />;
  if (!user) return <AuthScreen />;

  function goToReports(project: Project) {
    setHeaderActions(null);
    setNav({
      screen: 'reports',
      projectId: project.id,
      projectName: project.name,
      projectAddress: project.address,
    });
  }

  function goToReportDetail(report: Report) {
    setHeaderActions(null);
    setNav((n) => ({
      ...n,
      screen: 'report-detail',
      reportId: report.id,
      reportNumber: report.number,
    }));
  }

  function goBack() {
    setHeaderActions(null);
    if (nav.screen === 'report-detail') {
      setNav((n) => ({ ...n, screen: 'reports', reportId: undefined }));
    } else if (nav.screen === 'reports') {
      setNav({ screen: 'projects' });
    }
  }

  function getHeaderTitle() {
    if (nav.screen === 'projects') return 'Projets';
    if (nav.screen === 'reports') return nav.projectName ?? 'Rapports';
    if (nav.screen === 'report-detail') return `Rapport #${nav.reportNumber ?? ''}`;
    return '';
  }

  function getHeaderSubtitle() {
    if (nav.screen === 'reports') return nav.projectAddress;
    if (nav.screen === 'report-detail') return nav.projectName;
    return undefined;
  }

  async function handleSaveEditReport(data: Omit<Report, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'entryCount' | 'attendeeCount'>) {
    if (!editReportModal || !nav.projectId) return;
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    try {
      await updateDoc(
        doc(db, `users/${user!.uid}/projects/${nav.projectId}/reports/${editReportModal.id}`),
        { ...clean, updatedAt: serverTimestamp() }
      );
      addToast('Rapport mis à jour.', 'success');
    } catch {
      addToast('Erreur lors de la mise à jour du rapport.', 'error');
    }
    setEditReportModal(null);
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title={getHeaderTitle()}
        subtitle={getHeaderSubtitle()}
        onBack={nav.screen !== 'projects' ? goBack : undefined}
        onSettings={() => setShowSettings(true)}
        online={online}
        actions={headerActions}
      />

      <main className="flex-1">
        {nav.screen === 'projects' && (
          <ProjectsDashboard
            onOpenProject={goToReports}
            onError={(m) => addToast(m, 'error')}
            onSuccess={(m) => addToast(m, 'success')}
          />
        )}

        {nav.screen === 'reports' && nav.projectId && (
          <ReportsList
            projectId={nav.projectId}
            projectName={nav.projectName ?? ''}
            onOpenReport={goToReportDetail}
            onError={(m) => addToast(m, 'error')}
            onSuccess={(m) => addToast(m, 'success')}
          />
        )}

        {nav.screen === 'report-detail' && nav.projectId && nav.reportId && (
          <ReportDetailWrapper
            projectId={nav.projectId}
            projectName={nav.projectName ?? ''}
            projectAddress={nav.projectAddress}
            reportId={nav.reportId}
            onError={(m) => addToast(m, 'error')}
            onSuccess={(m) => addToast(m, 'success')}
            onNeedApiKey={(type) => setApiGate(type)}
            onEditReport={(r) => setEditReportModal(r)}
            onExportActionsReady={setHeaderActions}
          />
        )}
      </main>

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {apiGate && (
        <ApiGateModal
          onClose={() => setApiGate(null)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {editReportModal && (
        <Modal title="Modifier le rapport" onClose={() => setEditReportModal(null)}>
          <ReportForm
            initial={editReportModal}
            onSave={handleSaveEditReport}
            onCancel={() => setEditReportModal(null)}
          />
        </Modal>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

// Wrapper to load the report from Firestore and pass it to ReportDetail
import { useEffect as useEff, useState as useSt } from 'react';
import { getDoc } from 'firebase/firestore';

function ReportDetailWrapper({
  projectId, projectName, projectAddress, reportId,
  onError, onSuccess, onNeedApiKey, onEditReport, onExportActionsReady,
}: {
  projectId: string;
  projectName: string;
  projectAddress?: string;
  reportId: string;
  onError: (m: string) => void;
  onSuccess: (m: string) => void;
  onNeedApiKey: (type: 'anthropic' | 'openai') => void;
  onEditReport: (r: Report) => void;
  onExportActionsReady: (actions: React.ReactNode) => void;
}) {
  const { user } = useAuth();
  const [report, setReport] = useSt<Report | null>(null);

  useEff(() => {
    if (!user) return;
    const docRef = doc(db, `users/${user.uid}/projects/${projectId}/reports/${reportId}`);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setReport({ id: snap.id, ...snap.data() } as Report);
      }
    });
    return unsub;
  }, [user, projectId, reportId]);

  if (!report) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ReportDetail
      report={report}
      projectId={projectId}
      projectName={projectName}
      projectAddress={projectAddress}
      onError={onError}
      onSuccess={onSuccess}
      onNeedApiKey={onNeedApiKey}
      onEditReport={() => onEditReport(report)}
      onExportActionsReady={onExportActionsReady}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
