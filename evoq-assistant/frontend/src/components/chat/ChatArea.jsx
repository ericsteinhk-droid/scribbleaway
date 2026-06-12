import React, { useEffect, useRef, useMemo } from 'react';
import { useStore } from '../../store/index.js';
import MessageBubble from './MessageBubble.jsx';
import ContextBar from './ContextBar.jsx';
import MessageInput from './MessageInput.jsx';
import { useChat } from '../../hooks/useChat.js';
import { msgApi, convApi, streamChat } from '../../api/client.js';
import { renderMarkdown } from '../../utils/markdown.js';

const PROMPT_SUGGESTIONS = [
  { provider: 'anthropic', text: 'Rédige un résumé de projet en 5 points clés' },
  { provider: 'anthropic', text: 'Analyse ce document et identifie les risques' },
  { provider: 'openai',    text: 'Génère un plan de communication pour un client' },
  { provider: 'gemini',    text: 'Explique ce schéma architectural et ses implications' },
];

function EmptyState({ onQuickSend }) {
  const { settings, setCurrentProvider } = useStore();

  return (
    <div className="empty-state">
      <div className="eyebrow">Routage des modèles</div>
      <h2>Vers quel modèle envoyer ce message ?</h2>
      <p>
        Sélectionnez Claude, GPT ou Gemini. Les images sont automatiquement
        routées vers Gemini Image. Les PDF sont pris en charge par Claude et Gemini.
        Les fichiers texte sont injectés dans le contexte pour tous les modèles.
      </p>
      <div className="empty-grid">
        {PROMPT_SUGGESTIONS.map((s, i) => (
          <div
            key={i}
            className={`empty-card ${s.provider === 'anthropic' ? 'claude' : s.provider === 'openai' ? 'gpt' : 'gemini'}`}
            onClick={() => { setCurrentProvider(s.provider); onQuickSend(s.text); }}
          >
            <div className="ec-label">
              {s.provider === 'anthropic' ? 'Claude' : s.provider === 'openai' ? 'GPT' : 'Gemini'}
            </div>
            <div className="ec-text">{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreamingBubble({ content, provider }) {
  const html = useMemo(() => renderMarkdown(content || '…'), [content]);
  const provClass = { anthropic: 'claude-msg', openai: 'gpt-msg', gemini: 'gemini-msg' }[provider] || 'claude-msg';
  const whoClass  = { anthropic: 'claude-who', openai: 'gpt-who', gemini: 'gemini-who' }[provider] || 'claude-who';
  const who       = { anthropic: 'Claude', openai: 'GPT', gemini: 'Gemini' }[provider] || 'Assistant';

  return (
    <div className="msg-wrapper">
      <div className={`msg-card ${provClass}`}>
        <div className="msg-meta">
          <span className={`msg-who ${whoClass}`}>{who}</span>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>
            En cours<span className="streaming-dot" />
          </span>
        </div>
        <div className="msg-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

export default function ChatArea() {
  const {
    activeConvId, messages: allMessages, conversations,
    streaming, streamingContent, streamingConvId,
    currentProvider, currentModel, settings,
    updateMessage, deleteMessage, truncateFrom,
    showToast, ephemeralMode,
  } = useStore();

  const { sendMessage, stopStreaming } = useChat();
  const scrollRef = useRef();
  const conv = conversations.find(c => c.id === activeConvId);
  const messages = (activeConvId ? allMessages[activeConvId] : null) || [];

  const [systemPrompt, setSystemPrompt] = React.useState('');
  React.useEffect(() => {
    setSystemPrompt(conv?.systemPrompt || settings.defaultSystemPrompt || '');
  }, [activeConvId, conv?.systemPrompt, settings.defaultSystemPrompt]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingContent]);

  const handleSend = ({ text, attachments }) => {
    sendMessage({
      text,
      attachments,
      provider: currentProvider,
      model: currentModel,
      systemPrompt,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    });
  };

  const handleRegenerate = async (msg) => {
    const idx = messages.findIndex(m => m.id === msg.id);
    if (idx < 0) return;
    // Find the preceding user message
    let userMsg = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) return;
    // Remove from this message onwards
    truncateFrom(activeConvId, msg.id);
    // Re-send the user message
    sendMessage({
      text: userMsg.content,
      attachments: [],
      provider: msg.provider || currentProvider,
      model: msg.model || currentModel,
      systemPrompt,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    });
  };

  const handleEdit = (msg) => {
    // Truncate from this message and restore text to input
    truncateFrom(activeConvId, msg.id);
    // We'd need to re-focus the input with this text
    const textarea = document.querySelector('.prompt-textarea');
    if (textarea) {
      textarea.value = msg.content || '';
      textarea.focus();
      textarea.dispatchEvent(new Event('input'));
    }
  };

  const handleDelete = async (msgId) => {
    deleteMessage(activeConvId, msgId);
    if (!ephemeralMode) {
      try { await msgApi.delete(msgId); } catch {}
    }
  };

  const handleFork = async (msgId) => {
    if (!activeConvId) return;
    try {
      const forked = await convApi.fork(activeConvId, msgId);
      useStore.getState().addConversation(forked);
      useStore.getState().setActiveConvId(forked.id);
      showToast('Conversation bifurquée depuis ce message', 'success');
    } catch (err) {
      showToast('Erreur : ' + err.message, 'error');
    }
  };

  const handleSummarize = async () => {
    if (!messages.length) return;
    const history = messages.map(m => `${m.role === 'user' ? 'Vous' : 'Assistant'}: ${m.content}`).join('\n\n');
    const summaryPrompt = `Résume la conversation suivante en 3-5 phrases concises en français, en gardant les points clés:\n\n${history}`;
    sendMessage({
      text: summaryPrompt,
      attachments: [],
      provider: currentProvider,
      model: currentModel,
      systemPrompt: 'Tu es un assistant qui fait des résumés concis.',
      temperature: 0.3,
      maxTokens: 500,
    });
    showToast('Résumé en cours de génération…', 'info');
  };

  const isStreaming = streaming && streamingConvId === activeConvId;
  const showEmpty = !activeConvId || (!messages.length && !isStreaming);

  return (
    <>
      {/* Context bar */}
      {messages.length > 0 && (
        <ContextBar
          messages={messages}
          systemPrompt={systemPrompt}
          onSummarize={handleSummarize}
        />
      )}

      {/* Chat scroll area */}
      <div className="chat-scroll" ref={scrollRef}>
        {showEmpty ? (
          <EmptyState onQuickSend={(text) => handleSend({ text, attachments: [] })} />
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRegenerate={handleRegenerate}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onFork={handleFork}
              />
            ))}
            {isStreaming && (
              <StreamingBubble content={streamingContent} provider={currentProvider} />
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <MessageInput
        onSend={handleSend}
        onStop={stopStreaming}
        convId={activeConvId}
        systemPrompt={systemPrompt}
        onSystemPromptChange={async (v) => {
          setSystemPrompt(v);
          if (activeConvId && !ephemeralMode) {
            try { await convApi.update(activeConvId, { systemPrompt: v }); } catch {}
          }
        }}
      />
    </>
  );
}
