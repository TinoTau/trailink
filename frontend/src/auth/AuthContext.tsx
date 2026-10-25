import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { authApi } from '../api/auth'
import type { SessionUser } from '../types'
import { AuthContext, type AuthState } from './authState'

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
    // 初次挂载从 Cookie 会话恢复用户，这是认证外部状态同步。
    // oxlint-disable-next-line react/set-state-in-effect
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
