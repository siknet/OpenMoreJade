export interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

export async function fetchWithTimeout(url: string, options: RequestOptions = {}): Promise<Response> {
  const { timeoutMs = 15000, ...fetchOpts } = options
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...fetchOpts,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 AI-Resonance/2.0',
        Accept: 'application/json, text/html, application/xhtml+xml, application/xml;q=0.9, */*;q=0.8',
        ...(fetchOpts.headers || {}),
      },
    })
    return res
  } finally {
    clearTimeout(id)
  }
}

export async function fetchJson<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetchWithTimeout(url, options)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`)
  }
  return res.json() as Promise<T>
}

export async function fetchText(url: string, options: RequestOptions = {}): Promise<string> {
  const res = await fetchWithTimeout(url, options)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} fetching ${url}`)
  }
  return res.text()
}
