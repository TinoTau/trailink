import { Layout, Menu } from 'antd'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { DispatcherPage } from './pages/dispatcher/DispatcherPage'
import { DriverCalendarPage } from './pages/driver/DriverCalendarPage'
import { DriversPage } from './pages/DriversPage'
import { OrderEditPage } from './pages/OrderEditPage'
import { OrdersPage } from './pages/OrdersPage'

export default function App() {
  const location = useLocation()
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
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderEditPage />} />
          <Route path="/drivers" element={<DriversPage />} />
        </Routes>
      </Layout.Content>
    </Layout>
  )
}
