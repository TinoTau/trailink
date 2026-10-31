const photoMaxEdge = 1600
const photoJpegQuality = 0.8
const photoMaxBytes = 8_000_000

export function compressPhoto(file: File, fallback = 'photo') {
  return compressInWorker(file, fallback).catch((error: unknown) => {
    if (!(error instanceof Error) || error.message !== '无法压缩照片') {
      throw error
    }
    return compressOnMain(file, fallback)
  })
}

function compressInWorker(file: File, fallback: string) {
  return new Promise<File>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./photoImage.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('无法压缩照片'))
      return
    }
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('压缩照片超时，请换一张小一些的照片'))
    }, 20000)
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; name?: string; error?: string }>) => {
      window.clearTimeout(timer)
      worker.terminate()
      if (event.data.error || !event.data.buffer || !event.data.name) {
        reject(new Error(event.data.error || '无法压缩照片'))
        return
      }
      resolve(new File([event.data.buffer], event.data.name, { type: 'image/jpeg', lastModified: Date.now() }))
    }
    worker.onerror = () => {
      window.clearTimeout(timer)
      worker.terminate()
      reject(new Error('无法压缩照片'))
    }
    worker.postMessage({ file, fallback })
  })
}

async function compressOnMain(file: File, fallback: string) {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('请选择 jpg、png 或 webp')
  }
  const bitmap = await createImageBitmap(file)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    const scale = longest > photoMaxEdge ? photoMaxEdge / longest : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('无法压缩照片')
    }
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', photoJpegQuality))
    if (!blob) {
      throw new Error('无法压缩照片')
    }
    if (blob.size > photoMaxBytes) {
      throw new Error('压缩后仍超过 8MB，请换一张照片')
    }
    const base = file.name.replace(/\.[^.]+$/, '') || fallback
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } finally {
    bitmap.close()
  }
}
