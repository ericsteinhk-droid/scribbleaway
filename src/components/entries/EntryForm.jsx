import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { Mic, MicOff, Wand2, Check, X } from 'lucide-react'
import { useVoice } from '../../hooks/useVoice'
import { reformatWithClaude } from '../../services/ai'
import { useToast } from '../ui/Toast'
import { ENTRY_TYPES } from '../../utils/constants'
import { cn } from '../../utils/cn'

const TYPES = Object.entries(ENTRY_TYPES)

export function EntryForm({ initialValues, onSubmit, onCancel }) {
  const toast = useToast()
  const { isRecording, transcript, error: voiceError, startRecording, stopRecording } = useVoice()
  const [reformatted, setReformatted] = useState(null)
  const [reformatting, setReformatting] = useState(false)
  const [selectedType, setSelectedType] = useState(initialValues?.type || 'observation')

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm({
    defaultValues: initialValues || { type: 'observation', text: '' },
  })

  useEffect(() => {
    if (initialValues) {
      reset({ type: initialValues.type, text: initialValues.text })
      setSelectedType(initialValues.type || 'observation')
    }
  }, [initialValues, reset])

  const currentText = watch('text')

  async function handleToggleRecording() {
    if (isRecording) {
      const text = await stopRecording()
      if (text) {
        const existing = watch('text')
        setValue('text', existing ? `${existing} ${text}` : text)
      }
    } else {
      await startRecording()
    }
  }

  async function handleReformat() {
    const text = watch('text')
    if (!text?.trim()) return
    setReformatting(true)
    try {
      const result = await reformatWithClaude(text, selectedType)
      setReformatted(result)
    } catch (err) {
      toast(`Erreur IA: ${err.message}`, 'error')
    } finally {
      setReformatting(false)
    }
  }

  function applyReformat() {
    setValue('text', reformatted)
    setReformatted(null)
  }

  function dismissReformat() {
    setReformatted(null)
  }

  async function onFormSubmit(data) {
    await onSubmit({ ...data, type: selectedType })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      {/* Type selector */}
      <div>
        <label className="label">Type d'entrée *</label>
        <div className="grid grid-cols-2 gap-2">
          {TYPES.map(([type, config]) => (
            <button
              key={type}
              type="button"
              onClick={() => { setSelectedType(type); setValue('type', type) }}
              className={cn(
                'p-3 rounded-xl border-2 text-left transition-all',
                selectedType === type
                  ? `${config.border} ${config.color}`
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400',
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', config.dot)} />
                <span className="text-xs font-medium leading-tight">{config.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Text area */}
      <div>
        <label className="label">Contenu *</label>

        {/* Reformatted preview */}
        {reformatted && (
          <div className="mb-2 p-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl">
            <p className="text-xs font-medium text-primary-700 dark:text-primary-300 mb-1.5 flex items-center gap-1">
              <Wand2 size={12} />
              Texte reformaté par l'IA
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{reformatted}</p>
            <div className="flex gap-2">
              <button type="button" onClick={applyReformat} className="btn-primary py-1.5 text-xs gap-1">
                <Check size={13} />
                Utiliser ce texte
              </button>
              <button type="button" onClick={dismissReformat} className="btn-secondary py-1.5 text-xs gap-1">
                <X size={13} />
                Ignorer
              </button>
            </div>
          </div>
        )}

        <div className="relative">
          <textarea
            className="input resize-none pr-4"
            rows={5}
            placeholder="Décrivez votre observation, avancement, discussion ou directive…"
            {...register('text', { required: 'Contenu requis' })}
          />
          {errors.text && <p className="text-red-500 text-xs mt-1">{errors.text.message}</p>}
        </div>

        {/* Voice and AI buttons */}
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={handleToggleRecording}
            className={cn(
              'inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all min-h-[40px]',
              isRecording
                ? 'bg-red-500 text-white recording-pulse'
                : 'btn-secondary',
            )}
          >
            {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
            {isRecording ? 'Arrêter' : 'Dicter'}
          </button>

          {currentText?.trim() && (
            <button
              type="button"
              onClick={handleReformat}
              disabled={reformatting}
              className="btn-secondary inline-flex items-center gap-2 px-3 py-2 text-sm min-h-[40px]"
            >
              {reformatting
                ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <Wand2 size={15} />}
              Reformater IA
            </button>
          )}
        </div>

        {voiceError && (
          <p className="text-red-500 text-xs mt-1">{voiceError}</p>
        )}

        {isRecording && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400">
              Enregistrement en cours… {transcript && <span className="italic">{transcript}</span>}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Annuler
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={isSubmitting || isRecording}>
          {isSubmitting
            ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : (initialValues ? 'Enregistrer' : 'Ajouter l\'entrée')}
        </button>
      </div>
    </form>
  )
}
