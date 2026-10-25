import { message } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { keepDraft, usePageLoad } from '../usePageLoad'
import { authApi, companyApi, dispatcherApi } from '../api/auth'
import { useAuthenticatedAuth } from '../auth/authState'
import { AccountMenu } from './AccountMenu'
import { FileField } from './FileField'
import type { CompanySearch, DispatcherSearch, DriverApplicant } from '../types'
import { contactLabel } from '../text'
import './account.css'

export function ProfilePage() {
  const { user, refresh, setUser } = useAuthenticatedAuth()
  const [companyKeyword, setCompanyKeyword] = useState('')
  const [companies, setCompanies] = useState<CompanySearch[]>([])
  const [companySearched, setCompanySearched] = useState(false)
  const [dispatcherKeyword, setDispatcherKeyword] = useState('')
  const [dispatchers, setDispatchers] = useState<DispatcherSearch[]>([])
  const [dispatcherSearched, setDispatcherSearched] = useState(false)
  const [applicants, setApplicants] = useState<DriverApplicant[]>([])
  const [applicantsReady, setApplicantsReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [avatarKey, setAvatarKey] = useState(0)
  const [name, setName] = useState(user.name)
  const [contact, setContact] = useState(user.contact ?? '')
  const [username, setUsername] = useState(user.username)
  const [currentPassword, setCurrentPassword] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const nameRef = useRef(name)
  const contactRef = useRef(contact)
  const usernameRef = useRef(username)
  const loadedName = useRef<string | undefined>(undefined)
  const loadedContact = useRef<string | undefined>(undefined)
  const loadedUsername = useRef<string | undefined>(undefined)

  useEffect(() => {
    nameRef.current = name
    contactRef.current = contact
    usernameRef.current = username
  })

  usePageLoad(async () => {
    try {
      const next = await authApi.me()
      setUser(next)
      const nextName = keepDraft(nameRef.current, loadedName.current, next.name)
      const nextContact = keepDraft(contactRef.current, loadedContact.current, next.contact ?? '')
      const nextUsername = keepDraft(usernameRef.current, loadedUsername.current, next.username)
      loadedName.current = next.name
      loadedContact.current = next.contact ?? ''
      loadedUsername.current = next.username
      nameRef.current = nextName
      contactRef.current = nextContact
      usernameRef.current = nextUsername
      setName(nextName)
      setContact(nextContact)
      setUsername(nextUsername)
      if (next.role === 'dispatcher' || next.role === 'company') {
        try {
          setApplicants(await dispatcherApi.incoming())
        } catch (error) {
          message.error(error instanceof Error ? error.message : '加载司导申请失败')
        }
      }
      setApplicantsReady(true)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载个人信息失败')
    }
  })

  async function searchCompanies() {
    setBusy(true)
    try {
      setCompanySearched(true)
      setCompanies(await companyApi.search(companyKeyword.trim()))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setBusy(false)
    }
  }

  async function searchDispatchers() {
    setBusy(true)
    try {
      setDispatcherSearched(true)
      setDispatchers(await dispatcherApi.search(dispatcherKeyword.trim()))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveName() {
    const next = name.trim()
    if (!next || next === user.name) {
      return
    }
    setBusy(true)
    try {
      setUser(await authApi.updateName(next))
      message.success('姓名已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存姓名失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveContact() {
    const next = contact.trim()
    if (next === (user.contact ?? '')) {
      return
    }
    setBusy(true)
    try {
      const saved = await authApi.updateContact(next)
      setUser(saved)
      setContact(saved.contact ?? '')
      message.success('联系方式已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存联系方式失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveUsername() {
    const next = username.trim()
    if (next.length < 3 || next === user.username) {
      return
    }
    setBusy(true)
    try {
      const saved = await authApi.updateUsername(next)
      setUser(saved)
      setUsername(saved.username)
      message.success('用户名已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存用户名失败')
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    if (!currentPassword || nextPassword.length < 8) {
      return
    }
    setBusy(true)
    try {
      setUser(await authApi.updatePassword(currentPassword, nextPassword))
      setCurrentPassword('')
      setNextPassword('')
      message.success('密码已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存密码失败')
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(file: File) {
    setBusy(true)
    try {
      const next = await authApi.uploadAvatar(file)
      setUser(next)
      setAvatarKey((value) => value + 1)
      message.success('头像已更新')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传头像失败')
    } finally {
      setBusy(false)
    }
  }

  async function applyCompany(companyId: string) {
    setBusy(true)
    try {
      await companyApi.apply(companyId)
      message.success('已提交申请')
      await refresh()
      setCompanies([])
      setCompanySearched(false)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '申请失败')
    } finally {
      setBusy(false)
    }
  }

  async function applyDispatcher(dispatcherUserId: string) {
    setBusy(true)
    try {
      await dispatcherApi.apply(dispatcherUserId)
      message.success('已提交申请')
      await refresh()
      setDispatchers([])
      setDispatcherSearched(false)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '申请失败')
    } finally {
      setBusy(false)
    }
  }

  async function approveDriver(applicationId: string) {
    setBusy(true)
    try {
      setApplicants(await dispatcherApi.approve(applicationId))
      message.success('已批准')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批准失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <div>
          <h1>{user.name}</h1>
          <p>个人信息</p>
        </div>
        <div className="account-header-actions">
          <AccountMenu />
        </div>
      </header>

      <main className="account-main profile-main">
        <section className="account-section profile-block">
          <h2>资料</h2>
          <div className="profile-identity">
            <div className="profile-avatar">
              {user.hasAvatar ? (
                <img className="account-avatar" src={`/api/auth/avatar?v=${avatarKey}`} alt="头像" />
              ) : (
                <div className="account-avatar placeholder">{user.name.slice(0, 1)}</div>
              )}
              <FileField
                label="上传头像"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onPick={(file) => void uploadAvatar(file)}
              />
            </div>
            <div className="profile-fields">
              <div className="account-search">
                <label className="account-note-label" htmlFor="profile-name">
                  姓名
                </label>
                <input
                  id="profile-name"
                  value={name}
                  maxLength={100}
                  aria-label="姓名"
                  onChange={(event) => setName(event.target.value)}
                />
                <button
                  type="button"
                  className="account-chip"
                  disabled={busy || !name.trim() || name.trim() === user.name}
                  onClick={() => void saveName()}
                >
                  保存
                </button>
              </div>
              <div className="account-search">
                <label className="account-note-label" htmlFor="profile-contact">
                  联系方式
                </label>
                <input
                  id="profile-contact"
                  value={contact}
                  maxLength={200}
                  placeholder="手机号或微信号"
                  aria-label="联系方式"
                  onChange={(event) => setContact(event.target.value)}
                />
                <button
                  type="button"
                  className="account-chip"
                  disabled={busy || contact.trim() === (user.contact ?? '')}
                  onClick={() => void saveContact()}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
          <p className="account-hint">上传头像后会自动压缩，页面只加载小图。</p>
          <div className="profile-meta">
            {user.companies?.length ? (
              <p>
                所属公司 <span>{user.companies.map((company) => company.name).join('、')}</span>
              </p>
            ) : user.companyName ? (
              <p>
                所属公司 <span>{user.companyName}</span>
              </p>
            ) : null}
            {(user.pendingApplications ?? []).map((item) => (
              <p key={item.id}>已申请加入「{item.companyName}」，等待公司批准。</p>
            ))}
            {(user.pendingDriverApplications ?? []).map((item) => (
              <p key={item.id}>已申请成为「{item.dispatcherName}」的司导，等待调度员批准。</p>
            ))}
          </div>
        </section>

        <section className="account-section profile-block">
          <h2>登录信息</h2>
          <div className="profile-fields">
            <div className="account-search">
              <label className="account-note-label" htmlFor="profile-username">
                用户名
              </label>
              <input
                id="profile-username"
                value={username}
                maxLength={50}
                autoComplete="username"
                aria-label="用户名"
                onChange={(event) => setUsername(event.target.value)}
              />
              <button
                type="button"
                className="account-chip"
                disabled={busy || username.trim().length < 3 || username.trim() === user.username}
                onClick={() => void saveUsername()}
              >
                保存
              </button>
            </div>
            <div className="account-search">
              <label className="account-note-label" htmlFor="profile-current-password">
                当前密码
              </label>
              <input
                id="profile-current-password"
                type="text"
                value={currentPassword}
                autoComplete="off"
                aria-label="当前密码"
                spellCheck={false}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="account-search">
              <label className="account-note-label" htmlFor="profile-new-password">
                新密码
              </label>
              <input
                id="profile-new-password"
                type="text"
                value={nextPassword}
                autoComplete="off"
                aria-label="新密码"
                spellCheck={false}
                onChange={(event) => setNextPassword(event.target.value)}
              />
              <button
                type="button"
                className="account-chip"
                disabled={busy || !currentPassword || nextPassword.length < 8}
                onClick={() => void savePassword()}
              >
                保存
              </button>
            </div>
          </div>
        </section>

        {user.role === 'dispatcher' || user.role === 'company' ? (
          <section className="account-section profile-block">
            <h2>司导申请</h2>
            <p className="account-hint">
              {user.role === 'company'
                ? '搜索你的姓名并提交申请的人会出现在这里，批准后出现在你的调度台。'
                : '搜索你名字并提交申请的人会出现在这里，批准后加入你所在的公司。'}
            </p>
            {applicantsReady && applicants.length === 0 ? <p className="account-empty">暂无申请</p> : null}
            {applicants.map((item) => (
              <div className="account-row" key={item.id}>
                <p>
                  {item.name} <span>{contactLabel(item.contact)}</span>
                </p>
                <button
                  type="button"
                  className="account-chip primary"
                  disabled={busy}
                  onClick={() => void approveDriver(item.id)}
                >
                  批准
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {user.role !== 'company' ? (
          <>
            <section className="account-section profile-block">
              <h2>申请成为司导</h2>
              <p className="account-hint">搜索调度员或公司账户的姓名，提交申请后等待对方批准。</p>
              <div className="account-search">
                <input
                  value={dispatcherKeyword}
                  placeholder="姓名"
                  onChange={(event) => {
                    setDispatcherKeyword(event.target.value)
                    setDispatcherSearched(false)
                    setDispatchers([])
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void searchDispatchers()
                    }
                  }}
                />
                <button type="button" className="account-chip" disabled={busy} onClick={() => void searchDispatchers()}>
                  搜索
                </button>
              </div>
              {dispatchers.map((item) => (
                <div className="account-row" key={item.id}>
                  <p>{item.name}</p>
                  <button
                    type="button"
                    className="account-chip primary"
                    disabled={busy}
                    onClick={() => void applyDispatcher(item.id)}
                  >
                    申请
                  </button>
                </div>
              ))}
              {dispatcherSearched && dispatchers.length === 0 && !busy ? (
                <p className="account-empty">没有匹配的调度员</p>
              ) : null}
            </section>

            <section className="account-section profile-block">
              <h2>申请成为调度员</h2>
              <p className="account-hint">搜索公司名称，提交申请后等待公司批准。</p>
              <div className="account-search">
                <input
                  value={companyKeyword}
                  placeholder="公司名称"
                  onChange={(event) => {
                    setCompanyKeyword(event.target.value)
                    setCompanySearched(false)
                    setCompanies([])
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void searchCompanies()
                    }
                  }}
                />
                <button type="button" className="account-chip" disabled={busy} onClick={() => void searchCompanies()}>
                  搜索
                </button>
              </div>
              {companies.map((company) => (
                <div className="account-row" key={company.id}>
                  <p>{company.name}</p>
                  <button
                    type="button"
                    className="account-chip primary"
                    disabled={busy}
                    onClick={() => void applyCompany(company.id)}
                  >
                    申请
                  </button>
                </div>
              ))}
              {companySearched && companies.length === 0 && !busy ? <p className="account-empty">没有匹配的公司</p> : null}
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
