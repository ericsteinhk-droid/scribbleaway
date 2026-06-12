import React, { useEffect } from 'react';
import { useStore } from './store/index.js';
import { useConversations } from './hooks/useConversations.js';
import { useSettings } from './hooks/useSettings.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import Header from './components/layout/Header.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Footer from './components/layout/Footer.jsx';
import ChatArea from './components/chat/ChatArea.jsx';
import ToastContainer from './components/common/Toast.jsx';
import SettingsModal from './components/modals/SettingsModal.jsx';
import ExportModal from './components/modals/ExportModal.jsx';
import PromptLibraryModal from './components/modals/PromptLibraryModal.jsx';
import CompareModal from './components/modals/CompareModal.jsx';
import AdminPanel from './components/modals/AdminPanel.jsx';

export default function App() {
  const { darkMode, readingMode } = useStore();
  const { loadConversations, loadFolders, newConversation } = useConversations();
  const { loadSettings } = useSettings();
  const { stopStream } = useStore();

  // Initial data load
  useEffect(() => {
    loadSettings();
    loadConversations();
    loadFolders();
  }, []);

  // Session timeout
  useEffect(() => {
    const { settings } = useStore.getState();
    if (!settings.sessionTimeoutMin) return;
    const timeoutMs = settings.sessionTimeoutMin * 60 * 1000;
    let timer = setTimeout(() => {
      useStore.getState().showToast('Session expirée — rechargez la page pour continuer.', 'error');
    }, timeoutMs);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        useStore.getState().showToast('Session expirée — rechargez la page pour continuer.', 'error');
      }, timeoutMs);
    };
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
    };
  }, []);

  useKeyboard({
    onNewConversation: newConversation,
    onStop: stopStream,
  });

  const handleNewConversation = () => {
    newConversation();
    setTimeout(() => document.querySelector('.prompt-textarea')?.focus(), 50);
  };

  return (
    <div className={`app${darkMode ? ' dark-mode' : ''}${readingMode ? ' reading-mode' : ''}`}>
      <Sidebar onNewConversation={handleNewConversation} />
      <div className="main">
        <Header />
        <ChatArea />
        <Footer />
      </div>
      <ToastContainer />
      <SettingsModal />
      <ExportModal />
      <PromptLibraryModal />
      <CompareModal />
      <AdminPanel />
    </div>
  );
}
