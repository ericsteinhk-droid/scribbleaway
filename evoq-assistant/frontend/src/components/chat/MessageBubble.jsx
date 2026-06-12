import React, { useMemo, useState, useCallback } from 'react';
import { useStore } from '../../store/index.js';
import { renderMarkdown } from '../../utils/markdown.js';
import { fmtTokens, fmtCost } from '../../utils/tokens.js';

const PROVIDER_CLASS = { anthropic: 'claude-msg', openai: 'gpt-msg', gemini: 'gemini-msg' };
const WHO_CLASS      = { anthropic: 'claude-who', openai: 'gpt-who', gemini: 'gemini-who' };
const WHO_LABEL      = { anthropic: 'Claude', openai: 'GPT', gemini: 'Gemini' };

function AttachmentChips({ attachments }) {
  const parsed = useMemo(() => {
    try { return JSON.parse(attachments || '[]'); } catch { return []; }
  }, [attachments]);
  if (!parsed.length) return null;
  return (
    <div className="msg-attachments">
      {parsed.map((a, i) => (
        <div key={i} className="attach-chip">
          {a.type === 'image' ? '🖼' : a.type === 'pdf' ? '📄' : '📎'} {a.name}
        </div>
      ))}
    </div>
  );
}

export default function MessageBubble({ message, onRegenerate, onEdit, onDelete, onFork }) {
  const { excluded, toggleExcluded, streaming, streamingConvId } = useStore();
  const [copied, setCopied] = useState(false);
  const isExcluded = excluded[message.id];

  const isUser = message.role === 'user';
  const isError = message.error;
  const isSummary = message.role === 'summary';
  const provider = message.provider;

  const cardClass = [
    'msg-card',
    isUser ? 'user' : (PROVIDER_CLASS[provider] || 'user'),
    isError ? 'error-msg' : '',
    isSummary ? 'summary-msg' : '',
    isExcluded ? 'excluded' : '',
  ].filter(Boolean).join(' ');

  const whoClass = isUser ? 'user-who' : isError ? 'error-who' : isSummary ? 'summary-who' : (WHO_CLASS[provider] || 'user-who');
  const whoLabel = isUser ? 'Vous' : isSummary ? 'Résumé' : (WHO_LABEL[provider] || 'Assistant');

  const bodyHtml = useMemo(() => {
    if (isUser) {
      return message.content
        ? message.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
        : '';
    }
    return renderMarkdown(message.content || '');
  }, [message.content, isUser]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content || '').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.content]);

  const when = useMemo(() => {
    if (!message.createdAt) return '';
    return new Date(message.createdAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  }, [message.createdAt]);

  return (
    <div className="msg-wrapper">
      <div className={cardClass}>
        {/* Context exclusion checkbox */}
        <div className="msg-exclude-wrap">
          <input
            type="checkbox"
            id={`exc-${message.id}`}
            checked={!!isExcluded}
            onChange={() => toggleExcluded(message.id)}
            title="Exclure du contexte"
          />
          <label htmlFor={`exc-${message.id}`} style={{ cursor: 'pointer', fontSize: 11, color: 'var(--faint)' }}>
            Exclure
          </label>
        </div>

        {/* Meta */}
        <div className="msg-meta">
          <span className={`msg-who ${whoClass}`}>{whoLabel}</span>
          {!isUser && message.model && (
            <span className="msg-model">{message.model}</span>
          )}
          {when && <span className="msg-time">{when}</span>}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments !== '[]' && (
          <AttachmentChips attachments={message.attachments} />
        )}

        {/* Body */}
        <div
          className="msg-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {/* Token / cost info */}
        {!isUser && (message.tokenInput || message.tokenOutput) && (
          <div className="msg-usage">
            {message.tokenInput != null && (
              <span title="Tokens en entrée">▲ {fmtTokens(message.tokenInput)}</span>
            )}
            {message.tokenOutput != null && (
              <span title="Tokens en sortie">▼ {fmtTokens(message.tokenOutput)}</span>
            )}
            {message.costUsd != null && (
              <span title="Coût estimé">{fmtCost(message.costUsd)}</span>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="msg-actions">
        <button className="msg-action" onClick={handleCopy}>
          {copied ? '✓ Copié' : 'Copier'}
        </button>
        {!isUser && !isError && (
          <button className="msg-action" onClick={() => onRegenerate?.(message)}>
            Régénérer
          </button>
        )}
        {isUser && (
          <button className="msg-action" onClick={() => onEdit?.(message)}>
            Modifier
          </button>
        )}
        <button className="msg-action" onClick={() => onFork?.(message.id)}>
          Bifurquer ici
        </button>
        {isError && (
          <button className="msg-action" onClick={() => onRegenerate?.(message)}>
            Réessayer
          </button>
        )}
        <button className="msg-action danger" onClick={() => onDelete?.(message.id)}>
          Supprimer
        </button>
      </div>
    </div>
  );
}
