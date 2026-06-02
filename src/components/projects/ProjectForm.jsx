import { useForm } from 'react-hook-form'

export function ProjectForm({ initialValues, onSubmit, onCancel }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: initialValues || {},
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="label">Nom du projet *</label>
        <input
          className="input"
          placeholder="Résidence Les Érables"
          {...register('name', { required: 'Nom requis' })}
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="label">Adresse</label>
        <input
          className="input"
          placeholder="123 rue de la Paix, Montréal"
          {...register('address')}
        />
      </div>

      <div>
        <label className="label">Client</label>
        <input className="input" placeholder="Nom du client" {...register('client')} />
      </div>

      <div>
        <label className="label">Description</label>
        <textarea
          className="input resize-none"
          rows={3}
          placeholder="Description du projet…"
          {...register('description')}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          Annuler
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={isSubmitting}>
          {isSubmitting ? (
            <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            initialValues ? 'Enregistrer' : 'Créer le projet'
          )}
        </button>
      </div>
    </form>
  )
}
