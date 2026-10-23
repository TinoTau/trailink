import { Button, Form, Input, Modal, Popconfirm, Space, Table, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { driversApi } from '../api/drivers'
import type { Driver, DriverWrite } from '../types'

export function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [form] = Form.useForm<DriverWrite>()

  async function load() {
    setLoading(true)
    try {
      setDrivers(await driversApi.list())
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载司机失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    form.resetFields()
    setOpen(true)
  }

  function openEdit(driver: Driver) {
    setEditing(driver)
    form.setFieldsValue({
      name: driver.name,
      phone: driver.phone ?? undefined,
      notes: driver.notes ?? undefined,
    })
    setOpen(true)
  }

  async function submit() {
    const values = await form.validateFields()
    try {
      if (editing) {
        await driversApi.update(editing.id, values)
      } else {
        await driversApi.create(values)
      }
      setOpen(false)
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          司机管理
        </Typography.Title>
        <Button type="primary" onClick={openCreate}>
          新增司机
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={drivers}
        pagination={false}
        columns={[
          { title: '姓名', dataIndex: 'name' },
          { title: '电话', dataIndex: 'phone' },
          { title: '备注', dataIndex: 'notes' },
          {
            title: '操作',
            render: (_, driver) => (
              <Space>
                <Button type="link" onClick={() => openEdit(driver)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确定删除这名司机？"
                  onConfirm={async () => {
                    await driversApi.remove(driver.id)
                    await load()
                  }}
                >
                  <Button type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? '编辑司机' : '新增司机'}
        open={open}
        onOk={() => void submit()}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话">
            <Input />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
