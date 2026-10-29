import { message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { keepDraft, usePageLoad } from '../usePageLoad'
import { companyApi } from '../api/auth'
import { ordersApi } from '../api/orders'
import { useAuthenticatedAuth } from '../auth/authState'
import { AccountMenu } from './AccountMenu'
import { OrderFilesBlock } from './OrderFilesBlock'
import { OrderDetailNotes } from './OrderInfoFields'
import { readCurrentCompanyId, writeCurrentCompanyId } from '../currentCompany'
import { formatMonthDay } from '../localDate'
import { dayActivityLine, formatActivityLine, orderDisplayLabel, parseActivityLine } from '../orderFlags'
import { contactLabel } from '../text'
import type { CompanyDesk, CompanySearch, Order } from '../types'
import './account.css'

export function CompanyPage() {
  const { user, refresh } = useAuthenticatedAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [companies, setCompanies] = useState<CompanySearch[]>([])
  const [companyId, setCompanyId] = useState(readCurrentCompanyId() || '')
  const [desk, setDesk] = useState<CompanyDesk | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [qrKey, setQrKey] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [ready, setReady] = useState(false)
  const selectedOrderRef = useRef<Order | null>(null)
  const nameRef = useRef(companyName)
  const contactRef = useRef(contact)
  const noteRef = useRef(note)
  const loadedName = useRef<string | undefined>(undefined)
  const loadedContact = useRef<string | undefined>(undefined)
  const loadedNote = useRef<string | undefined>(undefined)

  useEffect(() => {
    selectedOrderRef.current = selectedOrder
    nameRef.current = companyName
    contactRef.current = contact
    noteRef.current = note
  })

  function applyHome(home: Awaited<ReturnType<typeof companyApi.desk>>) {
    setCompanies(home.companies)
    const selected = home.desk?.id || home.companies[0]?.id || ''
    setCompanyId(selected)
    if (selected) {
      writeCurrentCompanyId(selected)
    }
    setDesk(home.desk ?? null)
    const nextName = home.desk?.name || ''
    const nextContact = home.desk?.contact || ''
    const nextNote = home.desk?.notes || ''
    const name = keepDraft(nameRef.current, loadedName.current, nextName)
    const nextContactValue = keepDraft(contactRef.current, loadedContact.current, nextContact)
    const noteValue = keepDraft(noteRef.current, loadedNote.current, nextNote)
    loadedName.current = nextName
    loadedContact.current = nextContact
    loadedNote.current = nextNote
    nameRef.current = name
    contactRef.current = nextContactValue
    noteRef.current = noteValue
    setCompanyName(name)
    setContact(nextContactValue)
    setNote(noteValue)
  }

  async function load(nextId?: string) {
    try {
      let home = await companyApi.desk(nextId)
      if (!home.desk && home.companies[0] && home.companies[0].id !== nextId) {
        home = await companyApi.desk(home.companies[0].id)
      }
      applyHome(home)
      const openId = selectedOrderRef.current?.id
      if (openId) {
        try {
          const fresh = await ordersApi.get(openId)
          setSelectedOrder((current) => (current?.id === openId ? fresh : current))
        } catch {
          setSelectedOrder((current) => (current?.id === openId ? null : current))
        }
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载公司信息失败')
    } finally {
      setReady(true)
    }
  }

  usePageLoad(() => load(readCurrentCompanyId()))

  async function changeCompany(nextId: string) {
    setSelectedOrder(null)
    writeCurrentCompanyId(nextId)
    await load(nextId)
  }

  async function saveName() {
    if (!desk) {
      return
    }
    const next = companyName.trim()
    if (!next) {
      message.warning('请填写公司名称')
      return
    }
    setBusy(true)
    try {
      applyHome(await companyApi.updateName(desk.id, next))
      await refresh()
      message.success('已保存公司名称')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败')
    } finally {
      setBusy(false)
    }
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

  async function saveNote() {
    if (!desk) {
      return
    }
    setBusy(true)
    try {
      applyHome(await companyApi.updateNote(desk.id, note.trim()))
      message.success('已保存公司简称')
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
      message.success('已更新公司头像')
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

  async function saveDayActivities(orderId: string, day: Order['days'][number], raw: string) {
    const parts = parseActivityLine(raw)
    const existing = [...day.activities].sort((left, right) => left.sortOrder - right.sortOrder)
    if (dayActivityLine(existing) === formatActivityLine(parts)) {
      return
    }
    try {
      const count = Math.max(parts.length, existing.length)
      for (let index = 0; index < count; index += 1) {
        const activity = existing[index]
        const part = parts[index]
        if (activity && part && activity.content.trim() !== part) {
          await ordersApi.updateActivity(orderId, day.id, activity.id, {
            content: part,
            provider: activity.provider,
            bookingTime: activity.bookingTime,
            checkinTime: activity.checkinTime,
          })
        } else if (!activity && part) {
          await ordersApi.createActivity(orderId, day.id, { content: part })
        } else if (activity && !part) {
          await ordersApi.removeActivity(orderId, day.id, activity.id)
        }
      }
      const fresh = await ordersApi.get(orderId)
      setSelectedOrder((current) => (current?.id === orderId ? fresh : current))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存活动失败')
    }
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
                  {company.notes?.trim() || company.name}
                </option>
              ))}
            </select>
          ) : (
            <h1>公司信息</h1>
          )}
          <p>{!ready ? '加载中…' : desk ? '公司信息' : '还没有加入公司'}</p>
        </div>
        <div className="account-header-actions">
          <AccountMenu />
        </div>
      </header>

      {ready && companies.length === 0 ? (
        <main className="account-main">
          <p className="account-hint">在个人信息里搜索公司并申请后，就可以在这里查看公司资料和自己的订单。</p>
        </main>
      ) : null}

      {desk ? (
        <main className="account-main profile-main">
          <section className="account-section profile-block">
            <h2>公司资料</h2>
            <div className="profile-identity">
              <div className="profile-avatar">
                {desk.hasQr ? (
                  <img className="account-qr" src={`/api/company/${desk.id}/qr?v=${qrKey}`} alt="公司头像" />
                ) : (
                  <div className="account-qr placeholder">暂无公司头像</div>
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
                      上传公司头像
                    </button>
                  </>
                ) : null}
              </div>
              <div className="profile-fields">
                {desk.canEdit ? (
                  <div className="account-search">
                    <label className="account-note-label" htmlFor="company-name">
                      公司名称
                    </label>
                    <input
                      id="company-name"
                      value={companyName}
                      maxLength={200}
                      aria-label="公司名称"
                      onChange={(event) => setCompanyName(event.target.value)}
                    />
                    <button type="button" className="account-chip" disabled={busy} onClick={() => void saveName()}>
                      保存
                    </button>
                  </div>
                ) : (
                  <p>
                    公司名称 <span>{desk.name}</span>
                  </p>
                )}
                {desk.canEdit ? (
                  <div className="account-search">
                    <label className="account-note-label" htmlFor="company-contact">
                      联系方式
                    </label>
                    <input
                      id="company-contact"
                      value={contact}
                      maxLength={200}
                      placeholder="手机号或微信号"
                      aria-label="联系方式"
                      onChange={(event) => setContact(event.target.value)}
                    />
                    <button type="button" className="account-chip" disabled={busy} onClick={() => void saveContact()}>
                      保存
                    </button>
                  </div>
                ) : (
                  <p>
                    联系方式 <span>{contactLabel(desk.contact)}</span>
                  </p>
                )}
                <div className="account-search">
                  <label className="account-note-label" htmlFor="company-note">
                    公司简称
                  </label>
                  <input
                    id="company-note"
                    value={note}
                    maxLength={20}
                    placeholder="只自己可见"
                    aria-label="公司简称"
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <button type="button" className="account-chip" disabled={busy} onClick={() => void saveNote()}>
                    保存
                  </button>
                </div>
              </div>
            </div>
            <div className="profile-meta">
              <p>
                负责人 <span>{desk.ownerName || '—'}</span>
              </p>
            </div>
          </section>

          {user.role === 'company' && desk.canManage ? (
            <>
              <section className="account-section profile-block">
                <h2>待批准申请</h2>
                {desk.applications.length === 0 ? <p className="account-empty">暂无申请</p> : null}
                {desk.applications.map((item) => (
                  <div className="account-row" key={item.id}>
                    <p>
                      {item.name} <span>{contactLabel(item.contact)}</span>
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
              <section className="account-section profile-block">
                <h2>调度员</h2>
                {desk.dispatchers.length === 0 ? <p className="account-empty">暂无调度员</p> : null}
                {desk.dispatchers.map((item) => (
                  <div className="account-row" key={item.userId}>
                    <p>
                      {item.name} <span>{contactLabel(item.contact)}</span>
                    </p>
                    {item.userId === user.id ? null : (
                    <button
                      type="button"
                      className="account-chip danger"
                      disabled={busy}
                      onClick={() => void removeDispatcher(item.userId)}
                    >
                      移除
                    </button>
                    )}
                  </div>
                ))}
              </section>
            </>
          ) : null}

          <section className="account-section profile-block">
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
                  <strong>{orderDisplayLabel(order)}</strong>
                  <span>{formatMonthDay(order.startDate)}</span>
                  <em>{order.dayCount}天</em>
                </button>
              ))}
            </div>
          </section>
        </main>
      ) : null}

      {selectedOrder ? (
        <div
          className="account-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedOrder(null)
            }
          }}
        >
          <div className="account-card">
            <div className="account-card-bar">
              <h2>{orderDisplayLabel(selectedOrder)}</h2>
              <button type="button" className="account-chip" onClick={() => setSelectedOrder(null)}>
                关闭
              </button>
            </div>
            <p>
              {formatMonthDay(selectedOrder.startDate)}
              {selectedOrder.endDate ? ` 至 ${formatMonthDay(selectedOrder.endDate)}` : ''}
              {selectedOrder.dayCount ? ` · ${selectedOrder.dayCount} 天` : ''}
            </p>
            <OrderDetailNotes
              order={selectedOrder}
              role={user.role}
              onSaved={(saved) => {
                setSelectedOrder(saved)
              }}
            />
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
                <label className="account-day" key={day.id}>
                  <span>{formatMonthDay(day.serviceDate)}</span>
                  <input
                    key={dayActivityLine(day.activities)}
                    aria-label={`${formatMonthDay(day.serviceDate)}活动`}
                    defaultValue={dayActivityLine(day.activities)}
                    onBlur={(event) => void saveDayActivities(selectedOrder.id, day, event.target.value)}
                  />
                  <span className="account-day-driver" title={day.driverName || '未分配'}>
                    {day.driverName || '未分配'}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
