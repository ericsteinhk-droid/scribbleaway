import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

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
let timerInterval = null
let elapsed = 0
let audioCtx = null
let analyser = null
let rafId = null

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
  playback.src = URL.createObjectURL(f)
  playback.hidden = false
  btnTranscribe.disabled = false
  timerEl.textContent = '00:00'
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
  // Limite OpenAI : 25 Mo par fichier.
  if (recordedBlob.size > 25 * 1024 * 1024) {
    setStatus('Fichier trop volumineux (max 25 Mo). Faites un enregistrement plus court.', 'error')
    return
  }

  const model = getModel()
  btnTranscribe.disabled = true
  setStatus('Transcription en cours…', 'working')

  const form = new FormData()
  const filename = `audio.${extFor(recordedMime)}`
  form.append('file', recordedBlob, filename)
  form.append('model', model)
  form.append('language', 'fr')
  form.append('response_format', 'json')
  form.append('prompt', buildPrompt())

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form
    })
    if (!resp.ok) {
      let detail = ''
      try { const j = await resp.json(); detail = j.error?.message || '' } catch (_) {}
      if (resp.status === 401) {
        setStatus('Clé API invalide ou expirée.', 'error')
      } else {
        setStatus(`Erreur ${resp.status}${detail ? ' : ' + detail : ''}`, 'error')
      }
      btnTranscribe.disabled = false
      return
    }
    const data = await resp.json()
    const text = (data.text || '').trim()
    transcriptEl.value = text
    const hadText = text.length > 0
    btnCopy.disabled = !hadText
    btnSave.disabled = !hadText
    setStatus(hadText ? 'Transcription terminée.' : 'Aucune parole détectée.', hadText ? 'ok' : 'error')
  } catch (err) {
    const detail = (err && err.message) ? err.message : 'erreur inconnue'
    setStatus('Échec de la requête : ' + detail, 'error')
  } finally {
    btnTranscribe.disabled = false
  }
}

btnTranscribe.addEventListener('click', transcribe)

// Réactiver les boutons quand l'utilisateur écrit/corrige manuellement.
transcriptEl.addEventListener('input', () => {
  const has = transcriptEl.value.trim().length > 0
  btnCopy.disabled = !has
  btnSave.disabled = !has
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

async function saveTxt () {
  const text = transcriptEl.value
  if (!text.trim()) return
  const filename = `transcription_${stamp()}.txt`

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
      setStatus(`Enregistré : Documents/${filename}`, 'ok')
      try {
        await Share.share({
          title: 'Transcription',
          text: 'Transcription vocale',
          url: uri,
          dialogTitle: 'Partager la transcription'
        })
      } catch (_) { /* partage annulé — le fichier est déjà sauvegardé */ }
    } catch (err) {
      setStatus('Impossible d’enregistrer le fichier.', 'error')
    }
  } else {
    // Repli navigateur : téléchargement.
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setStatus(`Téléchargé : ${filename}`, 'ok')
  }
}

btnSave.addEventListener('click', saveTxt)

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

// ── Démarrage ─────────────────────────────────────────────────────────────
loadSettings()
if (!getApiKey()) {
  setStatus('Configurez votre clé API OpenAI dans les réglages ⚙️ pour commencer.')
} else {
  setStatus('Prêt. Appuyez sur « Enregistrer ».')
}
