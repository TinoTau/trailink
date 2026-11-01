import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { message } from 'antd'
import { libraryApi, ratingLabel } from '../../api/library'
import type { LibraryActivityDetail } from '../../types'
import './library.css'

/** 当日详情里对活动库活动的评分和评价：每人一条，可以改、可以删；同时显示共用备注、图片和所有人的评价。 */
export function ActivityReview({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<LibraryActivityDetail | null>(null)
  const [score, setScore] = useState(0)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  function apply(next: LibraryActivityDetail) {
    setDetail(next)
    setScore(next.myScore ?? 0)
    setComment(next.myComment ?? '')
  }

  useEffect(() => {
    let alive = true
    libraryApi
      .detail(activityId)
      .then((next) => alive && apply(next))
      .catch((error: unknown) => {
        message.error(error instanceof Error ? error.message : '这项活动已经不在活动库里')
        onClose()
      })
    return () => {
      alive = false
    }
  }, [activityId, onClose])

  async function save() {
    setSaving(true)
    try {
      apply(await libraryApi.rate(activityId, score, comment))
      message.success('评价已保存')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存评价失败')
    } finally {
      setSaving(false)
    }
  }

  async function removeMine() {
    setSaving(true)
    try {
      await libraryApi.unrate(activityId)
      apply(await libraryApi.detail(activityId))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除评价失败')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      className="library-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="library-sheet" role="dialog" aria-label="活动评价">
        <header className="library-sheet-bar">
          <h2>{detail ? detail.name : '加载中…'}</h2>
          <button type="button" className="library-chip" onClick={onClose}>
            关闭
          </button>
        </header>
        {detail ? (
          <div className="library-list">
            <p className="library-hint">
              {[detail.nameZh && detail.nameEn ? detail.nameEn : null, detail.destinations.map((item) => item.name).join('、'), ratingLabel(detail)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {detail.sharedNotes ? <p className="library-notes">{detail.sharedNotes}</p> : null}
            {detail.photos.length ? (
              <div className="library-photos">
                {detail.photos.map((photo) => (
                  <a key={photo.id} href={libraryApi.photoUrl(detail.id, photo.id)} target="_blank" rel="noreferrer">
                    <img src={libraryApi.photoUrl(detail.id, photo.id)} alt="" />
                  </a>
                ))}
              </div>
            ) : null}
            <h3 className="library-field">我的评分</h3>
            <div className="library-stars" role="radiogroup" aria-label="评分">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={score === value}
                  aria-label={`${value} 星`}
                  className={`library-star${value <= score ? ' on' : ''}`}
                  onClick={() => setScore(value)}
                >
                  ★
                </button>
              ))}
            </div>
            <label className="library-field">
              评价（选填）
              <textarea value={comment} maxLength={500} onChange={(event) => setComment(event.target.value)} />
            </label>
            <div className="library-sheet-actions">
              {detail.myScore ? (
                <button type="button" className="library-chip danger" disabled={saving} onClick={() => void removeMine()}>
                  删除我的评价
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="library-chip primary" disabled={!score || saving} onClick={() => void save()}>
                保存评价
              </button>
            </div>
            <h3 className="library-field">所有评价</h3>
            {detail.reviews.length === 0 ? <p className="library-empty">还没有评价</p> : null}
            <ul className="library-reviews">
              {detail.reviews.map((review, index) => (
                <li key={index}>
                  {review.mine ? '我' : review.userName}
                  <span>{'★'.repeat(review.score)}</span>
                  {review.comment ? <p>{review.comment}</p> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
