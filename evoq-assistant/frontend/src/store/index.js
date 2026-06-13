import { create } from 'zustand';

const DEFAULT_SETTINGS = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-6',
  defaultSystemPrompt: '',
  temperature: 0.7,
  maxTokens: 4096,
  contextStrategy: 'all',  // 'all' | 'last_n' | 'auto_summarize'
  contextLastN: 20,
  sessionTimeoutMin: 0,
  convTtlDays: 0,
  maxFileSizeMb: 10,
  claudeModel: 'claude-sonnet-4-6',
  gptModel: 'gpt-4o',
  geminiModel: 'gemini-2.5-flash-preview-05-20',
  geminiImageModel: 'gemini-2.5-flash-preview-05-20',
};

export const useStore = create((set, get) => ({
  // ── Conversations ───────────────────────────────────────────
  conversations: [],
  activeConvId: null,
  folders: [],

  setConversations: (convs) => set({ conversations: convs }),
  addConversation: (conv) => set(s => ({ conversations: [conv, ...s.conversations] })),
  updateConversation: (id, patch) => set(s => ({
    conversations: s.conversations.map(c => c.id === id ? { ...c, ...patch } : c),
  })),
  deleteConversation: (id) => set(s => {
    const filtered = s.conversations.filter(c => c.id !== id);
    return {
      conversations: filtered,
      activeConvId: s.activeConvId === id ? (filtered[0]?.id || null) : s.activeConvId,
      messages: Object.fromEntries(Object.entries(s.messages).filter(([k]) => k !== id)),
    };
  }),
  setActiveConvId: (id) => set({ activeConvId: id }),

  setFolders: (folders) => set({ folders }),
  addFolder: (folder) => set(s => ({ folders: [...s.folders, folder] })),
  deleteFolder: (id) => set(s => ({ folders: s.folders.filter(f => f.id !== id) })),

  // ── Messages ────────────────────────────────────────────────
  messages: {},

  setMessages: (convId, msgs) => set(s => ({ messages: { ...s.messages, [convId]: msgs } })),
  addMessage: (convId, msg) => set(s => ({
    messages: { ...s.messages, [convId]: [...(s.messages[convId] || []), msg] },
  })),
  updateMessage: (convId, msgId, patch) => set(s => ({
    messages: {
      ...s.messages,
      [convId]: (s.messages[convId] || []).map(m => m.id === msgId ? { ...m, ...patch } : m),
    },
  })),
  deleteMessage: (convId, msgId) => set(s => ({
    messages: {
      ...s.messages,
      [convId]: (s.messages[convId] || []).filter(m => m.id !== msgId),
    },
  })),
  truncateFrom: (convId, msgId) => set(s => {
    const msgs = s.messages[convId] || [];
    const idx = msgs.findIndex(m => m.id === msgId);
    return {
      messages: { ...s.messages, [convId]: idx >= 0 ? msgs.slice(0, idx) : msgs },
    };
  }),

  // ── Streaming ───────────────────────────────────────────────
  streaming: false,
  streamingContent: '',
  streamingConvId: null,
  abortController: null,

  startStream: (convId) => {
    const controller = new AbortController();
    set({ streaming: true, streamingContent: '', streamingConvId: convId, abortController: controller });
    return controller;
  },
  appendStreamChunk: (text) => set(s => ({ streamingContent: s.streamingContent + text })),
  stopStream: (abort = false) => {
    const { abortController } = get();
    if (abort && abortController) abortController.abort();
    set({ streaming: false, streamingContent: '', streamingConvId: null, abortController: null });
  },

  // ── UI ──────────────────────────────────────────────────────
  sidebarOpen: window.innerWidth > 720,
  darkMode: localStorage.getItem('evoq:darkMode') === '1',
  ephemeralMode: false,
  readingMode: false,
  activeModal: null,

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setDarkMode: (v) => {
    localStorage.setItem('evoq:darkMode', v ? '1' : '0');
    set({ darkMode: v });
  },
  setEphemeralMode: (v) => set({ ephemeralMode: v }),
  setReadingMode: (v) => set({ readingMode: v }),
  openModal: (name) => set({ activeModal: name }),
  closeModal: () => set({ activeModal: null }),

  // ── Toasts ──────────────────────────────────────────────────
  toasts: [],

  showToast: (message, type = 'info') => {
    const id = Date.now();
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  hideToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  // ── Settings ────────────────────────────────────────────────
  settings: { ...DEFAULT_SETTINGS },
  settingsLoaded: false,

  setSettings: (s) => set({ settings: { ...DEFAULT_SETTINGS, ...s }, settingsLoaded: true }),
  updateSetting: (key, value) => set(s => ({ settings: { ...s.settings, [key]: value } })),

  // ── Current chat provider/model ─────────────────────────────
  currentProvider: 'anthropic',
  currentModel: 'claude-sonnet-4-6',

  setCurrentProvider: (p) => set(s => ({
    currentProvider: p,
    currentModel: {
      anthropic: s.settings.claudeModel,
      openai: s.settings.gptModel,
      gemini: s.settings.geminiModel,
    }[p] || s.currentModel,
  })),
  setCurrentModel: (m) => set({ currentModel: m }),

  // ── Drafts ──────────────────────────────────────────────────
  drafts: {},
  setDraft: (convId, text) => set(s => ({ drafts: { ...s.drafts, [convId]: text } })),

  // ── Context exclusions ──────────────────────────────────────
  excluded: {},
  toggleExcluded: (msgId) => set(s => ({
    excluded: { ...s.excluded, [msgId]: !s.excluded[msgId] },
  })),

  // ── Prompt library ──────────────────────────────────────────
  promptLibrary: [],
  setPromptLibrary: (list) => set({ promptLibrary: list }),
  addPrompt: (p) => set(s => ({ promptLibrary: [...s.promptLibrary, p] })),
  deletePrompt: (id) => set(s => ({ promptLibrary: s.promptLibrary.filter(p => p.id !== id) })),

  // ── Compare mode ────────────────────────────────────────────
  compareMode: false,
  compareTargets: ['anthropic', 'openai'],
  compareResults: {},

  setCompareMode: (v) => set({ compareMode: v }),
  setCompareTargets: (targets) => set({ compareTargets: targets }),
  setCompareResult: (provider, content) => set(s => ({
    compareResults: { ...s.compareResults, [provider]: content },
  })),
  clearCompareResults: () => set({ compareResults: {} }),
}));
