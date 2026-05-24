import { useState } from 'react'
import { Moon, Sun, LogOut, ChevronLeft, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { SyncBadge } from '../ui/SyncBadge'
import { SettingsModal } from '../settings/SettingsModal'

export function AppHeader({ title, backTo, actions }) {
  const { logout } = useAuth()
  const { isDark, toggle } = useTheme()
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          {backTo && (
            <button onClick={() => navigate(backTo)} className="btn-ghost p-2 -ml-2 rounded-xl">
              <ChevronLeft size={20} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <img
              src="/evoq_logo.png"
              alt="EVOQ"
              className="h-6 w-auto object-contain shrink-0 dark:brightness-90"
              draggable={false}
            />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">
                {title || 'Rapports de Chantier'}
              </h1>
              <div className="mt-0.5">
                <SyncBadge />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <button onClick={() => setShowSettings(true)} className="btn-ghost p-2 rounded-xl" aria-label="Paramètres">
              <Settings size={18} />
            </button>
            <button onClick={toggle} className="btn-ghost p-2 rounded-xl" aria-label="Changer de thème">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={logout} className="btn-ghost p-2 rounded-xl" aria-label="Se déconnecter">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
