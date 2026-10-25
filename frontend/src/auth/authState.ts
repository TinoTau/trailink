import { createContext, useContext } from 'react'
import type { SessionUser } from '../types'

export interface AuthState {
  user: SessionUser | null
  ready: boolean
  refresh: () => Promise<void>
  setUser: (user: SessionUser | null) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return value
}

export function useAuthenticatedAuth(): AuthState & { user: SessionUser } {
  const value = useAuth()
  if (!value.user) {
    throw new Error('受保护页面缺少登录用户')
  }
  return { ...value, user: value.user }
}
