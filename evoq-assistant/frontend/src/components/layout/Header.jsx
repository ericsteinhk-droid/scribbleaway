import React from 'react';
import { useStore } from '../../store/index.js';

export default function Header() {
  const { toggleSidebar, darkMode, setDarkMode, ephemeralMode, openModal, readingMode, setReadingMode } = useStore();

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="menu-btn topbar-icon-btn" onClick={toggleSidebar} title="Menu">☰</button>
        <span className="eyebrow" style={{ color: 'var(--claude)' }}>Assistant&nbsp;IA</span>
        {ephemeralMode && (
          <span className="ephemeral-badge">⚡ Éphémère</span>
        )}
      </div>
      <div className="topbar-right">
        <span className="topbar-label" style={{ display: 'none' }}>Intranet · EVOQ Architecture</span>
        <button
          className="topbar-icon-btn"
          onClick={() => setReadingMode(!readingMode)}
          title={readingMode ? 'Quitter le mode lecture' : 'Mode lecture'}
          style={readingMode ? { color: 'var(--claude)', borderColor: 'var(--claude)' } : undefined}
        >
          📖
        </button>
        <button
          className="topbar-icon-btn"
          onClick={() => setDarkMode(!darkMode)}
          title={darkMode ? 'Thème clair' : 'Thème sombre'}
        >
          {darkMode ? '☀' : '🌙'}
        </button>
        <button className="topbar-btn" onClick={() => openModal('settings')}>
          Paramètres
        </button>
        <button className="topbar-btn" onClick={() => openModal('admin')}>
          Admin
        </button>
        <span className="topbar-label" style={{ fontSize: 11 }}>Intranet · EVOQ Architecture</span>
      </div>
    </div>
  );
}
