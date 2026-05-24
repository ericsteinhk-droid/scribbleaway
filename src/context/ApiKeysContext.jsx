import { createContext, useContext, useEffect, useState } from 'react'

const ApiKeysContext = createContext(null)
const STORAGE_KEY = 'rdc_api_keys'

export function ApiKeysProvider({ children }) {
  const [keys, setKeys] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : { anthropic: '', openai: '' }
    } catch {
      return { anthropic: '', openai: '' }
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  }, [keys])

  function setKey(service, value) {
    setKeys((prev) => ({ ...prev, [service]: value }))
  }

  function getKey(service) {
    return keys[service] || import.meta.env[`VITE_${service.toUpperCase()}_API_KEY`] || ''
  }

  return (
    <ApiKeysContext.Provider value={{ keys, setKey, getKey }}>
      {children}
    </ApiKeysContext.Provider>
  )
}

export function useApiKeys() {
  const ctx = useContext(ApiKeysContext)
  if (!ctx) throw new Error('useApiKeys must be used within ApiKeysProvider')
  return ctx
}
