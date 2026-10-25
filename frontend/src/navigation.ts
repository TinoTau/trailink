import type { UserRole } from './types'

const ALL_ROLES: readonly UserRole[] = ['company', 'dispatcher', 'driver']
const STAFF_ROLES: readonly UserRole[] = ['company', 'dispatcher']

export interface AppNavigationItem {
  path: string
  label: string
  roles: readonly UserRole[]
  accountMenu: boolean
}

export const APP_NAVIGATION: readonly AppNavigationItem[] = [
  { path: '/company/assign', label: '派给调度', roles: ['company'], accountMenu: true },
  { path: '/dispatcher', label: '调度台', roles: STAFF_ROLES, accountMenu: true },
  { path: '/driver/calendar', label: '我的行程', roles: ALL_ROLES, accountMenu: false },
  { path: '/company', label: '公司信息', roles: ALL_ROLES, accountMenu: true },
  { path: '/me', label: '个人信息', roles: ALL_ROLES, accountMenu: true },
] as const

export function matchesNavigationPath(path: string, target: string) {
  if (target === '/company') {
    return path === target
  }
  return path === target || path.startsWith(`${target}/`)
}

export function canRoleOpenPath(role: UserRole, path: string) {
  if (path === '/' || path.startsWith('/orders/') || path.startsWith('/drivers/')) {
    return true
  }
  const item = APP_NAVIGATION.find((candidate) => matchesNavigationPath(path, candidate.path))
  return Boolean(item?.roles.includes(role))
}

export function accountMenuItems(role: UserRole, currentPath: string) {
  return APP_NAVIGATION.filter(
    (item) => item.accountMenu && item.roles.includes(role) && !matchesNavigationPath(currentPath, item.path),
  )
}

export function homeFor(role: UserRole) {
  return role === 'driver' ? '/driver/calendar' : '/dispatcher'
}
