import { useState, useRef } from 'react'
import { Pencil, Trash2, Camera, X, Plus } from 'lucide-react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../services/firebase'
import { compressImage } from '../../services/voice'
import { useToast } from '../ui/Toast'
import { useAuth } from '../../context/AuthContext'
import { ENTRY_TYPES } from '../../utils/constants'
import { cn } from '../../utils/cn'
import { v4 as uuidv4 } from 'uuid'

export function EntryCard({ entry, projectId, reportId, onEdit, onDelete, onUpdatePhotos }) {
  const toast = useToast()
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [captionEdit, setCaptionEdit] = useState(null)
  const [captionValue, setCaptionValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeletePhoto, setConfirmDeletePhoto] = useState(null)

  const typeConfig = ENTRY_TYPES[entry.type] || ENTRY_TYPES.observation

  async function handlePhotoAdd(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const newPhotos = [...(entry.photos || [])]
      for (const file of files) {
        const compressed = await compressImage(file)
        const photoId = uuidv4()
        const path = `photos/${user.uid}/${projectId}/${reportId}/${photoId}.jpg`
        const storageRef = ref(storage, path)
        const snap = await uploadBytes(storageRef, compressed)
        const url = await getDownloadURL(snap.ref)
        newPhotos.push({ id: photoId, url, storagePath: path, caption: '' })
      }
      await onUpdatePhotos(newPhotos)
      toast('Photo(s) ajoutée(s).', 'success')
    } catch (err) {
      toast(`Erreur lors de l'upload: ${err.message}`, 'error')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemovePhoto(photoId) {
    const photos = (entry.photos || []).filter((p) => p.id !== photoId)
    await onUpdatePhotos(photos)
    setConfirmDeletePhoto(null)
  }

  async function handleSaveCaption(photoId) {
    const photos = (entry.photos || []).map((p) =>
      p.id === photoId ? { ...p, caption: captionValue } : p
    )
    await onUpdatePhotos(photos)
    setCaptionEdit(null)
  }

  return (
    <div className={cn('card overflow-hidden border-l-2', typeConfig.border)}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={cn('entry-tag', typeConfig.color)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', typeConfig.dot)} />
            {typeConfig.label}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit} className="btn-ghost p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Modifier">
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-ghost p-2.5 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 hover:text-red-500"
              aria-label="Supprimer"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
          {entry.text}
        </p>

        {/* Photos */}
        {entry.photos?.length > 0 && (
          <div className="mt-4 photo-grid">
            {entry.photos.map((photo) => (
              <div key={photo.id} className="relative group rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Photo de chantier'}
                  className="w-full h-32 object-cover"
                />
                <div className="absolute top-1.5 right-1.5">
                  <button
                    onClick={() => setConfirmDeletePhoto(photo.id)}
                    className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white shadow"
                    aria-label="Supprimer la photo"
                  >
                    <X size={14} />
                  </button>
                </div>
                {captionEdit === photo.id ? (
                  <div className="p-1.5 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                    <input
                      autoFocus
                      className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-transparent focus:outline-none"
                      value={captionValue}
                      onChange={(e) => setCaptionValue(e.target.value)}
                      onBlur={() => handleSaveCaption(photo.id)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveCaption(photo.id)}
                      placeholder="Légende…"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setCaptionEdit(photo.id); setCaptionValue(photo.caption || '') }}
                    className="block w-full text-left text-xs text-gray-500 dark:text-gray-400 px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800 truncate italic"
                  >
                    {photo.caption || '+ légende'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add photo */}
        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoAdd}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn-ghost text-xs gap-1.5 -ml-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            {uploading
              ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Camera size={14} />}
            {uploading ? 'Envoi…' : 'Ajouter des photos'}
          </button>
        </div>
      </div>

      {/* Confirm delete entry */}
      {confirmDelete && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-950/30 p-3">
          <p className="text-xs text-red-700 dark:text-red-300 mb-2 font-medium">Supprimer cette entrée ? Action irréversible.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary py-1.5 text-xs flex-1">Annuler</button>
            <button onClick={onDelete} className="btn-danger py-1.5 text-xs flex-1">Supprimer</button>
          </div>
        </div>
      )}

      {/* Confirm delete photo */}
      {confirmDeletePhoto && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-950/30 p-3">
          <p className="text-xs text-red-700 dark:text-red-300 mb-2 font-medium">Supprimer cette photo ? Action irréversible.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDeletePhoto(null)} className="btn-secondary py-1.5 text-xs flex-1">Annuler</button>
            <button onClick={() => handleRemovePhoto(confirmDeletePhoto)} className="btn-danger py-1.5 text-xs flex-1">Supprimer</button>
          </div>
        </div>
      )}
    </div>
  )
}
