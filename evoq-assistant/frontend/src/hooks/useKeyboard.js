import { useEffect } from 'react';
import { useStore } from '../store/index.js';

export function useKeyboard({ onNewConversation, onStop }) {
  const store = useStore();

  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K — new conversation
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onNewConversation?.();
        return;
      }
      // Escape — stop streaming
      if (e.key === 'Escape') {
        if (store.streaming) {
          onStop?.();
        }
        if (store.activeModal) {
          store.closeModal();
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [store.streaming, store.activeModal, onNewConversation, onStop]);
}
