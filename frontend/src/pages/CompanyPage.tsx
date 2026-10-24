import { message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { companyApi } from '../api/auth'
import { ordersApi } from '../api/orders'
import { useAuth } from '../auth/AuthContext'
import { AccountMenu } from './AccountMenu'
import { OrderFilesBlock } from './OrderFilesBlock'
import { readCurrentCompanyId, writeCurrentCompanyId } from '../currentCompany'
import { formatMonthDay } from '../localDate'
import type { CompanyDesk, CompanySearch, Order } from '../types'
import './account.css'

const kindLabel = {
  company: '公司订单',
  assigned: '分配',
  driven: '行程',
} as const

export function CompanyPage() {
  const { user } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [companies, setCompanies] = useState<CompanySearch[]>([])
  const [companyId, setCompanyId] = useState(readCurrentCompanyId() || '')
  const [desk, setDesk] = useState<CompanyDesk | null>(null)
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [qrKey, setQrKey] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  function applyHome(home: Awaited<ReturnType<typeof companyApi.desk>>) {
    setCompanies(home.companies)
    const selected = home.desk?.id || home.companies[0]?.id || ''
    setCompanyId(selected)
    if (selected) {
      writeCurrentCompanyId(selected)
    }
    setDesk(home.desk ?? null)
    setContact(home.desk?.contact || '')
  }

  async function load(nextId?: string) {
    try {
      let home = await companyApi.desk(nextId)
      if (!home.desk && home.companies[0] && home.companies[0].id !== nextId) {
        home = await companyApi.desk(home.companies[0].id)
      }
      applyHome(home)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载公司信息失败')
    }
  }

  useEffect(() => {
    void load(readCurrentCompanyId() || undefined)
  }, [])

  async function changeCompany(nextId: string) {
    setSelectedOrder(null)
    writeCurrentCompanyId(nextId)
    await load(nextId)
  }

  async function saveContact() {
    if (!desk) {
      return
    }
    setBusy(true)
    try {
      applyHome(await companyApi.updateContact(desk.id, contact.trim()))
      message.success('已保存联系方式')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function uploadQr(file: File) {
    if (!desk) {
      return
    }
    setBusy(true)
    try {
      applyHome(await companyApi.uploadQr(desk.id, file))
      setQrKey((value) => value + 1)
      message.success('已更新二维码')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败')
    } finally {
      setBusy(false)
    }
  }

  async function approve(applicationId: string) {
    setBusy(true)
    try {
      applyHome(await companyApi.approve(applicationId, desk?.id))
      message.success('已批准为调度员')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批准失败')
    } finally {
      setBusy(false)
    }
  }

  async function removeDispatcher(userId: string) {
    setBusy(true)
    try {
      applyHome(await companyApi.removeDispatcher(userId, desk?.id))
      message.success('已移除调度员')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '移除失败')
    } finally {
      setBusy(false)
    }
  }

  async function openOrder(orderId: string) {
    try {
      setSelectedOrder(await ordersApi.get(orderId))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载订单失败')
    }
  }

  if (!user) {
    return null
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <div>
          {companies.length > 0 ? (
            <select
              className="account-select"
              aria-label="当前公司"
              value={companyId}
              onChange={(event) => void changeCompany(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          ) : (
            <h1>公司信息</h1>
          )}
          <p>{desk ? '公司信息' : companies.length === 0 ? '还没有加入公司' : '加载中…'}</p>
        </div>
        <div className="account-header-actions">
          <AccountMenu />
        </div>
      </header>

      {companies.length === 0 ? (
        <main className="account-main">
          <p className="account-hint">在个人信息里搜索公司并申请后，就可以在这里查看公司资料和自己的订单。</p>
        </main>
      ) : null}

      {desk ? (
        <main className="account-main">
          <section className="account-section">
            <div className="account-facts">
              <p>
                公司名称 <span>{desk.name}</span>
              </p>
              <p>
                负责人 <span>{desk.ownerName || '—'}</span>
              </p>
              {desk.canEdit ? (
                <div className="account-search">
                  <input
                    value={contact}
                    placeholder="手机号或微信号"
                    onChange={(event) => setContact(event.target.value)}
                  />
                  <button type="button" className="account-chip" disabled={busy} onClick={() => void saveContact()}>
                    保存
                  </button>
                </div>
              ) : (
                <p>
                  联系方式 <span>{desk.contact || '暂未填写'}</span>
                </p>
              )}
            </div>
            <div className="account-qr-wrap">
              {desk.hasQr ? (
                <img className="account-qr" src={`/api/company/${desk.id}/qr?v=${qrKey}`} alt="公司二维码" />
              ) : (
                <p className="account-empty">暂无二维码</p>
              )}
              {desk.canEdit ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (file) {
                        void uploadQr(file)
                      }
                    }}
                  />
                  <button type="button" className="account-chip" disabled={busy} onClick={() => fileRef.current?.click()}>
                    上传二维码
                  </button>
                </>
              ) : null}
            </div>
          </section>

          {desk.canManage ? (
            <>
              <section className="account-section">
                <h2>待批准申请</h2>
                {desk.applications.length === 0 ? <p className="account-empty">暂无申请</p> : null}
                {desk.applications.map((item) => (
                  <div className="account-row" key={item.id}>
                    <p>
                      {item.name} <span>{item.username}</span>
                    </p>
                    <button
                      type="button"
                      className="account-chip primary"
                      disabled={busy}
                      onClick={() => void approve(item.id)}
                    >
                      批准成为调度员
                    </button>
                  </div>
                ))}
              </section>
              <section className="account-section">
                <h2>调度员</h2>
                {desk.dispatchers.length === 0 ? <p className="account-empty">暂无调度员</p> : null}
                {desk.dispatchers.map((item) => (
                  <div className="account-row" key={item.userId}>
                    <p>
                      {item.name} <span>{item.username}</span>
                    </p>
                    <button
                      type="button"
                      className="account-chip danger"
                      disabled={busy}
                      onClick={() => void removeDispatcher(item.userId)}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </section>
            </>
          ) : null}

          <section className="account-section">
            <h2>历史订单</h2>
            {desk.orders.length === 0 ? <p className="account-empty">暂无历史订单</p> : null}
            <div className="account-grid">
              {desk.orders.map((order) => (
                <button
                  type="button"
                  className={`account-tile${selectedOrder?.id === order.id ? ' open' : ''}`}
                  key={order.id}
                  onClick={() => void openOrder(order.id)}
                >
                  <strong>{order.orderNo.slice(-6)}</strong>
                  <span>{formatMonthDay(order.startDate)}</span>
                  <em>{kindLabel[order.kind]}</em>
                </button>
              ))}
            </div>
          </section>
        </main>
      ) : null}

      {selectedOrder ? (
        <div className="account-overlay">
          <div className="account-card">
            <div className="account-card-bar">
              <h2>{selectedOrder.orderNo}</h2>
              <button type="button" className="account-chip" onClick={() => setSelectedOrder(null)}>
                关闭
              </button>
            </div>
            {selectedOrder.platformOrderNo ? <p>公司订单号 {selectedOrder.platformOrderNo}</p> : null}
            <p>
              {formatMonthDay(selectedOrder.startDate)}
              {selectedOrder.endDate ? ` 至 ${formatMonthDay(selectedOrder.endDate)}` : ''}
              {selectedOrder.dayCount ? ` · ${selectedOrder.dayCount} 天` : ''}
            </p>
            {selectedOrder.notes ? <p>{selectedOrder.notes}</p> : null}
            <div className="account-files">
              <p>订单截图</p>
              <OrderFilesBlock
                orderId={selectedOrder.id}
                files={selectedOrder.files ?? []}
                onChanged={() => void openOrder(selectedOrder.id)}
              />
            </div>
            <div className="account-days">
              {selectedOrder.days.map((day) => (
                <p key={day.id}>
                  {formatMonthDay(day.serviceDate)}
                  <span>{day.driverName || '未派'}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
