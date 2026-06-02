import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export function formatDate(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return format(d, 'd MMMM yyyy', { locale: fr })
}

export function formatDateShort(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return format(d, 'dd/MM/yyyy', { locale: fr })
}

export function formatDateTime(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return format(d, "d MMMM yyyy 'à' HH:mm", { locale: fr })
}

export function formatRelative(date) {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  return formatDistanceToNow(d, { locale: fr, addSuffix: true })
}

export function formatReportNumber(num) {
  return String(num).padStart(3, '0')
}
