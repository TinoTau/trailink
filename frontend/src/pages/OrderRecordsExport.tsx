import { message } from 'antd'
import { useRef, useState } from 'react'
import { companyApi } from '../api/auth'
import { saveDownloaded } from '../api/client'
import type { CompanyOrderScope } from '../types'

const MENU_WIDTH = 300

/**
 * 订单记录标题右边的「导出」：导出当前范围的全部订单记录。
 * - 「导出新表格」：默认样式（浅蓝表头、绿色年份行）。
 * - 「填进我的表格」：上传自己的 .xlsx（空表或已有内容都可以），服务器认出每一列（配了 AI 时用 AI）。
 *   表里已有的单按「系统订单号」对上（没有这一列时自动加上），就地更新司导、车辆和订单信息；
 *   新单接在已有内容后面；下载填好的表格。
 */
export function OrderRecordsExport({
  companyId,
  scope,
  scopeLabel,
}: {
  companyId: string
  scope: CompanyOrderScope
  scopeLabel: string
}) {
  /** 菜单开着时：「导出」按钮的位置，菜单挂在它下面、右边对齐。 */
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [busy, setBusy] = useState<'export' | 'fill' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function exportDefault() {
    setAnchor(null)
    setBusy('export')
    try {
      const file = await companyApi.exportOrders(companyId, scope)
      saveDownloaded(file, `订单记录-${scopeLabel}-${fileStamp()}.xlsx`)
      message.success(`已导出 ${file.headers.get('X-Export-Added') ?? ''} 条订单记录`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败')
    } finally {
      setBusy(null)
    }
  }

  async function fill(picked: File) {
    setBusy('fill')
    try {
      const file = await companyApi.fillOrders(companyId, scope, picked)
      saveDownloaded(file, `${picked.name.replace(/\.xls[xm]?$/i, '')}-${fileStamp()}.xlsx`)
      const added = Number(file.headers.get('X-Export-Added') ?? 0)
      const updated = Number(file.headers.get('X-Export-Updated') ?? 0)
      const skipped = Number(file.headers.get('X-Export-Skipped') ?? 0)
      const how = file.headers.get('X-Export-Mode') === 'ai' ? 'AI 认出了表格的每一列，' : ''
      message.success({ content: `${how}${fillSummary(added, updated, skipped)}`, duration: 6 })
    } catch (error) {
      message.error({ content: error instanceof Error ? error.message : '填写表格失败', duration: 8 })
    } finally {
      setBusy(null)
    }
  }

  const open = anchor !== null
  return (
    <>
      <button
        type="button"
        className="order-records-export"
        disabled={busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor((current) => (current ? null : rect))
        }}
      >
        {busy === 'export' ? '正在导出…' : busy === 'fill' ? '正在填写…' : '导出'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(event) => {
          const picked = event.target.files?.[0]
          // 清空，选同一个文件也能再触发。
          event.target.value = ''
          if (picked) {
            void fill(picked)
          }
        }}
      />
      {anchor ? (
        <div
          className="order-record-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setAnchor(null)
            }
          }}
        >
          <div
            className="order-export-menu"
            role="menu"
            style={{
              top: anchor.bottom + 6,
              // 右边和「导出」对齐；屏幕窄时整个菜单留在屏幕里。
              left: Math.max(12, Math.min(anchor.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 12)),
              width: MENU_WIDTH,
            }}
          >
            <button type="button" role="menuitem" className="order-export-item" onClick={() => void exportDefault()}>
              <strong>导出新表格</strong>
              <span>「{scopeLabel}」的全部订单，默认样式</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="order-export-item"
              onClick={() => {
                setAnchor(null)
                fileRef.current?.click()
              }}
            >
              <strong>填进我的表格…</strong>
              <span>
                上传 .xlsx（空表或已有内容都行）：已有的单按「系统订单号」更新司导、车辆和订单信息，新单接在后面；下载的文件名是原名加日期时间
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** 填表结果的提示，例如「新增 2 条，更新 3 条，1 条没有变化」。 */
function fillSummary(added: number, updated: number, skipped: number) {
  if (added === 0 && updated === 0) {
    return `表格里的 ${skipped} 张单都是最新的，没有改动`
  }

  const parts = [
    added > 0 ? `新增 ${added} 条` : '',
    updated > 0 ? `更新 ${updated} 条` : '',
    skipped > 0 ? `${skipped} 条没有变化` : '',
  ].filter(Boolean)
  return parts.join('，')
}

/** 服务器没给文件名时用：新西兰时间的年月日-时分秒，例如 20261111-000912。 */
function fileStamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`
}
