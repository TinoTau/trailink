// 照片在后台线程里压成 jpg（最长边 1600）再上传，压缩逻辑只在 photoImage.worker.ts 里。
// 不提供主线程后备：浏览器不支持后台压缩时直接报错。

const timeoutMs = 20000

export function compressPhoto(file: File, fallbackName = 'photo') {
  return new Promise<File>((resolve, reject) => {
    const worker = new Worker(new URL('./photoImage.worker.ts', import.meta.url), { type: 'module' })
    const timer = window.setTimeout(() => {
      worker.terminate()
      reject(new Error('压缩照片超时，请换一张小一些的照片'))
    }, timeoutMs)
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; name?: string; error?: string }>) => {
      window.clearTimeout(timer)
      worker.terminate()
      const { buffer, name, error } = event.data
      if (error || !buffer || !name) {
        reject(new Error(error || '无法压缩照片'))
        return
      }
      resolve(new File([buffer], name, { type: 'image/jpeg', lastModified: Date.now() }))
    }
    worker.onerror = () => {
      window.clearTimeout(timer)
      worker.terminate()
      reject(new Error('无法压缩照片'))
    }
    worker.postMessage({ file, fallbackName })
  })
}
