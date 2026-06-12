import { useCallback, useEffect } from 'react';
import { useStore } from '../store/index.js';
import { settingsApi, promptApi } from '../api/client.js';

export function useSettings() {
  const store = useStore();

  const loadSettings = useCallback(async () => {
    try {
      const data = await settingsApi.get();
      store.setSettings(data);
      // Sync current provider/model with defaults
      store.setCurrentProvider(data.defaultProvider || 'anthropic');
    } catch {}
  }, []);

  const saveSettings = useCallback(async (settings) => {
    try {
      await settingsApi.set(settings);
      store.setSettings(settings);
      store.showToast('Paramètres enregistrés', 'success');
    } catch (err) {
      store.showToast('Erreur sauvegarde : ' + err.message, 'error');
    }
  }, []);

  const loadPromptLibrary = useCallback(async () => {
    try {
      const data = await promptApi.list();
      store.setPromptLibrary(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  const addPrompt = useCallback(async (name, content) => {
    try {
      const p = await promptApi.create({ name, content });
      store.addPrompt(p);
      store.showToast('Prompt enregistré', 'success');
    } catch (err) {
      store.showToast('Erreur : ' + err.message, 'error');
    }
  }, []);

  const deletePrompt = useCallback(async (id) => {
    try {
      await promptApi.delete(id);
      store.deletePrompt(id);
    } catch {}
  }, []);

  return { loadSettings, saveSettings, loadPromptLibrary, addPrompt, deletePrompt };
}
