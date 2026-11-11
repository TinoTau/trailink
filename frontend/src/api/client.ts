async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(readProblem(text) || `${response.status} ${response.statusText}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function readProblem(text: string) {
  try {
    const parsed = JSON.parse(text) as { detail?: string; title?: string }
    return parsed.detail || parsed.title || text
  } catch {
    return text
  }
}

async function requestForm<T>(url: string, body: FormData, method = 'POST'): Promise<T> {
  const response = await fetch(url, { method, body, credentials: 'include' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(readProblem(text) || `${response.status} ${response.statusText}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return response.json() as Promise<T>
}

/** 下载得到的文件：内容、服务器给的文件名和响应头（例如导出时写入、跳过的条数）。 */
export interface DownloadedFile {
  blob: Blob
  fileName: string | null
  headers: Headers
}

function fileNameOf(disposition: string | null) {
  if (!disposition) {
    return null
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1])
    } catch {
      // 落到下面的普通文件名。
    }
  }
  return /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? null
}

async function requestFile(url: string, init?: RequestInit): Promise<DownloadedFile> {
  const response = await fetch(url, { ...init, credentials: 'include' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(readProblem(text) || `${response.status} ${response.statusText}`)
  }
  return {
    blob: await response.blob(),
    fileName: fileNameOf(response.headers.get('Content-Disposition')),
    headers: response.headers,
  }
}

/** 把下载到的文件存到用户的设备上（手机上会弹出保存 / 打开）。 */
export function saveDownloaded(file: DownloadedFile, fallbackName: string) {
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName || fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export const api = {
  getFile: (url: string) => requestFile(url),
  postFileForFile: (url: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return requestFile(url, { method: 'POST', body })
  },
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  postFile: <T>(url: string, file: File, fields?: Record<string, string>) => {
    const body = new FormData()
    for (const [key, value] of Object.entries(fields ?? {})) {
      body.append(key, value)
    }
    body.append('file', file)
    return requestForm<T>(url, body)
  },
  postForm: <T>(url: string, body: FormData) => requestForm<T>(url, body),
  putFile: <T>(url: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return requestForm<T>(url, body, 'PUT')
  },
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (url: string) => request<void>(url, { method: 'DELETE' }),
}
