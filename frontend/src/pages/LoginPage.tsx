import { Button, Card, Form, Input, Tabs, Typography, message } from 'antd'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { homeFor, useAuth } from '../auth/AuthContext'

export function LoginPage() {
  const { user, setUser } = useAuth()
  const [busy, setBusy] = useState(false)

  if (user) {
    return <Navigate to={homeFor(user.role)} replace />
  }

  async function login(values: { username: string; password: string }) {
    setBusy(true)
    try {
      setUser(await authApi.login(values.username, values.password))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  async function register(values: {
    username: string
    password: string
    name: string
    companyName?: string
    accountType: 'driver' | 'company'
  }) {
    setBusy(true)
    try {
      setUser(await authApi.register(values))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f5f5' }}>
      <Card style={{ width: 'min(420px, 100%)' }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Trailink
        </Typography.Title>
        <Typography.Paragraph type="secondary">登录后按角色进入对应界面。</Typography.Paragraph>
        <Tabs
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form layout="vertical" onFinish={login}>
                  <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input autoComplete="username" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={busy} block>
                    登录
                  </Button>
                </Form>
              ),
            },
            {
              key: 'driver',
              label: '注册司导',
              children: (
                <Form layout="vertical" onFinish={(values) => register({ ...values, accountType: 'driver' })}>
                  <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请填写姓名' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, message: '至少 3 个字符' }]}>
                    <Input autoComplete="username" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={busy} block>
                    注册司导
                  </Button>
                </Form>
              ),
            },
            {
              key: 'company',
              label: '注册公司',
              children: (
                <Form layout="vertical" onFinish={(values) => register({ ...values, accountType: 'company' })}>
                  <Form.Item name="companyName" label="公司名称" rules={[{ required: true, message: '请填写公司名称' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="name" label="管理人姓名" rules={[{ required: true, message: '请填写姓名' }]}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3, message: '至少 3 个字符' }]}>
                    <Input autoComplete="username" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true, min: 8, message: '至少 8 位' }]}>
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={busy} block>
                    注册公司
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
