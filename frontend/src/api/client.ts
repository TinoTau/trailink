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

export const api = {
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
  putFile: <T>(url: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return requestForm<T>(url, body, 'PUT')
  },
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (url: string) => request<void>(url, { method: 'DELETE' }),
}
