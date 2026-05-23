import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { SyncProvider } from './context/SyncContext'
import { ToastProvider } from './components/ui/Toast'
import { LoginPage } from './components/auth/LoginPage'
import { ProjectsPage } from './components/projects/ProjectsPage'
import { ReportsPage } from './components/reports/ReportsPage'
import { ReportDetailPage } from './components/reports/ReportDetailPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
      <Route path="/projects/:projectId/reports/:reportId" element={<ProtectedRoute><ReportDetailPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SyncProvider>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </SyncProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
