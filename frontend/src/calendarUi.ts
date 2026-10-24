export const PRESET_COLORS = ['#C6F0E0', '#D6E4FF', '#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#8c8c8c', '#262626']

export function contrastText(background: string) {
  const hex = background.replace('#', '')
  const value = hex.length === 3 ? hex.split('').map((item) => item + item).join('') : hex
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255 < 0.55 ? '#fff' : '#1f1f1f'
}
