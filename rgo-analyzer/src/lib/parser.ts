import JSZip from 'jszip'
import type { ParsedTask } from '../types'

const TASK_REGEX =
  /(\d+)\s+([\s\S]+?)\s+(\d+(?:[,\.]\d+)?)\s*j\s*(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\s+(\d{2}-\d{2}-\d{2})\s*(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\s+(\d{2}-\d{2}-\d{2})/g

const DISCARD_NAME_RE = /^(T[1-4]|[12][0-9]{3}|Lun|Mar|Mer|Jeu|Ven|Sam|Dim)$/i

function parseDate(raw: string): Date {
  const parts = raw.split('-')
  const year = 2000 + parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const day = parseInt(parts[2], 10)
  return new Date(year, month, day)
}

function parseDuration(raw: string): number {
  return parseFloat(raw.replace(',', '.'))
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim()
}

export async function parseScheduleFile(buffer: ArrayBuffer): Promise<ParsedTask[]> {
  const zip = await JSZip.loadAsync(buffer)
  const txtFiles: string[] = []

  zip.forEach((relativePath, file) => {
    if (relativePath.endsWith('.txt') && !file.dir) {
      txtFiles.push(relativePath)
    }
  })

  const textChunks: string[] = []
  for (const filename of txtFiles.sort()) {
    const content = await zip.file(filename)!.async('string')
    textChunks.push(content)
  }

  const fullText = textChunks.join('\n')
  const seen = new Map<string, ParsedTask>()
  let match: RegExpExecArray | null

  TASK_REGEX.lastIndex = 0

  while ((match = TASK_REGEX.exec(fullText)) !== null) {
    const [, idStr, rawName, durStr, , startRaw, , endRaw] = match
    const id = parseInt(idStr, 10)
    const name = normalizeName(rawName)
    const duration = parseDuration(durStr)

    if (name.length < 4) continue
    if (/^\d+$/.test(name)) continue
    if (DISCARD_NAME_RE.test(name)) continue
    if (duration > 5000) continue

    const startDate = parseDate(startRaw)
    const endDate = parseDate(endRaw)
    const key = `${id}|${name}|${startRaw}|${endRaw}`

    if (!seen.has(key)) {
      seen.set(key, {
        id,
        name,
        duration,
        startDate,
        endDate,
        isMilestone: duration === 0,
      })
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.id - b.id)
}
