import { Button, Card, DatePicker, Form, Input, InputNumber, Popconfirm, Select, Space, Typography, message } from 'antd'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { driversApi } from '../api/drivers'
import { isStoredFile, ordersApi } from '../api/orders'
import type { Driver, ItineraryDay, OrderActivity, OrderActivityWrite, OrderFile } from '../types'
import { FileField } from './FileField'
import { OrderFilesBlock } from './OrderFilesBlock'

interface OrderFormValues {
  platformOrderNo?: string
  sourceCompany?: string
  startDate: Dayjs
  guestCount: number
  notes?: string
}

export function OrderEditPage() {
  const { orderId } = useParams()
  const isNew = orderId === 'new' || !orderId
  const navigate = useNavigate()
  const [form] = Form.useForm<OrderFormValues>()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(isNew ? null : orderId)
  const [orderNo, setOrderNo] = useState<string>('')
  const [files, setFiles] = useState<OrderFile[]>([])
  const [newDayDate, setNewDayDate] = useState<Dayjs | null>(null)

  useEffect(() => {
    void driversApi.list().then(setDrivers)
  }, [])

  async function loadOrder(id: string) {
    const order = await ordersApi.get(id)
    setCurrentOrderId(order.id)
    setOrderNo(order.orderNo)
    setDays(order.days ?? [])
    setFiles(order.files ?? [])
    setSelectedDayId((current) => current ?? order.days[0]?.id ?? null)
    form.setFieldsValue({
      platformOrderNo: order.platformOrderNo ?? undefined,
      sourceCompany: order.sourceCompany ?? undefined,
      startDate: parseLocalDate(order.startDate),
      guestCount: order.guestCount,
      notes: order.notes ?? undefined,
    })
  }

  useEffect(() => {
    if (isNew || !orderId) {
      return
    }
    void loadOrder(orderId)
  }, [form, isNew, orderId])

  const selectedDay = days.find((day) => day.id === selectedDayId) ?? null

  async function saveOrder() {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = {
        platformOrderNo: values.platformOrderNo,
        sourceCompany: values.sourceCompany,
        startDate: formatLocalDate(values.startDate),
        guestCount: values.guestCount,
        notes: values.notes,
      }
      const saved = currentOrderId
        ? await ordersApi.update(currentOrderId, payload)
        : await ordersApi.create(payload)
      setCurrentOrderId(saved.id)
      setOrderNo(saved.orderNo)
      setDays(saved.days ?? [])
      message.success(`订单已保存 ${saved.orderNo}`)
      if (isNew) {
        navigate(`/orders/${saved.id}`, { replace: true })
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存订单失败')
    } finally {
      setSaving(false)
    }
  }

  async function assignAll(driverId: string | null) {
    if (!currentOrderId) {
      message.warning('请先保存订单')
      return
    }
    const result = await ordersApi.assignDriver(currentOrderId, driverId)
    await loadOrder(currentOrderId)
    if (result.warnings.length > 0) {
      message.warning(result.warnings.join('；'))
    } else {
      message.success('已更新整单司机')
    }
  }

  async function addDay() {
    if (!currentOrderId || !newDayDate) {
      message.warning('请先保存订单并选择日期')
      return
    }
    const created = await ordersApi.createDay(currentOrderId, {
      serviceDate: formatLocalDate(newDayDate),
    })
    setNewDayDate(null)
    await loadOrder(currentOrderId)
    setSelectedDayId(created.id)
  }

  async function saveDay(day: ItineraryDay, patch: Partial<ItineraryDay>) {
    if (!currentOrderId) {
      return
    }
    const updated = await ordersApi.updateDay(currentOrderId, day.id, {
      serviceDate: patch.serviceDate ?? day.serviceDate,
      description: patch.description ?? day.description,
      endLocation: patch.endLocation ?? day.endLocation,
      driverId: patch.driverId === undefined ? day.driverId : patch.driverId,
    })
    if (updated.warnings && updated.warnings.length > 0) {
      message.warning(updated.warnings.join('；'))
    }
    await loadOrder(currentOrderId)
    setSelectedDayId(day.id)
  }

  async function saveActivity(day: ItineraryDay, activity: OrderActivity | null, values: OrderActivityWrite) {
    if (!currentOrderId) {
      return
    }
    if (activity) {
      await ordersApi.updateActivity(currentOrderId, day.id, activity.id, values)
    } else {
      await ordersApi.createActivity(currentOrderId, day.id, values)
    }
    await loadOrder(currentOrderId)
    setSelectedDayId(day.id)
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        {isNew ? '新增订单' : `订单 ${orderNo}`}
      </Typography.Title>
      <Card>
        <Form form={form} layout="vertical" initialValues={{ guestCount: 0 }}>
          <Form.Item name="platformOrderNo" label="平台订单号">
            <Input placeholder="可为空" />
          </Form.Item>
          <Form.Item name="sourceCompany" label="来源公司">
            <Input />
          </Form.Item>
          <Form.Item name="startDate" label="起始日期" rules={[{ required: true, message: '请选择起始日期' }]}>
            <DatePicker />
          </Form.Item>
          <Form.Item name="guestCount" label="游客人数" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Button type="primary" loading={saving} onClick={() => void saveOrder()}>
            保存订单
          </Button>
        </Form>
        {currentOrderId ? (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>订单截图</Typography.Text>
            <OrderFilesBlock orderId={currentOrderId} files={files} onChanged={() => void loadOrder(currentOrderId)} />
          </div>
        ) : null}
      </Card>

      {currentOrderId && (
        <Card
          title="行程日期"
          extra={
            <Space wrap>
              <DatePicker value={newDayDate} onChange={setNewDayDate} />
              <Button onClick={() => void addDay()}>新增行程日</Button>
              <Select
                allowClear
                placeholder="整单派给司机"
                style={{ minWidth: 180 }}
                options={drivers.map((driver) => ({ value: driver.id, label: driver.name }))}
                onChange={(value) => void assignAll(value ?? null)}
              />
            </Space>
          }
        >
          <Space wrap>
            {days.map((day) => (
              <Card
                key={day.id}
                size="small"
                hoverable
                onClick={() => setSelectedDayId(day.id)}
                style={{
                  width: 180,
                  borderColor: day.id === selectedDayId ? '#1677ff' : undefined,
                }}
              >
                <div>{day.serviceDate}</div>
                <div>结束：{day.endLocation || '未填'}</div>
                <div>司机：{day.driverName || '未派'}</div>
                <div>活动：{day.activityCount}</div>
              </Card>
            ))}
          </Space>
        </Card>
      )}

      {selectedDay && currentOrderId && (
        <Card
          title={`${selectedDay.serviceDate} 当日行程`}
          extra={
            <Popconfirm
              title="删除这一天？"
              onConfirm={async () => {
                await ordersApi.removeDay(currentOrderId, selectedDay.id)
                setSelectedDayId(null)
                await loadOrder(currentOrderId)
              }}
            >
              <Button danger>删除行程日</Button>
            </Popconfirm>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Input.TextArea
              rows={3}
              placeholder="行程描述"
              defaultValue={selectedDay.description ?? ''}
              key={`${selectedDay.id}-desc`}
              onBlur={(event) => void saveDay(selectedDay, { description: event.target.value })}
            />
            <Input
              placeholder="结束地点"
              defaultValue={selectedDay.endLocation ?? ''}
              key={`${selectedDay.id}-loc`}
              onBlur={(event) => void saveDay(selectedDay, { endLocation: event.target.value })}
            />
            <Select
              allowClear
              placeholder="当天司机"
              value={selectedDay.driverId ?? undefined}
              options={drivers.map((driver) => ({ value: driver.id, label: driver.name }))}
              onChange={(value) => void saveDay(selectedDay, { driverId: value ?? null })}
            />
            <Typography.Text strong>活动项目</Typography.Text>
            {selectedDay.activities.map((activity) => (
              <ActivityForm
                key={activity.id}
                orderId={currentOrderId}
                dayId={selectedDay.id}
                activity={activity}
                onSave={(values) => void saveActivity(selectedDay, activity, values)}
                onTicketChanged={() => void loadOrder(currentOrderId).then(() => setSelectedDayId(selectedDay.id))}
                onDelete={async () => {
                  await ordersApi.removeActivity(currentOrderId, selectedDay.id, activity.id)
                  await loadOrder(currentOrderId)
                  setSelectedDayId(selectedDay.id)
                }}
              />
            ))}
            <ActivityForm
              orderId={currentOrderId}
              dayId={selectedDay.id}
              onSave={(values) => void saveActivity(selectedDay, null, values)}
            />
          </Space>
        </Card>
      )}
    </Space>
  )
}

function formatLocalDate(value: string | Dayjs) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  return (dayjs.isDayjs(value) ? value : dayjs(value)).format('YYYY-MM-DD')
}

function parseLocalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayjs(`${value}T00:00:00`) : dayjs(value)
}

function formatLocalDateTime(value: string | Dayjs | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = dayjs.isDayjs(value) ? value : dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm:ss') : null
}

function ActivityForm({
  orderId,
  dayId,
  activity,
  onSave,
  onTicketChanged,
  onDelete,
}: {
  orderId: string
  dayId: string
  activity?: OrderActivity
  onSave: (values: OrderActivityWrite) => void
  onTicketChanged?: () => void
  onDelete?: () => void
}) {
  const [form] = Form.useForm<OrderActivityWrite>()

  useEffect(() => {
    form.setFieldsValue({
      content: activity?.content,
      provider: activity?.provider ?? undefined,
      bookingTime: activity?.bookingTime ?? undefined,
      checkinTime: activity?.checkinTime ?? undefined,
    })
  }, [activity, form])

  return (
    <Card size="small" title={activity ? '活动' : '新增活动'}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) =>
          onSave({
            ...values,
            bookingTime: formatLocalDateTime(values.bookingTime),
            checkinTime: formatLocalDateTime(values.checkinTime),
          })
        }
      >
        <Form.Item name="content" label="活动内容" rules={[{ required: true, message: '请输入活动内容' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="provider" label="承办方">
          <Input />
        </Form.Item>
        <Form.Item name="bookingTime" label="预订时间" getValueProps={(value) => ({ value: value ? dayjs(value) : null })}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="checkinTime" label="签到时间" getValueProps={(value) => ({ value: value ? dayjs(value) : null })}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        {activity ? (
          <Form.Item label="电子票">
            <Space>
              {isStoredFile(activity.ticketPath) ? (
                <a href={ordersApi.ticketUrl(orderId, dayId, activity.id)} target="_blank" rel="noreferrer">
                  查看电子票
                </a>
              ) : null}
              <FileField
                label={activity.ticketPath ? '更换电子票' : '上传电子票'}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onPick={(file) => {
                  void ordersApi.uploadTicket(orderId, dayId, activity.id, file).then(() => onTicketChanged?.())
                }}
              />
            </Space>
          </Form.Item>
        ) : null}
        <Space>
          <Button htmlType="submit" type="primary">
            {activity ? '保存活动' : '添加活动'}
          </Button>
          {onDelete && (
            <Button danger onClick={onDelete}>
              删除
            </Button>
          )}
        </Space>
      </Form>
    </Card>
  )
}
