export interface DetectedRevision {
  label: string
  sortKey: string | null
}

const REVISION_CODE_RE = /R(\d{2,3})/i
const ISO_DATE_RE = /(\d{4})(\d{2})(\d{2})/
const VERSION_RE = /[Vv](\d+[\.\d]*)/

export function detectRevisionLabel(filename: string): DetectedRevision {
  const stem = filename.replace(/\.[^.]+$/, '')

  const revMatch = REVISION_CODE_RE.exec(stem)
  if (revMatch) {
    return { label: `R${revMatch[1]}`, sortKey: revMatch[1].padStart(5, '0') }
  }

  const isoMatch = ISO_DATE_RE.exec(stem)
  if (isoMatch) {
    const label = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    return { label, sortKey: label }
  }

  const verMatch = VERSION_RE.exec(stem)
  if (verMatch) {
    return { label: `V${verMatch[1]}`, sortKey: verMatch[1].padStart(10, '0') }
  }

  return { label: stem, sortKey: null }
}
