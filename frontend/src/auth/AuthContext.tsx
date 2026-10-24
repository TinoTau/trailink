import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { SessionUser, UserRole } from '../types'

interface AuthState {
  user: SessionUser | null
  ready: boolean
  refresh: () => Promise<void>
  setUser: (user: SessionUser | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function homeFor(role: UserRole) {
  if (role === 'driver') {
    return '/driver/calendar'
  }
  return '/dispatcher'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [ready, setReady] = useState(false)

  async function refresh() {
    try {
      setUser(await authApi.me())
    } catch {
      setUser(null)
    } finally {
      setReady(true)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      refresh,
      setUser,
      logout: async () => {
        try {
          await authApi.logout()
        } finally {
          setUser(null)
        }
      },
    }),
    [ready, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return value
}
