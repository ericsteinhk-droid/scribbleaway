import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { useSync } from '../../context/SyncContext'
import { cn } from '../../utils/cn'

const CONFIG = {
  synced: {
    icon: CheckCircle2,
    label: 'Synchronisé',
    classes: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
  },
  syncing: {
    icon: RefreshCw,
    label: 'Synchronisation…',
    classes: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    spin: true,
  },
  offline: {
    icon: WifiOff,
    label: 'Hors ligne',
    classes: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800',
  },
  offline_pending: {
    icon: WifiOff,
    label: 'Hors ligne — modifications en attente',
    classes: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  },
}

export function SyncBadge({ compact = false }) {
  const { status } = useSync()
  const cfg = CONFIG[status] || CONFIG.synced
  const Icon = cfg.icon

  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium', cfg.classes)}>
      <Icon size={12} className={cfg.spin ? 'animate-spin' : ''} />
      {!compact && <span>{cfg.label}</span>}
    </div>
  )
}
