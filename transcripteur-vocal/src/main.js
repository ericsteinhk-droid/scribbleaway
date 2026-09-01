import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { App } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import brandSplashUrl from './brand-splash.webp'

// ── Références DOM ────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id)
const btnRecord = el('btn-record')
const recordLabel = el('record-label')
const timerEl = el('timer')
const levelBar = el('level-bar')
const playback = el('playback')
const fileInput = el('file-input')
const btnTranscribe = el('btn-transcribe')
const transcriptEl = el('transcript')
const statusEl = el('status')
const btnCopy = el('btn-copy')
const btnSave = el('btn-save')
const btnShare = el('btn-share')
const btnExit = el('btn-exit')

const settingsOverlay = el('settings-overlay')
const btnSettings = el('btn-settings')
const btnCloseSettings = el('btn-close-settings')
const btnSaveSettings = el('btn-save-settings')
const apiKeyInput = el('api-key')
const modelSelect = el('model')
const promptHintInput = el('prompt-hint')

// ── État ──────────────────────────────────────────────────────────────────
let mediaRecorder = null
let mediaStream = null
let chunks = []
let recordedBlob = null
let recordedMime = 'audio/webm'
let audioDuration = 0 // secondes, sert à décider du découpage
let timerInterval = null
let elapsed = 0
let audioCtx = null
let analyser = null
let rafId = null
let wakeLock = null   // empêche la mise en veille pendant l'enregistrement/la transcription
let busy = false      // vrai tant qu'un enregistrement ou une transcription est en cours

// ── Réglages (localStorage + repli sur clé injectée au build) ──────────────
const LS = {
  key: 'tv_api_key',
  model: 'tv_model',
  hint: 'tv_prompt_hint'
}
const BUILD_KEY = import.meta.env.VITE_OPENAI_API_KEY || ''

function loadSettings () {
  apiKeyInput.value = localStorage.getItem(LS.key) || ''
  modelSelect.value = localStorage.getItem(LS.model) || 'gpt-4o-transcribe'
  promptHintInput.value = localStorage.getItem(LS.hint) || ''
}
function getApiKey () {
  return (localStorage.getItem(LS.key) || BUILD_KEY || '').trim()
}
function getModel () {
  return localStorage.getItem(LS.model) || 'gpt-4o-transcribe'
}
function getPromptHint () {
  return localStorage.getItem(LS.hint) || ''
}

// ── Statut ──────────────────────────────────────────────────────────────
function setStatus (msg, kind = '') {
  statusEl.textContent = msg
  statusEl.className = 'status' + (kind ? ' ' + kind : '')
}

// ── Verrou de réveil ────────────────────────────────────────────────────────
// Empêche l'écran de s'éteindre pendant un enregistrement ou une transcription :
// écran éteint = JavaScript et réseau suspendus par Android, donc la tâche
// s'arrête. Le verrou est relâché automatiquement quand la page passe en
// arrière-plan ; on le reprend au retour tant que la tâche n'est pas finie.
async function acquireWake () {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen')
  } catch (_) { /* non supporté : on continue sans */ }
}
async function releaseWake () {
  try { if (wakeLock) { await wakeLock.release() } } catch (_) {}
  wakeLock = null
}
function setBusy (on) {
  busy = on
  if (on) acquireWake(); else releaseWake()
}
document.addEventListener('visibilitychange', () => {
  if (busy && document.visibilityState === 'visible' && !wakeLock) acquireWake()
})

// ── Minuterie ─────────────────────────────────────────────────────────────
function fmt (sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}
function startTimer () {
  elapsed = 0
  timerEl.textContent = '00:00'
  timerInterval = setInterval(() => {
    elapsed++
    timerEl.textContent = fmt(elapsed)
  }, 1000)
}
function stopTimer () {
  clearInterval(timerInterval)
  timerInterval = null
}

// ── Vumètre ────────────────────────────────────────────────────────────────
function startMeter (stream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const src = audioCtx.createMediaStreamSource(stream)
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    src.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i]
      const avg = sum / data.length
      levelBar.style.width = Math.min(100, (avg / 140) * 100) + '%'
      rafId = requestAnimationFrame(tick)
    }
    tick()
  } catch (_) { /* vumètre optionnel */ }
}
function stopMeter () {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
  levelBar.style.width = '0%'
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null }
  analyser = null
}

// ── Choix du format d'enregistrement supporté ─────────────────────────────
function pickMime () {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus'
  ]
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

