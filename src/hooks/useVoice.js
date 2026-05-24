import { useCallback, useRef, useState } from 'react'
import { transcribeWithWhisper } from '../services/ai'

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const startRecording = useCallback(async () => {
    setError(null)
    setTranscript('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start(500)
      setIsRecording(true)
    } catch (err) {
      setError(`Impossible d'accéder au microphone: ${err.message}`)
    }
  }, [])

  const stopRecording = useCallback(async () => {
    setIsRecording(false)
    if (!mediaRecorderRef.current) return ''
    return new Promise((resolve) => {
      mediaRecorderRef.current.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
          streamRef.current?.getTracks().forEach((t) => t.stop())
          const text = await transcribeWithWhisper(blob)
          setTranscript(text)
          resolve(text)
        } catch (err) {
          setError(`Erreur de transcription: ${err.message}`)
          resolve('')
        } finally {
          mediaRecorderRef.current = null
          streamRef.current = null
          chunksRef.current = []
        }
      }
      mediaRecorderRef.current.stop()
    })
  }, [])

  return { isRecording, transcript, error, startRecording, stopRecording }
}
