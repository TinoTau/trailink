import { useEffect } from 'react'

let locks = 0
let saved: { html: string; body: string } | null = null

/**
 * 弹框打开时锁住后面的页面，不让它跟着滑（手指或滚轮在弹框里滑到头时也不会带动页面）。
 * 几个弹框叠在一起时，最后一个关掉才解锁。
 */
export function useLockPageScroll(active: boolean) {
  useEffect(() => {
    if (!active) {
      return
    }
    if (locks === 0) {
      saved = { html: document.documentElement.style.overflow, body: document.body.style.overflow }
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks === 0 && saved) {
        document.documentElement.style.overflow = saved.html
        document.body.style.overflow = saved.body
        saved = null
      }
    }
  }, [active])
}
