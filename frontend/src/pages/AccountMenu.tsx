import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import './account-menu.css'

const ITEMS = [
  { to: '/dispatcher', label: '调度台', staffOnly: true },
  { to: '/company', label: '公司信息' },
  { to: '/me', label: '个人信息' },
] as const

function matchesPath(path: string, to: string) {
  return path === to || path.startsWith(`${to}/`)
}

export function AccountMenu() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const onCalendar = location.pathname.startsWith('/driver')

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!user) {
    return null
  }

  const links = ITEMS.filter((item) => {
    if (item.staffOnly && user.role === 'driver') {
      return false
    }
    return !matchesPath(location.pathname, item.to)
  })

  return (
    <div className="account-menu-group">
      {onCalendar ? null : (
        <Link className="account-menu-trigger" to="/driver/calendar">
          我的行程
        </Link>
      )}
      <div className="account-menu" ref={rootRef}>
        <button
          type="button"
          className={`account-menu-trigger more${open ? ' open' : ''}`}
          aria-label="更多"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          <MoreIcon />
        </button>
        {open ? (
          <div className="account-menu-list" role="menu">
            {links.map((item) => (
              <Link key={item.to} role="menuitem" to={item.to} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                void logout()
              }}
            >
              退出
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}
