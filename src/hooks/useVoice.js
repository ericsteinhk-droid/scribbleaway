import { useCallback, useRef, useState } from 'react'
import { createSpeechRecognition, isWebSpeechSupported } from '../services/voice'
import { transcribeWithWhisper } from '../services/ai'

export function useVoice() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState(null)
  const recognitionRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)

  const startRecording = useCallback(async () => {
    setError(null)
    setTranscript('')

    if (isWebSpeechSupported()) {
      const recognition = createSpeechRecognition()
      recognitionRef.current = recognition
      let finalText = ''

      recognition.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]
          if (result.isFinal) finalText += result[0].transcript + ' '
          else interim += result[0].transcript
        }
        setTranscript(finalText + interim)
      }

      recognition.onerror = (e) => {
        setError(`Erreur de reconnaissance vocale: ${e.error}`)
        setIsRecording(false)
      }

      recognition.start()
      setIsRecording(true)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const recorder = new MediaRecorder(stream)
        mediaRecorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
        recorder.start()
        setIsRecording(true)
      } catch (err) {
        setError(`Impossible d'accéder au microphone: ${err.message}`)
      }
    }
  }, [])

  const stopRecording = useCallback(async () => {
    setIsRecording(false)

    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      return transcript
    }

    if (mediaRecorderRef.current) {
      return new Promise((resolve, reject) => {
        mediaRecorderRef.current.onstop = async () => {
          try {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
            streamRef.current?.getTracks().forEach((t) => t.stop())
            const text = await transcribeWithWhisper(blob)
            setTranscript(text)
            resolve(text)
          } catch (err) {
            setError(`Erreur de transcription: ${err.message}`)
            reject(err)
          }
        }
        mediaRecorderRef.current.stop()
      })
    }

    return transcript
  }, [transcript])

  return { isRecording, transcript, error, startRecording, stopRecording }
}
