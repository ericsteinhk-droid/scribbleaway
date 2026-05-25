import JSZip from 'jszip'
import { ref, getBlob } from 'firebase/storage'
import { storage } from './firebase'
import { ENTRY_TYPES, ENTRY_TYPE_ORDER } from '../utils/constants'
import { formatReportNumber } from '../utils/format'

const FETCH_TIMEOUT_MS = 10000

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS)),
  ])
}

async function fetchPhotoBlob(url, storagePath) {
  if (storagePath) {
    try {
      return await withTimeout(getBlob(ref(storage, storagePath)))
    } catch { /* fall through */ }
  }
  try {
    const res = await withTimeout(fetch(url))
    if (res.ok) return res.blob()
  } catch { /* ignore */ }
  return null
}

export async function buildPhotosZip(report, project) {
  const zip = new JSZip()
  const reportFolder = zip.folder(`rapport-${formatReportNumber(report.number)}`)
  let total = 0

  for (const type of ENTRY_TYPE_ORDER) {
    const entries = (report.entries || []).filter((e) => e.type === type)
    const photosInType = entries.flatMap((e) => e.photos || [])
    if (!photosInType.length) continue

    const typeLabel = (ENTRY_TYPES[type]?.label || type)
      .toLowerCase()
      .replace(/\s+/g, '_')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

    const folder = reportFolder.folder(typeLabel)

    for (let ei = 0; ei < entries.length; ei++) {
      const photos = entries[ei].photos || []
      for (let pi = 0; pi < photos.length; pi++) {
        const photo = photos[pi]
        const blob = await fetchPhotoBlob(photo.url, photo.storagePath)
        if (!blob) continue
        const name = `${String(ei + 1).padStart(2, '0')}_${String(pi + 1).padStart(2, '0')}.jpg`
        folder.file(name, blob)
        total++
      }
    }
  }

  if (total === 0) throw new Error('Aucune photo disponible à télécharger')

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}
