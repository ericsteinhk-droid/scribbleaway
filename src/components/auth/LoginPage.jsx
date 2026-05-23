import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../ui/Toast'

export function LoginPage() {
  const { login, register } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState('login')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register: reg, handleSubmit, formState: { errors }, watch } = useForm()

  async function onSubmit(data) {
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(data.email, data.password)
      } else {
        await register(data.email, data.password, data.displayName, data.firm)
        toast('Compte créé avec succès !', 'success')
      }
    } catch (err) {
      const msg = err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password'
        ? 'Email ou mot de passe incorrect.'
        : err.code === 'auth/email-already-in-use'
        ? 'Cet email est déjà utilisé.'
        : err.code === 'auth/weak-password'
        ? 'Le mot de passe doit contenir au moins 6 caractères.'
        : `Erreur: ${err.message}`
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-white dark:from-gray-900 dark:to-gray-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo / branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-600 rounded-2xl mb-4 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="20" width="24" height="4" rx="2" fill="white"/>
              <rect x="8" y="12" width="16" height="4" rx="2" fill="white" opacity="0.8"/>
              <rect x="12" y="4" width="8" height="4" rx="2" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Rapports de Chantier</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Gestion professionnelle pour architectes</p>
        </div>

        <div className="card p-6">
          {/* Mode tabs */}
          <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-6">
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
              onClick={() => setMode('login')}
            >
              Connexion
            </button>
            <button
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'register' ? 'bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
              onClick={() => setMode('register')}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="label">Nom complet</label>
                  <input
                    className="input"
                    placeholder="Jean Dupont"
                    {...reg('displayName', { required: 'Nom requis' })}
                  />
                  {errors.displayName && <p className="text-red-500 text-xs mt-1">{errors.displayName.message}</p>}
                </div>
                <div>
                  <label className="label">Nom du cabinet (optionnel)</label>
                  <input className="input" placeholder="Dupont Architectes" {...reg('firm')} />
                </div>
              </>
            )}

            <div>
              <label className="label">Adresse email</label>
              <input
                className="input"
                type="email"
                placeholder="architecte@exemple.com"
                {...reg('email', { required: 'Email requis' })}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Mot de passe</label>
              <div className="relative">
                <input
                  className="input pr-12"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...reg('password', {
                    required: 'Mot de passe requis',
                    minLength: mode === 'register' ? { value: 6, message: 'Au moins 6 caractères' } : undefined,
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
