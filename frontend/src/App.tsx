import { Button, Layout, Menu } from 'antd'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { homeFor, useAuth } from './auth/AuthContext'
import { CompanyPage } from './pages/CompanyPage'
import { DispatcherPage } from './pages/dispatcher/DispatcherPage'
import { DriverCalendarPage } from './pages/driver/DriverCalendarPage'
import { DriversPage } from './pages/DriversPage'
import { LoginPage } from './pages/LoginPage'
import { OrderEditPage } from './pages/OrderEditPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProfilePage } from './pages/ProfilePage'
import type { UserRole } from './types'

function canOpen(role: UserRole, path: string) {
  if (role === 'company') {
    return true
  }
  if (role === 'dispatcher') {
    return (
      path.startsWith('/dispatcher') ||
      path.startsWith('/orders') ||
      path.startsWith('/drivers') ||
      path.startsWith('/company') ||
      path.startsWith('/driver') ||
      path.startsWith('/me')
    )
  }
  return path.startsWith('/driver') || path.startsWith('/company') || path.startsWith('/me')
}

export default function App() {
  const { user, ready, logout } = useAuth()
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

  if (location.pathname.startsWith('/dispatcher')) {
    return (
      <Routes>
        <Route path="/dispatcher" element={<DispatcherPage />} />
        <Route path="/dispatcher/*" element={<Navigate to="/dispatcher" replace />} />
      </Routes>
    )
  }

  if (location.pathname.startsWith('/driver')) {
    return (
      <Routes>
        <Route path="/driver/calendar" element={<DriverCalendarPage />} />
        <Route path="/driver/*" element={<Navigate to="/driver/calendar" replace />} />
      </Routes>
    )
  }

  if (location.pathname.startsWith('/company')) {
    return (
      <Routes>
        <Route path="/company" element={<CompanyPage />} />
      </Routes>
    )
  }

  if (location.pathname.startsWith('/me')) {
    return (
      <Routes>
        <Route path="/me" element={<ProfilePage />} />
      </Routes>
    )
  }

  const selected = location.pathname.startsWith('/drivers') ? 'drivers' : 'orders'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ color: '#fff', fontWeight: 600 }}>Trailink</div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selected]}
          items={[
            { key: 'orders', label: <Link to="/orders">订单</Link> },
            { key: 'drivers', label: <Link to="/drivers">司机</Link> },
            { key: 'dispatcher', label: <Link to="/dispatcher">调度台</Link> },
          ]}
          style={{ flex: 1, minWidth: 0 }}
        />
        <span style={{ color: '#fff' }}>{user.name}</span>
        <Button onClick={() => void logout()}>退出</Button>
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<Navigate to={homeFor(user.role)} replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderEditPage />} />
          <Route path="/drivers" element={<DriversPage />} />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
