import { message } from 'antd'
import { useEffect, useState } from 'react'
import { authApi, companyApi, dispatcherApi } from '../api/auth'
import { useAuth } from '../auth/AuthContext'
import { AccountMenu } from './AccountMenu'
import { FileField } from './FileField'
import type { CompanySearch, DispatcherSearch, DriverApplicant } from '../types'
import './account.css'

const roleLabel = {
  company: '公司',
  dispatcher: '调度员',
  driver: '司导',
} as const

export function ProfilePage() {
  const { user, refresh, setUser } = useAuth()
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

  useEffect(() => {
    if (user?.role !== 'dispatcher') {
      setApplicants([])
      setApplicantsReady(false)
      return
    }

    let active = true
    dispatcherApi
      .incoming()
      .then((items) => {
        if (active) {
          setApplicants(items)
          setApplicantsReady(true)
        }
      })
      .catch((error) => {
        if (active) {
          setApplicantsReady(true)
          message.error(error instanceof Error ? error.message : '加载司导申请失败')
        }
      })
    return () => {
      active = false
    }
  }, [user?.role])

  if (!user) {
    return null
  }

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

      <main className="account-main">
        <section className="account-section">
          <div className="account-avatar-wrap">
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
            <p className="account-hint">上传后会自动压缩，页面只加载小图。</p>
          </div>
          <div className="account-facts">
            <p>
              用户名 <span>{user.username}</span>
            </p>
            <p>
              角色 <span>{roleLabel[user.role]}</span>
            </p>
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

        {user.role === 'dispatcher' ? (
          <section className="account-section">
            <h2>司导申请</h2>
            <p className="account-hint">搜索你名字并提交申请的人会出现在这里，批准后加入你所在的公司。</p>
            {applicantsReady && applicants.length === 0 ? <p className="account-empty">暂无申请</p> : null}
            {applicants.map((item) => (
              <div className="account-row" key={item.id}>
                <p>
                  {item.name} <span>{item.username}</span>
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
            <section className="account-section">
              <h2>申请成为司导</h2>
              <p className="account-hint">搜索调度员姓名，提交申请后等待对方批准。</p>
              <div className="account-search">
                <input
                  value={dispatcherKeyword}
                  placeholder="调度员姓名"
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

            <section className="account-section">
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
