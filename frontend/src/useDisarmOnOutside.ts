import { useEffect } from 'react'

/**
 * 二次确认（红框）进行中时，点页面上别的地方就取消。
 * `keep`：点在这些元素里不取消（通常就是确认按钮本身，或者确认时要点的那一格）。
 */
export function useDisarmOnOutside(active: boolean, keep: string, disarm: () => void) {
  useEffect(() => {
    if (!active) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Element && event.target.closest(keep)) {
        return
      }
      disarm()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [active, keep, disarm])
}