// ── Enregistrement ──────────────────────────────────────────────────────────
async function startRecording () {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
  } catch (err) {
    setStatus("Accès au micro refusé. Autorisez le microphone dans les réglages de l'appareil.", 'error')
    return
  }

  const mime = pickMime()
  try {
    mediaRecorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime })
      : new MediaRecorder(mediaStream)
  } catch (_) {
    mediaRecorder = new MediaRecorder(mediaStream)
  }
  recordedMime = mediaRecorder.mimeType || mime || 'audio/webm'
  chunks = []

  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
  mediaRecorder.onstop = () => {
    recordedBlob = new Blob(chunks, { type: recordedMime })
    audioDuration = elapsed // la minuterie donne une durée fiable pour un enregistrement
    const url = URL.createObjectURL(recordedBlob)
    playback.src = url
    playback.hidden = false
    btnTranscribe.disabled = false
    const kb = Math.round(recordedBlob.size / 1024)
    setStatus(`Enregistrement prêt (${kb} Ko). Appuyez sur « Transcrire ».`, 'ok')
  }

  mediaRecorder.start()
  startTimer()
  startMeter(mediaStream)
  setBusy(true) // garde l'écran allumé pendant la capture
  document.body.classList.add('recording') // pulsation de l'écran

  btnRecord.classList.add('recording')
  recordLabel.textContent = 'Arrêter'
  setStatus('Enregistrement en cours…', 'working')
  playback.hidden = true
}

function stopRecording () {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
  if (mediaStream) mediaStream.getTracks().forEach(t => t.stop())
  mediaStream = null
  stopTimer()
  stopMeter()
  setBusy(false)
  document.body.classList.remove('recording')
  btnRecord.classList.remove('recording')
  recordLabel.textContent = 'Enregistrer'
}

btnRecord.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording()
  else startRecording()
})

// ── Import d'un fichier audio existant ─────────────────────────────────────
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0]
  if (!f) return
  recordedBlob = f
  recordedMime = f.type || 'audio/mpeg'
  audioDuration = 0
  playback.src = URL.createObjectURL(f)
  playback.hidden = false
  btnTranscribe.disabled = false
  timerEl.textContent = '00:00'
  // Récupère la durée depuis les métadonnées (sert au choix du découpage).
  playback.addEventListener('loadedmetadata', () => {
    const d = playback.duration
    if (isFinite(d) && d > 0) {
      audioDuration = d
      timerEl.textContent = fmt(Math.round(d))
    }
  }, { once: true })
  const kb = Math.round(f.size / 1024)
  setStatus(`Fichier importé : ${f.name} (${kb} Ko).`, 'ok')
})

// ── Transcription via l'API OpenAI ─────────────────────────────────────────
function extFor (mime) {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'mp4'
  if (mime.includes('aac')) return 'aac'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  return 'webm'
}

function buildPrompt () {
  // Amorce pour orienter le modèle vers un français québécois soigné.
  const base = "Transcription en français canadien (Québec), avec une orthographe et une ponctuation soignées."
  const hint = getPromptHint().trim()
  return hint ? `${base} ${hint}` : base
}

// ── Découpage des longs enregistrements ────────────────────────────────────
// OpenAI impose deux limites par requête : 25 Mo de taille ET, pour les modèles
// gpt-4o-transcribe, 1400 s (~23 min) de durée. On garde une marge (24 Mo,
// 1380 s). Les fichiers qui dépassent l'une ou l'autre sont décodés, ramenés en
// mono 16 kHz (ce que le modèle utilise de toute façon) puis découpés en
// segments WAV envoyés l'un après l'autre.
const SIZE_LIMIT = 24 * 1024 * 1024
const MAX_DIRECT_SECONDS = 1380 // sous la limite de 1400 s de gpt-4o-transcribe
const TARGET_RATE = 16000
const CHUNK_SECONDS = 600 // 10 min → WAV mono 16 kHz ≈ 19 Mo par segment

// Envoie un blob audio à l'API et renvoie { ok, status, detail, text }.
async function requestTranscription (key, model, blob, filename, extraPrompt) {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('model', model)
  form.append('language', 'fr')
  form.append('response_format', 'json')
  form.append('prompt', extraPrompt ? `${buildPrompt()} ${extraPrompt}` : buildPrompt())

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  })
  if (!resp.ok) {
    let detail = ''
    try { const j = await resp.json(); detail = j.error?.message || '' } catch (_) {}
    return { ok: false, status: resp.status, detail }
  }
  const data = await resp.json()
  return { ok: true, text: (data.text || '').trim() }
}

// Décode n'importe quel format supporté puis rééchantillonne en mono 16 kHz.
async function decodeToMono16k (blob) {
  const arrayBuf = await blob.arrayBuffer()
  const AC = window.AudioContext || window.webkitAudioContext
  const tmpCtx = new AC()
  let decoded
  try {
    decoded = await tmpCtx.decodeAudioData(arrayBuf)
  } finally {
    tmpCtx.close()
  }
  const frames = Math.ceil(decoded.duration * TARGET_RATE)
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  return offline.startRendering() // AudioBuffer mono 16 kHz
}

