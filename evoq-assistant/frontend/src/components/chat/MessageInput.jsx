import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '../../store/index.js';
import ModelSelector from './ModelSelector.jsx';

const MAX_TEXTAREA_H = 160;
const TEXT_EXT = ['txt','md','csv','json','log','xml','html','css','js','ts','py','java','c','cpp','yaml','yml','sh','rb','go','rs'];

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

export default function MessageInput({ onSend, onStop, convId, systemPrompt, onSystemPromptChange }) {
  const { streaming, currentProvider, settings, drafts, setDraft } = useStore();
  const textareaRef = useRef();
  const fileInputRef = useRef();

  const [attachments, setAttachments] = useState([]);
  const [showSysPrompt, setShowSysPrompt] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);

  // Restore draft
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.value = drafts[convId || '__new__'] || '';
      autoGrow();
    }
  }, [convId]);

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_H) + 'px';
  };

  const saveDraft = useCallback(() => {
    setDraft(convId || '__new__', textareaRef.current?.value || '');
  }, [convId, setDraft]);

  const hasImage = attachments.some(a => a.type === 'image');

  const handleSend = useCallback(async () => {
    if (streaming) return;
    const text = textareaRef.current?.value.trim() || '';
    if (!text && !attachments.length) return;

    onSend({ text, attachments });
    textareaRef.current.value = '';
    setAttachments([]);
    setDraft(convId || '__new__', '');
    autoGrow();
  }, [streaming, attachments, onSend, convId, setDraft]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // File processing
  const processFiles = useCallback(async (files) => {
    const maxBytes = (settings.maxFileSizeMb || 10) * 1024 * 1024;
    const newAttachments = [];
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (f.size > maxBytes) {
        useStore.getState().showToast(`${f.name} dépasse la limite (${settings.maxFileSizeMb} Mo)`, 'error');
        continue;
      }
      if (f.type.startsWith('image/')) {
        const data = await readAsBase64(f);
        newAttachments.push({ type: 'image', name: f.name, mimeType: f.type, data });
      } else if (f.type === 'application/pdf' || ext === 'pdf') {
        const data = await readAsBase64(f);
        newAttachments.push({ type: 'pdf', name: f.name, mimeType: 'application/pdf', data });
      } else if (TEXT_EXT.includes(ext) || f.type.startsWith('text/')) {
        const text = await readAsText(f);
        newAttachments.push({ type: 'text', name: f.name, mimeType: f.type || 'text/plain', data: btoa(encodeURIComponent(text)) });
      } else {
        useStore.getState().showToast(`${f.name} : type non pris en charge`, 'error');
      }
    }
    setAttachments(prev => [...prev, ...newAttachments]);
  }, [settings.maxFileSizeMb]);

  // Drag and drop
  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setDragging(false);
    await processFiles([...e.dataTransfer.files]);
  }, [processFiles]);

  // Clipboard paste
  const handlePaste = useCallback(async (e) => {
    const items = [...(e.clipboardData?.items || [])];
    const imageItem = items.find(i => i.type.startsWith('image/'));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) await processFiles([file]);
    }
  }, [processFiles]);

  // Voice input
  const toggleVoice = useCallback(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      useStore.getState().showToast("La reconnaissance vocale n'est pas disponible dans ce navigateur", 'error');
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.lang = 'fr-CA';
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const transcript = [...e.results].map(r => r[0].transcript).join('');
      if (textareaRef.current) {
        textareaRef.current.value += (textareaRef.current.value ? ' ' : '') + transcript;
        autoGrow();
        saveDraft();
      }
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  }, [recording, saveDraft]);

  const removeAttachment = (i) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div
      className="composer"
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{ position: 'relative' }}
    >
      {dragging && (
        <div className="drag-overlay">Déposez les fichiers ici</div>
      )}
      <div className="composer-inner">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="attach-preview">
            {attachments.map((a, i) => (
              <div key={i} className="attach-pill">
                {a.type === 'image' ? (
                  <img src={`data:${a.mimeType};base64,${a.data}`} alt={a.name} />
                ) : a.type === 'pdf' ? '📄' : '📎'}
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{a.name}</span>
                <button className="attach-pill-x" onClick={() => removeAttachment(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Model selector */}
        <ModelSelector hasImage={hasImage} />

        {/* System prompt */}
        {showSysPrompt && (
          <div className="system-prompt-row">
            <textarea
              className="system-prompt-textarea"
              placeholder="Prompt système (instructions permanentes pour cette conversation)…"
              value={systemPrompt || ''}
              onChange={e => onSystemPromptChange?.(e.target.value)}
              rows={3}
            />
          </div>
        )}

        {/* Input area */}
        <div className="input-wrap" data-provider={currentProvider}>
          <textarea
            ref={textareaRef}
            className="prompt-textarea"
            rows={1}
            placeholder="Votre message…"
            onInput={autoGrow}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onChange={saveDraft}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/webp,application/pdf,.txt,.md,.csv,.json,.log,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.yaml,.yml,.sh,.rb,.go,.rs"
            onChange={e => { processFiles([...e.target.files]); e.target.value = ''; }}
          />
          <button
            className="icon-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Joindre des fichiers"
          >📎</button>
          <button
            className={`icon-btn${recording ? ' recording' : ''}`}
            onClick={toggleVoice}
            title={recording ? 'Arrêter la dictée' : 'Dictée vocale'}
          >🎤</button>
          <button
            className={`icon-btn${showSysPrompt ? ' active' : ''}`}
            onClick={() => setShowSysPrompt(!showSysPrompt)}
            title="Prompt système"
          >⚙</button>
          {streaming ? (
            <button className="send-btn stop-btn" onClick={onStop} title="Interrompre">■</button>
          ) : (
            <button
              className="send-btn"
              data-provider={currentProvider}
              onClick={handleSend}
              disabled={streaming}
              title="Envoyer (Entrée)"
            >➤</button>
          )}
        </div>
        <div className="hint-row">Entrée pour envoyer · Maj+Entrée pour un saut de ligne · Ctrl+K nouvelle conversation</div>
      </div>
    </div>
  );
}
