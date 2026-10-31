import { useEffect, useState } from 'react'
import { api } from './client'
import type { WeatherSource } from '../types'

// 天气数据来源由后端配置决定；没有配置时接口返回 204，页面不注明来源。只读一次。
let cached: Promise<WeatherSource | null> | null = null

function loadWeatherSource() {
  cached ??= api.get<WeatherSource | undefined>('/api/weather/source').then(
    (source) => source ?? null,
    (error: unknown) => {
      cached = null
      throw error
    },
  )
  return cached
}

export function useWeatherSource() {
  const [source, setSource] = useState<WeatherSource | null>(null)
  useEffect(() => {
    let alive = true
    loadWeatherSource().then(
      (value) => alive && setSource(value),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return source
}