function writeWavString (view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

// Encode l'intervalle [startSample, endSample[ d'un AudioBuffer mono en WAV 16 bits.
function encodeWavRange (buffer, startSample, endSample) {
  const channel = buffer.getChannelData(0)
  const numSamples = endSample - startSample
  const dataSize = numSamples * 2
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)
  writeWavString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeWavString(view, 8, 'WAVE')
  writeWavString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)          // PCM
  view.setUint16(22, 1, true)          // mono
  view.setUint32(24, TARGET_RATE, true)
  view.setUint32(28, TARGET_RATE * 2, true) // byte rate
  view.setUint16(32, 2, true)          // block align
  view.setUint16(34, 16, true)         // bits per sample
  writeWavString(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = startSample; i < endSample; i++) {
    let s = Math.max(-1, Math.min(1, channel[i]))
    s = s < 0 ? s * 0x8000 : s * 0x7fff
    view.setInt16(offset, s, true)
    offset += 2
  }
  return new Blob([ab], { type: 'audio/wav' })
}

// L'erreur 400 de dépassement de durée (variable selon le modèle).
function isDurationError (detail) {
  return /longer than|duration|too long|maximum/i.test(detail || '')
}

// Décode, découpe en segments et transcrit chacun. Renvoie true si terminé.
async function transcribeByChunks (key, model) {
  setStatus('Préparation du découpage (décodage audio)…', 'working')
  let rendered
  try {
    rendered = await decodeToMono16k(recordedBlob)
  } catch (_) {
    setStatus('Impossible de décoder cet audio pour le découper. Essayez un autre format.', 'error')
    return false
  }

  const total = rendered.length
  const chunkLen = CHUNK_SECONDS * TARGET_RATE
  const numChunks = Math.ceil(total / chunkLen)
  const parts = []

  for (let c = 0; c < numChunks; c++) {
    const start = c * chunkLen
    const end = Math.min(total, start + chunkLen)
    const wav = encodeWavRange(rendered, start, end)
    setStatus(`Transcription du segment ${c + 1}/${numChunks}…`, 'working')
    // On passe la fin du segment précédent comme contexte pour la continuité.
    const tail = parts.length ? parts[parts.length - 1].slice(-200) : ''
    const r = await requestTranscription(key, model, wav, `segment_${c + 1}.wav`, tail)
    if (!r.ok) {
      setStatus(`Erreur au segment ${c + 1}/${numChunks} (${r.status})${r.detail ? ' : ' + r.detail : ''}`, 'error')
      if (parts.length) { transcriptEl.value = parts.join(' '); finishTranscript(transcriptEl.value) }
      return false
    }
    if (r.text) parts.push(r.text)
    transcriptEl.value = parts.join(' ')
  }

  const full = parts.join(' ')
  transcriptEl.value = full
  finishTranscript(full, numChunks)
  return true
}

async function transcribe () {
  const key = getApiKey()
  if (!key) {
    setStatus('Ajoutez votre clé API OpenAI dans les réglages ⚙️.', 'error')
    settingsOverlay.hidden = false
    return
  }
  if (!recordedBlob) {
    setStatus('Aucun audio à transcrire.', 'error')
    return
  }

  const model = getModel()
  btnTranscribe.disabled = true
  setBusy(true) // garde l'écran allumé pendant toute la transcription

  try {
    // Découpage nécessaire si le fichier dépasse la taille OU la durée maximale.
    const tooBig = recordedBlob.size > SIZE_LIMIT
    const tooLong = audioDuration > MAX_DIRECT_SECONDS
    if (tooBig || tooLong) {
      await transcribeByChunks(key, model)
      return
    }

    // Sinon : envoi direct (rapide, format d'origine conservé).
    setStatus('Transcription en cours…', 'working')
    const r = await requestTranscription(key, model, recordedBlob, `audio.${extFor(recordedMime)}`)
    if (r.ok) {
      transcriptEl.value = r.text
      finishTranscript(r.text)
      return
    }
    // Filet de sécurité : durée inconnue à l'avance mais rejetée par l'API →
    // on bascule automatiquement en découpage.
    if (r.status === 400 && isDurationError(r.detail)) {
      await transcribeByChunks(key, model)
      return
    }
    setStatus(r.status === 401 ? 'Clé API invalide ou expirée.'
      : `Erreur ${r.status}${r.detail ? ' : ' + r.detail : ''}`, 'error')
  } catch (err) {
    const detail = (err && err.message) ? err.message : 'erreur inconnue'
    setStatus('Échec de la requête : ' + detail, 'error')
  } finally {
    btnTranscribe.disabled = false
    setBusy(false)
  }
}

