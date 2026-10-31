import { useEffect, useState } from 'react'
import { api } from './client'
import type { Place } from '../types'

// 常用住宿地点由后端定义（天气也按这份清单查询），页面里只读一次。
let cached: Promise<Place[]> | null = null

export function loadPlaces() {
  cached ??= api.get<Place[]>('/api/places').catch((error: unknown) => {
    cached = null
    throw error
  })
  return cached
}

export function usePlaces() {
  const [places, setPlaces] = useState<Place[]>([])
  useEffect(() => {
    let alive = true
    loadPlaces().then(
      (list) => alive && setPlaces(list),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return places
}
