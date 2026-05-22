import { useForm, useFieldArray } from 'react-hook-form'
import { format } from 'date-fns'
import { Plus, X, Cloud } from 'lucide-react'
import { WEATHER_OPTIONS } from '../../utils/constants'

export function ReportForm({ initialValues, onSubmit, onCancel }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const now = format(new Date(), 'HH:mm')

  const { register, handleSubmit, control, formState: { errors, isSubmitting } } = useForm({
    defaultValues: initialValues || {
      date: today,
      time: now,
      weather: '',
      attendees: [{ name: '' }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'attendees' })

  async function onFormSubmit(data) {
    const attendees = data.attendees.map((a) => a.name).filter(Boolean)
    await onSubmit({ ...data, attendees })
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Date *</label>
          <input
            type="date"
            className="input"
            {...register('date', { required: 'Date requise' })}
          />
          {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date.message}</p>}
        </div>
        <div>
          <label className="label">Heure</label>
          <input type="time" className="input" {...register('time')} />
        </div>
      </div>

      <div>
        <label className="label">
          <Cloud size={13} className="inline mr-1" />
          Météo
        </label>
        <select className="input" {...register('weather')}>
          <option value="">Sélectionner…</option>
          {WEATHER_OPTIONS.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Personnes présentes</label>
        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={field.id} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={`Participant ${idx + 1}`}
                {...register(`attendees.${idx}.name`)}
              />
              {fields.length > 1 && (
                <button type="button" onClick={() => remove(idx)} className="btn-ghost p-2 rounded-lg text-red-400">
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => append({ name: '' })}
            className="btn-ghost text-sm gap-1 -ml-1"
          >
            <Plus size={14} />
            Ajouter une personne
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Annuler
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={isSubmitting}>
          {isSubmitting
            ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : (initialValues ? 'Enregistrer' : 'Créer le rapport')}
        </button>
      </div>
    </form>
  )
}
