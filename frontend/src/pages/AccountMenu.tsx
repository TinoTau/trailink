import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthenticatedAuth } from '../auth/authState'
import { accountMenuItems } from '../navigation'
import './account-menu.css'

export function AccountMenu() {
  const { user, logout } = useAuthenticatedAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const onCalendar = location.pathname.startsWith('/driver')

  useEffect(() => {
    if (!open) {
      return
    }
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
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown)
    }, 0)
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const links = accountMenuItems(user.role, location.pathname)

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
              <Link key={item.path} role="menuitem" to={item.path} onClick={() => setOpen(false)}>
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
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
