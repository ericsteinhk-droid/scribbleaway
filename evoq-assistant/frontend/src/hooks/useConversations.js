import { useCallback, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { convApi, msgApi, folderApi } from '../api/client.js';

export function useConversations() {
  const store = useStore();

  const loadConversations = useCallback(async () => {
    try {
      const data = await convApi.list();
      store.setConversations(Array.isArray(data) ? data : (data.conversations || []));
    } catch (err) {
      store.showToast('Erreur chargement conversations : ' + err.message, 'error');
    }
  }, []);

  const loadMessages = useCallback(async (convId) => {
    if (!convId) return;
    if (store.messages[convId]) return; // already loaded
    try {
      const data = await msgApi.list(convId);
      store.setMessages(convId, Array.isArray(data) ? data : (data.messages || []));
    } catch (err) {
      store.showToast('Erreur chargement messages', 'error');
    }
  }, [store.messages]);

  const loadFolders = useCallback(async () => {
    try {
      const data = await folderApi.list();
      store.setFolders(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const selectConversation = useCallback(async (id) => {
    store.setActiveConvId(id);
    await loadMessages(id);
  }, [loadMessages]);

  const newConversation = useCallback(() => {
    store.setActiveConvId(null);
  }, []);

  const deleteConversation = useCallback(async (id) => {
    try {
      await convApi.delete(id);
      store.deleteConversation(id);
    } catch (err) {
      store.showToast('Erreur suppression : ' + err.message, 'error');
    }
  }, []);

  const deleteAll = useCallback(async () => {
    try {
      await convApi.deleteAll();
      store.setConversations([]);
      store.setActiveConvId(null);
      store.showToast('Historique purgé', 'success');
    } catch (err) {
      store.showToast('Erreur purge : ' + err.message, 'error');
    }
  }, []);

  const renameConversation = useCallback(async (id, title) => {
    try {
      await convApi.update(id, { title });
      store.updateConversation(id, { title });
    } catch (err) {
      store.showToast('Erreur renommage : ' + err.message, 'error');
    }
  }, []);

  const pinConversation = useCallback(async (id, pinned) => {
    try {
      await convApi.update(id, { pinned });
      store.updateConversation(id, { pinned });
    } catch {}
  }, []);

  const forkConversation = useCallback(async (convId, messageId) => {
    try {
      const forked = await convApi.fork(convId, messageId);
      store.addConversation(forked);
      store.setActiveConvId(forked.id);
      store.showToast('Conversation dupliquée depuis ce message', 'success');
    } catch (err) {
      store.showToast('Erreur fork : ' + err.message, 'error');
    }
  }, []);

  const searchConversations = useCallback(async (q) => {
    if (!q.trim()) return store.conversations;
    try {
      const data = await convApi.search(q);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }, [store.conversations]);

  return {
    loadConversations,
    loadMessages,
    loadFolders,
    selectConversation,
    newConversation,
    deleteConversation,
    deleteAll,
    renameConversation,
    pinConversation,
    forkConversation,
    searchConversations,
  };
}
