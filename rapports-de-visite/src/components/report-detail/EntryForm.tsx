import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Entry, EntryType, Photo } from '../../types';
import { ENTRY_TYPE_LABELS, ENTRY_TYPE_COLORS } from '../../types';
import PhotoGrid from './PhotoGrid';

const DRAFT_KEY = 'rdv-entry-draft';

interface DraftData {
  type: EntryType;
  content: string;
}

function getAnthropicKey(): string {
  return (localStorage.getItem('rdv-anthropic-key') || '').trim();
}

function getOpenAIKey(): string {
  return (localStorage.getItem('rdv-openai-key') || '').trim();
}

// --- Garde-fou contre les hallucinations du correcteur IA -------------------
// Le correcteur ne doit que corriger la langue, jamais ajouter de contenu. On
// compare localement (sans appel IA) le texte corrigé au texte d'origine et on
// signale toute divergence importante : chiffres inventés (le plus dangereux
// sur un chantier), mots de contenu ajoutés, ou rallongement anormal. Une
// divergence vient le plus souvent d'une dictée peu claire que le modèle a
// « complétée » au lieu de simplement corriger. C'est une heuristique, pas une
// garantie : elle sert à alerter l'usager, qui garde le dernier mot.

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeWords(s: string): string[] {
  return stripDiacritics(s.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Chiffres sous forme canonique (séparateurs retirés) : "3,50" et "3.50" → "350".
function extractNumbers(s: string): string[] {
  const matches = stripDiacritics(s.toLowerCase()).match(/\d+(?:[.,]\d+)*/g) || [];
  return matches.map((n) => n.replace(/[.,]/g, ''));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

// Un mot corrigé « correspond » à l'original si une correction d'orthographe
// plausible (petite distance d'édition) le relie à un mot d'origine.
function hasFuzzyMatch(word: string, pool: string[]): boolean {
  const tol = word.length <= 6 ? 1 : 2;
  return pool.some((w) => {
    if (Math.abs(w.length - word.length) > tol) return false;
    return levenshtein(word, w) <= tol;
  });
}

interface FidelityResult {
  ok: boolean;
  novelWords: string[];
  novelNumbers: string[];
}

function checkFidelity(original: string, corrected: string): FidelityResult {
  const origWords = normalizeWords(original);
  const corrWords = normalizeWords(corrected);

  // Chiffres : doivent être préservés à l'identique. Un nombre inventé est
  // l'hallucination la plus grave dans un rapport d'inspection.
  const origNumbers = new Set(extractNumbers(original));
  const novelNumbers = [...new Set(extractNumbers(corrected))].filter((n) => !origNumbers.has(n));

  // Mots de contenu = longueur ≥ 4 (les petits mots grammaticaux — le, une,
  // aux… — peuvent légitimement être ajoutés lors d'une correction).
  const contentWords = corrWords.filter((w) => w.length >= 4 && !/^\d+$/.test(w));
  const novelWords = [...new Set(contentWords.filter((w) => !hasFuzzyMatch(w, origWords)))];

  const novelRatio = contentWords.length ? novelWords.length / contentWords.length : 0;
  const expansion = origWords.length ? corrWords.length / origWords.length : 1;

  const ok =
    novelNumbers.length === 0 &&
    !(novelRatio > 0.3 && novelWords.length >= 2) &&
    !(expansion > 1.7 && origWords.length >= 8);

  return { ok, novelWords, novelNumbers };
}

interface Props {
  initial?: Entry;
  storagePath: string;
  onSubmit: (type: EntryType, content: string, photos: Photo[]) => Promise<void>;
  onCancel: () => void;
  onNeedApiKey: (type: 'anthropic' | 'openai') => void;
}

export default function EntryForm({ initial, storagePath, onSubmit, onCancel, onNeedApiKey }: Props) {
  const [type, setType] = useState<EntryType>(initial?.type ?? 'observation');
  const [content, setContent] = useState(initial?.content ?? '');
  const [photos, setPhotos] = useState<Photo[]>(initial?.photos ?? []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Voice dictation state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>('audio/webm');

  // AI reformat state
  const [reformatting, setReformatting] = useState(false);
  const [pendingReformat, setPendingReformat] = useState<string | null>(null);
  const [reformatWarning, setReformatWarning] = useState<string | null>(null);

  // Draft auto-save (new entries only)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initial) return;
    // Restore draft on mount
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      // Draft banner shown via state
    }
  }, [initial]);

  const [hasDraft, setHasDraft] = useState(() => {
    if (initial) return false;
    return !!localStorage.getItem(DRAFT_KEY);
  });

  function restoreDraft() {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    const draft: DraftData = JSON.parse(saved);
    setType(draft.type);
    setContent(draft.content);
    setHasDraft(false);
  }

  function discardDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  }

  const saveDraft = useCallback(() => {
    if (initial) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ type, content }));
  }, [initial, type, content]);

  useEffect(() => {
    if (initial) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveDraft, 2000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [type, content, saveDraft, initial]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) { setError('Le contenu est requis.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(type, content.trim(), photos);
      if (!initial) localStorage.removeItem(DRAFT_KEY);
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Voice dictation ---
  async function startRecording() {
    const key = getOpenAIKey();
    if (!key) { onNeedApiKey('openai'); return; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      // Don't force a MIME type — let the platform pick what it supports.
      // We'll read mr.mimeType after recording to know the actual format.
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        // mr.mimeType is the format actually used (e.g. "audio/mp4" on Android)
        mimeTypeRef.current = mr.mimeType || 'audio/mp4';
        transcribeAudio(chunksRef.current, key, mimeTypeRef.current);
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      setError('Impossible d\'accéder au microphone.');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setTranscribing(true);
  }

  async function transcribeAudio(chunks: Blob[], apiKey: string, mimeType: string) {
    const ext = mimeType.includes('mp4') ? 'm4a'
              : mimeType.includes('ogg') ? 'ogg'
              : 'webm';
    const blob = new Blob(chunks, { type: mimeType });

    try {
      let text: string;

      if (Capacitor.isNativePlatform()) {
        // CapacitorHttp's formData mode requires a plain object, not a FormData instance.
        // File parts must be { name, type, data } with base64-encoded data.
        const base64Audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const { CapacitorHttp } = await import('@capacitor/core');
        // CapacitorHttp formData expects a JSArray of {type,key,value,...} entries,
        // not a plain object. 'base64File' entries also need fileName and contentType.
        const resp = await CapacitorHttp.post({
          url: 'https://api.openai.com/v1/audio/transcriptions',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'multipart/form-data' },
          data: [
            { type: 'base64File', key: 'file', value: base64Audio, fileName: `recording.${ext}`, contentType: mimeType },
            { type: 'string', key: 'model', value: 'whisper-1' },
            { type: 'string', key: 'language', value: 'fr' },
          ],
          dataType: 'formData',
          readTimeout: 30000,
        });
        if (resp.status !== 200) {
          const errBody = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
          throw new Error(`HTTP ${resp.status}: ${errBody.slice(0, 300)}`);
        }
        text = (resp.data as { text: string }).text;
      } else {
        const webForm = new FormData();
        webForm.append('file', blob, `recording.${ext}`);
        webForm.append('model', 'whisper-1');
        webForm.append('language', 'fr');
        const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: webForm,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        text = ((await resp.json()) as { text: string }).text;
      }

      setPendingTranscript(text);
    } catch (err) {
      setError(`Erreur de transcription : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTranscribing(false);
    }
  }

  function insertTranscript() {
    if (!pendingTranscript) return;
    setContent((c) => (c ? `${c} ${pendingTranscript}` : pendingTranscript));
    setPendingTranscript(null);
  }

  // --- AI reformat ---
  async function handleReformat() {
    const key = getAnthropicKey();
    if (!key) { onNeedApiKey('anthropic'); return; }
    if (!content.trim()) return;

    setReformatting(true);
    setReformatWarning(null);
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          // Correction grammaire/orthographe : tâche courte et bien définie —
          // on désactive la réflexion pour garder une réponse rapide (Sonnet 5
          // active la réflexion adaptative par défaut si le champ est omis).
          thinking: { type: 'disabled' },
          messages: [
            {
              role: 'user',
              content: `Tu es un correcteur de texte strict pour rapports de visite de chantier.\n\nTA SEULE TÂCHE : corriger la grammaire, l'orthographe et la ponctuation.\n\nRÈGLES ABSOLUES :\n- N'ajoute AUCUNE information absente du texte original\n- Ne complète pas, n'extrapole pas, n'interprète pas\n- Conserve exactement les mêmes faits, chiffres, noms et observations\n- Si une phrase est incomplète ou ambiguë, laisse-la telle quelle\n- Type d'entrée : ${ENTRY_TYPE_LABELS[type]}\n\nRéponds uniquement avec le texte corrigé, sans explication ni commentaire.\n\nTexte :\n${content}`,
            },
          ],
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json() as { content: { type: string; text: string }[] };
      const text = (data.content.find((b) => b.type === 'text')?.text ?? '').trim();
      if (!text) { setError('Le correcteur IA n\'a renvoyé aucun texte.'); return; }

      // Garde-fou : vérifier que la correction ne s'écarte pas du texte d'origine.
      const fidelity = checkFidelity(content, text);
      if (!fidelity.ok) {
        const parts: string[] = [];
        if (fidelity.novelNumbers.length > 0) {
          parts.push(`chiffres absents du texte d'origine (${fidelity.novelNumbers.join(', ')})`);
        }
        if (fidelity.novelWords.length > 0) {
          parts.push(`mots ajoutés (${fidelity.novelWords.slice(0, 6).join(', ')}${fidelity.novelWords.length > 6 ? '…' : ''})`);
        }
        setReformatWarning(
          `La correction s'écarte du texte d'origine — ${parts.join(' ; ')}. ` +
          `Le correcteur a peut-être interprété un passage peu clair. Vérifiez-la mot à mot avant de l'utiliser. ` +
          `Si ce texte provient d'une dictée vocale, réenregistrez en parlant plus lentement, plus distinctement et plus près du microphone.`
        );
      }
      setPendingReformat(text);
    } catch {
      setError('Erreur lors du reformatage IA.');
    } finally {
      setReformatting(false);
    }
  }

  const colors = ENTRY_TYPE_COLORS[type];
  const types: EntryType[] = ['observation', 'avancement', 'discussion', 'directive'];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Draft restoration banner */}
      {hasDraft && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
          <span className="flex-1 text-amber-800 dark:text-amber-200">Brouillon non sauvegardé trouvé.</span>
          <button type="button" onClick={restoreDraft} className="text-amber-700 dark:text-amber-300 font-medium hover:underline">Restaurer</button>
          <button type="button" onClick={discardDraft} className="text-amber-500 hover:underline">Ignorer</button>
        </div>
      )}

      {/* Type selector */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
          Type *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {types.map((t) => {
            const c = ENTRY_TYPE_COLORS[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-left ${
                  type === t
                    ? `${c.border} ${c.bg} ${c.text}`
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                <span className="truncate text-xs">{ENTRY_TYPE_LABELS[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Contenu *
        </label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          placeholder="Saisir l'observation, la directive ou la discussion…"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-evoq resize-none bg-white dark:bg-gray-800 ${colors.border} dark:border-opacity-50`}
        />

        {/* Voice + AI buttons */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {!recording && !transcribing && (
            <button
              type="button"
              onClick={startRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Dicter
            </button>
          )}

          {recording && (
            <button
              type="button"
              onClick={stopRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse2" />
              Enregistrement… Arrêter
            </button>
          )}

          {transcribing && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
              Transcription…
            </span>
          )}

          {content.trim() && !reformatting && (
            <button
              type="button"
              onClick={handleReformat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-evoq text-evoq text-xs hover:bg-evoq-light dark:hover:bg-evoq/10"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Reformater IA
            </button>
          )}

          {reformatting && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-3 h-3 border-2 border-evoq border-t-transparent rounded-full animate-spin" />
              Reformatage…
            </span>
          )}
        </div>

        {/* Transcript preview */}
        {pendingTranscript && (
          <div className="mt-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Transcription</p>
            <p className="text-sm text-blue-900 dark:text-blue-100 mb-2">{pendingTranscript}</p>
            <div className="flex gap-2">
              <button type="button" onClick={insertTranscript} className="text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline">Insérer</button>
              <button type="button" onClick={() => setPendingTranscript(null)} className="text-xs text-blue-500 hover:underline">Ignorer</button>
            </div>
          </div>
        )}

        {/* Reformat preview */}
        {pendingReformat && (
          <div
            className={`mt-2 rounded-lg p-3 border ${
              reformatWarning
                ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800'
                : 'bg-evoq-light dark:bg-evoq/10 border-evoq/30'
            }`}
          >
            {reformatWarning ? (
              <div className="flex items-start gap-2 mb-2">
                <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{reformatWarning}</p>
              </div>
            ) : (
              <p className="text-xs font-medium text-evoq mb-1">Suggestion IA</p>
            )}
            <p className="text-sm text-gray-800 dark:text-gray-200 mb-2 whitespace-pre-wrap">{pendingReformat}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setContent(pendingReformat); setPendingReformat(null); setReformatWarning(null); }}
                className={`text-xs font-medium hover:underline ${reformatWarning ? 'text-amber-700 dark:text-amber-300' : 'text-evoq'}`}
              >
                {reformatWarning ? 'Utiliser malgré tout' : 'Utiliser ce texte'}
              </button>
              <button type="button" onClick={() => { setPendingReformat(null); setReformatWarning(null); }} className="text-xs text-gray-400 hover:underline">Ignorer</button>
            </div>
          </div>
        )}
      </div>

      {/* Photos */}
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Photos</label>
        <PhotoGrid
          photos={photos}
          storagePath={storagePath}
          onPhotosChange={setPhotos}
          onError={(msg) => setError(msg)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-2 rounded-lg bg-evoq text-white text-sm font-medium hover:bg-evoq-dark disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {initial ? 'Mettre à jour' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
