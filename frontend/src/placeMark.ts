import type { Place } from './types'

/** 日历浮雕字：住宿位置的第一个字。 */
export function placeMark(value?: string | null) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }
  return [...text][0]
}

/** 住宿位置对应的常用地点：写的是全名或浮雕字都算（与后端 Places.Find 一致）。 */
export function presetForLocation(places: Place[], value?: string | null) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }
  return places.find((item) => item.name === text || item.mark === text)
}
