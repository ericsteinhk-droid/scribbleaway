import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../../store/index.js';
import { useConversations } from '../../hooks/useConversations.js';
import ConfirmDialog from '../common/ConfirmDialog.jsx';

const PROVIDER_COLOR = { anthropic: 'var(--claude)', openai: 'var(--gpt)', gemini: 'var(--gemini)' };
const PROVIDER_LABEL = { anthropic: 'Claude', openai: 'GPT', gemini: 'Gemini' };

function groupConversations(convs) {
  const now = Date.now();
  const DAY = 86400000;
  const today = [], week = [], older = [];
  for (const c of convs) {
    const age = now - new Date(c.updatedAt || c.createdAt).getTime();
    if (age < DAY) today.push(c);
    else if (age < 7 * DAY) week.push(c);
    else older.push(c);
  }
  return { today, week, older };
}

function ConvItem({ conv, active, onSelect, onDelete, onRename, onPin, onFork }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const inputRef = useRef();

  useEffect(() => { setTitle(conv.title); }, [conv.title]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (title.trim() && title !== conv.title) onRename(conv.id, title.trim());
    else setTitle(conv.title);
  };

  return (
    <div className={`conv-item${active ? ' active' : ''}`} onClick={() => onSelect(conv.id)}>
      {conv.pinned && <span className="conv-pin" title="Épinglée">📌</span>}
      {editing ? (
        <input
          ref={inputRef}
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setTitle(conv.title); } }}
          onClick={e => e.stopPropagation()}
          style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 13, color: 'var(--ink)' }}
        />
      ) : (
        <span className="conv-title">{conv.title || 'Sans titre'}</span>
      )}
      <div className="conv-actions" onClick={e => e.stopPropagation()}>
        <button className="conv-action-btn" title="Renommer" onClick={() => setEditing(true)}>✏</button>
        <button className="conv-action-btn" title={conv.pinned ? 'Désépingler' : 'Épingler'} onClick={() => onPin(conv.id, !conv.pinned)}>📌</button>
        <button className="conv-action-btn" title="Dupliquer" onClick={() => onFork(conv.id)}>⎇</button>
        <button className="conv-action-btn del" title="Supprimer" onClick={() => onDelete(conv.id)}>✕</button>
      </div>
    </div>
  );
}

function ConvGroup({ label, convs, ...props }) {
  if (!convs.length) return null;
  return (
    <>
      <div className="conv-group-label">{label}</div>
      {convs.map(c => <ConvItem key={c.id} conv={c} {...props} />)}
    </>
  );
}

export default function Sidebar({ onNewConversation }) {
  const {
    sidebarOpen, conversations, activeConvId, ephemeralMode,
    setEphemeralMode, openModal,
  } = useStore();
  const { selectConversation, deleteConversation, deleteAll, renameConversation, pinConversation, forkConversation } = useConversations();

  const [search, setSearch] = useState('');
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const filtered = search.trim()
    ? conversations.filter(c => c.title?.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const pinned = filtered.filter(c => c.pinned);
  const unpinned = filtered.filter(c => !c.pinned);
  const { today, week, older } = groupConversations(unpinned);

  const handleDelete = (id) => setConfirmDel(id);
  const handleFork = (id) => {
    const lastMsg = useStore.getState().messages[id]?.slice(-1)[0];
    forkConversation(id, lastMsg?.id);
  };

  return (
    <>
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <img src="/logo.png" alt="EVOQ" />
          <div className="sub">Assistant&nbsp;IA</div>
        </div>

        {/* New conversation */}
        <button className="sidebar-new-btn" onClick={onNewConversation}>
          + Nouvelle conversation
        </button>

        {/* Controls */}
        <div className="sidebar-controls">
          <button
            className={`sidebar-toggle${ephemeralMode ? ' active' : ''}`}
            onClick={() => setEphemeralMode(!ephemeralMode)}
            title="Les conversations éphémères ne sont pas enregistrées"
          >
            {ephemeralMode ? '⚡ Éphémère' : 'Éphémère'}
          </button>
          <button className="sidebar-toggle" onClick={() => openModal('prompts')} title="Bibliothèque de prompts">
            Prompts
          </button>
          <button className="sidebar-toggle" onClick={() => openModal('compare')} title="Comparer les modèles">
            Comparer
          </button>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <span className="sidebar-search-icon">🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            type="search"
          />
        </div>

        {/* Conversation list */}
        <div className="sidebar-list">
          {pinned.length > 0 && (
            <>
              <div className="conv-group-label">Épinglées</div>
              {pinned.map(c => (
                <ConvItem
                  key={c.id}
                  conv={c}
                  active={c.id === activeConvId}
                  onSelect={selectConversation}
                  onDelete={handleDelete}
                  onRename={renameConversation}
                  onPin={pinConversation}
                  onFork={handleFork}
                />
              ))}
            </>
          )}
          <ConvGroup label="Aujourd'hui" convs={today} active={activeConvId} onSelect={selectConversation} onDelete={handleDelete} onRename={renameConversation} onPin={pinConversation} onFork={handleFork} />
          <ConvGroup label="7 derniers jours" convs={week} active={activeConvId} onSelect={selectConversation} onDelete={handleDelete} onRename={renameConversation} onPin={pinConversation} onFork={handleFork} />
          <ConvGroup label="Plus ancien" convs={older} active={activeConvId} onSelect={selectConversation} onDelete={handleDelete} onRename={renameConversation} onPin={pinConversation} onFork={handleFork} />
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', color: 'var(--faint)', fontSize: 13, textAlign: 'center' }}>
              {search ? 'Aucun résultat' : 'Aucune conversation'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="sidebar-footer-btn" onClick={() => openModal('export')}>Exporter</button>
          <button className="sidebar-footer-btn danger" onClick={() => setConfirmPurge(true)}>Purger tout</button>
        </div>
      </aside>

      <ConfirmDialog
        open={!!confirmDel}
        title="Supprimer la conversation"
        message="Cette action est irréversible."
        danger
        onConfirm={() => { deleteConversation(confirmDel); setConfirmDel(null); }}
        onCancel={() => setConfirmDel(null)}
      />
      <ConfirmDialog
        open={confirmPurge}
        title="Purger tout l'historique"
        message="Toutes les conversations seront supprimées définitivement. Cette action est irréversible."
        danger
        onConfirm={() => { deleteAll(); setConfirmPurge(false); }}
        onCancel={() => setConfirmPurge(false)}
      />
    </>
  );
}
