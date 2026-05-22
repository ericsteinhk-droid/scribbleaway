import { createContext, useContext, useEffect, useState } from 'react'

const SyncContext = createContext(null)

export function SyncProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingWrites, setPendingWrites] = useState(0)

  useEffect(() => {
    function handleOnline() { setIsOnline(true) }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function incrementPending() { setPendingWrites((n) => n + 1) }
  function decrementPending() { setPendingWrites((n) => Math.max(0, n - 1)) }

  let status = 'synced'
  if (!isOnline && pendingWrites > 0) status = 'offline_pending'
  else if (!isOnline) status = 'offline'
  else if (pendingWrites > 0) status = 'syncing'

  return (
    <SyncContext.Provider value={{ isOnline, status, pendingWrites, incrementPending, decrementPending }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync must be used within SyncProvider')
  return ctx
}
