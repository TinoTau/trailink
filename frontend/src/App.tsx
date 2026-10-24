import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from './auth/AuthContext'
import { CompanyPage } from './pages/CompanyPage'
import { DispatcherPage } from './pages/dispatcher/DispatcherPage'
import { DriverCalendarPage } from './pages/driver/DriverCalendarPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import type { UserRole } from './types'

function canOpen(role: UserRole, path: string) {
  if (role === 'company') {
    return true
  }
  if (role === 'dispatcher') {
    return (
      path.startsWith('/dispatcher') ||
      path.startsWith('/company') ||
      path.startsWith('/driver') ||
      path.startsWith('/me')
    )
  }
  return path.startsWith('/driver') || path.startsWith('/company') || path.startsWith('/me')
}

export default function App() {
  const { user, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return null
  }

  if (location.pathname === '/login') {
    return <LoginPage />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!canOpen(user.role, location.pathname)) {
    return <Navigate to={homeFor(user.role)} replace />
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={homeFor(user.role)} replace />} />
      <Route path="/dispatcher" element={<DispatcherPage />} />
      <Route path="/dispatcher/*" element={<Navigate to="/dispatcher" replace />} />
      <Route path="/driver/calendar" element={<DriverCalendarPage />} />
      <Route path="/driver/*" element={<Navigate to="/driver/calendar" replace />} />
      <Route path="/company" element={<CompanyPage />} />
      <Route path="/me" element={<ProfilePage />} />
      <Route path="/orders/*" element={<Navigate to={homeFor(user.role)} replace />} />
      <Route path="/drivers/*" element={<Navigate to={homeFor(user.role)} replace />} />
    </Routes>
  )
}
