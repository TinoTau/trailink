import { Button, Popconfirm, Space, Table, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ordersApi } from '../api/orders'
import type { Order } from '../types'

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    try {
      setOrders(await ordersApi.list())
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载订单失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          订单管理
        </Typography.Title>
        <Button type="primary" onClick={() => navigate('/orders/new')}>
          新增订单
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={orders}
        pagination={false}
        columns={[
          {
            title: '系统订单号',
            dataIndex: 'orderNo',
            render: (orderNo: string, order) => <Link to={`/orders/${order.id}`}>{orderNo}</Link>,
          },
          { title: '平台订单号', dataIndex: 'platformOrderNo' },
          { title: '来源公司', dataIndex: 'sourceCompany' },
          { title: '开始日期', dataIndex: 'startDate' },
          { title: '行程天数', dataIndex: 'dayCount' },
          { title: '游客人数', dataIndex: 'guestCount' },
          {
            title: '操作',
            render: (_, order) => (
              <Space>
                <Button type="link" onClick={() => navigate(`/orders/${order.id}`)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确定删除这个订单？"
                  onConfirm={async () => {
                    await ordersApi.remove(order.id)
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
    </Space>
  )
}
