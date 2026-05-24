export function isWebSpeechSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
}

export function createSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) return null

  const recognition = new SpeechRecognition()
  recognition.lang = 'fr-FR'
  recognition.continuous = true
  recognition.interimResults = true
  return recognition
}

export async function recordAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks = []

  recorder.ondataavailable = (e) => chunks.push(e.data)

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'audio/webm' })
      stream.getTracks().forEach((t) => t.stop())
      resolve(blob)
    }

    recorder.start()

    return {
      stop: () => recorder.stop(),
      recorder,
    }
  })
}

export function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression échouée'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Impossible de charger l\'image'))
    }
    img.src = url
  })
}
