import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export function keepDraft<T>(current: T, loaded: T | undefined, next: T) {
  if (loaded === undefined || Object.is(current, loaded) || Object.is(current, next)) {
    return next
  }
  return current
}

export function syncDraft<T>(
  slot: { current: T },
  set: (value: T) => void,
  loaded: T,
  next: T,
  switched: boolean,
) {
  const value = keepDraft(slot.current, switched ? undefined : loaded, next)
  if (!Object.is(value, slot.current)) {
    slot.current = value
    set(value)
  }
}

export function usePageLoad(load: () => void | Promise<void>, watch?: unknown) {
  const location = useLocation()
  const loadRef = useRef(load)
  const lastRun = useRef(0)

  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    lastRun.current = Date.now()
    void loadRef.current()
  }, [location.key, watch])

  useEffect(() => {
    function run() {
      const now = Date.now()
      if (now - lastRun.current < 400 || document.visibilityState !== 'visible') {
        return
      }
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return
      }
      lastRun.current = now
      void loadRef.current()
    }

    function onVisible() {
      if (document.visibilityState === 'visible') {
        run()
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', run)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', run)
    }
  }, [])
}
