const photoMaxEdge = 1600
const photoJpegQuality = 0.8
const photoMaxBytes = 8_000_000

type Request = { file: File; fallback: string }
type Response = { buffer?: ArrayBuffer; name?: string; error?: string }

const scope = self as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<Request>) => {
  const { file, fallback } = event.data
  try {
    if (file.type && !file.type.startsWith('image/')) {
      throw new Error('请选择 jpg、png 或 webp')
    }
    const bitmap = await createImageBitmap(file)
    try {
      const longest = Math.max(bitmap.width, bitmap.height)
      const scale = longest > photoMaxEdge ? photoMaxEdge / longest : 1
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = new OffscreenCanvas(width, height)
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('无法压缩照片')
      }
      context.drawImage(bitmap, 0, 0, width, height)
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: photoJpegQuality })
      if (blob.size > photoMaxBytes) {
        throw new Error('压缩后仍超过 8MB，请换一张照片')
      }
      const base = file.name.replace(/\.[^.]+$/, '') || fallback
      const buffer = await blob.arrayBuffer()
      const response: Response = { buffer, name: `${base}.jpg` }
      scope.postMessage(response, { transfer: [buffer] })
    } finally {
      bitmap.close()
    }
  } catch (error) {
    const response: Response = { error: error instanceof Error ? error.message : '无法压缩照片' }
    scope.postMessage(response)
  }
}