function finishTranscript (text, segments) {
  const hadText = text.trim().length > 0
  btnCopy.disabled = !hadText
  btnSave.disabled = !hadText
  btnShare.disabled = !hadText
  if (!hadText) { setStatus('Aucune parole détectée.', 'error'); return }
  setStatus(segments && segments > 1
    ? `Transcription terminée (${segments} segments recollés).`
    : 'Transcription terminée.', 'ok')
}

btnTranscribe.addEventListener('click', transcribe)

// Réactiver les boutons quand l'utilisateur écrit/corrige manuellement.
transcriptEl.addEventListener('input', () => {
  const has = transcriptEl.value.trim().length > 0
  btnCopy.disabled = !has
  btnSave.disabled = !has
  btnShare.disabled = !has
})

// ── Exporter la transcription vers une autre appli (Copilot, Claude…) ───────
btnShare.addEventListener('click', async () => {
  const text = transcriptEl.value.trim()
  if (!text) return
  if (Capacitor.isNativePlatform()) {
    try {
      await Share.share({ title: 'Transcription', text, dialogTitle: 'Exporter la transcription vers…' })
    } catch (_) { /* partage annulé */ }
  } else if (navigator.share) {
    try { await navigator.share({ text }) } catch (_) {}
  } else {
    try { await navigator.clipboard.writeText(text); setStatus('Copié — collez-le dans Copilot ou Claude.', 'ok') } catch (_) {}
  }
})

// ── Copier ──────────────────────────────────────────────────────────────
btnCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(transcriptEl.value)
    setStatus('Copié dans le presse-papiers.', 'ok')
  } catch (_) {
    transcriptEl.select()
    document.execCommand('copy')
    setStatus('Copié.', 'ok')
  }
})

// ── Enregistrer en .txt ────────────────────────────────────────────────────
function stamp () {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

async function saveTextFile (text, baseName, status) {
  if (!text.trim()) return
  const filename = `${baseName}_${stamp()}.txt`

  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true
      })
      const { uri } = await Filesystem.getUri({ directory: Directory.Documents, path: filename })
      status(`Enregistré : Documents/${filename}`, 'ok')
      try {
        await Share.share({ url: uri, dialogTitle: 'Partager le fichier' })
      } catch (_) { /* partage annulé — le fichier est déjà sauvegardé */ }
    } catch (err) {
      status('Impossible d’enregistrer le fichier.', 'error')
    }
  } else {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    status(`Téléchargé : ${filename}`, 'ok')
  }
}

btnSave.addEventListener('click', () => saveTextFile(transcriptEl.value, 'transcription', setStatus))

// ── Réglages ────────────────────────────────────────────────────────────
btnSettings.addEventListener('click', () => { loadSettings(); settingsOverlay.hidden = false })
btnCloseSettings.addEventListener('click', () => { settingsOverlay.hidden = true })
settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.hidden = true })
btnSaveSettings.addEventListener('click', () => {
  localStorage.setItem(LS.key, apiKeyInput.value.trim())
  localStorage.setItem(LS.model, modelSelect.value)
  localStorage.setItem(LS.hint, promptHintInput.value.trim())
  settingsOverlay.hidden = true
  setStatus('Réglages enregistrés.', 'ok')
})

// ── Bouton de sortie ────────────────────────────────────────────────────────
btnExit.addEventListener('click', async () => {
  if (busy) {
    const ok = confirm('Un enregistrement ou une transcription est en cours. Quitter quand même ?')
    if (!ok) return
  }
  if (Capacitor.isNativePlatform()) {
    try { await App.exitApp(); return } catch (_) {}
  }
  // Repli navigateur.
  try { window.close() } catch (_) {}
  setStatus('Vous pouvez fermer l’application.', '')
})

// ── Écran de démarrage intégré (logo EVOQ garanti) ─────────────────────────
;(function initBrandSplash () {
  const splash = document.getElementById('brand-splash')
  const imgEl = document.getElementById('brand-splash-img')
  if (imgEl) imgEl.src = brandSplashUrl
  // Masque le splash natif dès que le WebView est prêt (notre splash prend le relais).
  try { const p = SplashScreen.hide(); if (p && p.catch) p.catch(() => {}) } catch (_) {}
  // Affiche notre splash de marque ~1,6 s, puis fondu.
  setTimeout(() => {
    if (!splash) return
    splash.classList.add('hide')
    setTimeout(() => splash.remove(), 600)
  }, 1600)
})()

// ── Démarrage ─────────────────────────────────────────────────────────────
loadSettings()
if (!getApiKey()) {
  setStatus('Configurez votre clé API OpenAI dans les réglages ⚙️ pour commencer.')
} else {
  setStatus('Prêt. Appuyez sur « Enregistrer ».')
}
