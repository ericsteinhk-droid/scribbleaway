import React, { useMemo } from 'react';
import { useStore } from '../../store/index.js';
import { calcContextTokens, contextPercent, fmtTokens, CONTEXT_LIMITS } from '../../utils/tokens.js';

export default function ContextBar({ messages, systemPrompt, onSummarize }) {
  const { currentProvider, settings } = useStore();

  const { used, limit, pct } = useMemo(() => {
    const used = calcContextTokens(messages, systemPrompt);
    const limit = CONTEXT_LIMITS[currentProvider] || 128000;
    const pct = contextPercent(used, currentProvider);
    return { used, limit, pct };
  }, [messages, systemPrompt, currentProvider]);

  if (!messages.length) return null;

  const fillClass = pct >= 80 ? 'ctx-fill crit' : pct >= 60 ? 'ctx-fill warn' : 'ctx-fill';

  return (
    <div className="context-bar">
      <span className="ctx-label">Contexte</span>
      <div className="ctx-track">
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
      <span className="ctx-pct">
        ~{fmtTokens(used)} / {fmtTokens(limit)} ({pct}%)
      </span>
      {pct >= 60 && (
        <button className="ctx-action" onClick={onSummarize} title="Résumer l'historique pour libérer le contexte">
          Résumer
        </button>
      )}
    </div>
  );
}
