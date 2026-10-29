export const PLACE_PRESETS = [
  { mark: '基', name: '基督城' },
  { mark: '凯', name: '凯库拉' },
  { mark: '特', name: '特卡波' },
  { mark: '瓦', name: '瓦纳卡' },
  { mark: '皇', name: '皇后镇' },
  { mark: '蒂', name: '蒂阿瑙' },
  { mark: '但', name: '但尼丁' },
] as const

export function placeMark(value?: string | null) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }
  return [...text][0]
}

export function presetForLocation(value?: string | null) {
  const text = value?.trim()
  if (!text) {
    return undefined
  }
  return PLACE_PRESETS.find((item) => item.name === text || item.mark === text)
}
