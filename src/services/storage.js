import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'
import { compressImage } from './voice'

const UPLOAD_QUEUE_KEY = 'photo_upload_queue'

export async function uploadPhoto(file, path) {
  const compressed = await compressImage(file)
  const storageRef = ref(storage, path)
  const snapshot = await uploadBytes(storageRef, compressed)
  return getDownloadURL(snapshot.ref)
}

export function queuePhotoUpload(localId, file, path) {
  const queue = getUploadQueue()
  queue.push({ localId, path, timestamp: Date.now() })
  localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue))
}

export function getUploadQueue() {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function removeFromQueue(localId) {
  const queue = getUploadQueue().filter((item) => item.localId !== localId)
  localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(queue))
}
