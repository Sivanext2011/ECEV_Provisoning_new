import { useState, useCallback } from 'react'

export const API = '/api/v1'

interface UseApiOptions {
  method?: string
  headers?: Record<string, string>
}

interface UseApiReturn<T> {
  data: T | null
  error: string
  loading: boolean
  execute: (url: string, body?: any, options?: UseApiOptions) => Promise<T | null>
  reset: () => void
}

export function useApi<T = any>(): UseApiReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const reset = useCallback(() => {
    setData(null)
    setError('')
  }, [])

  const execute = useCallback(async (url: string, body?: any, options?: UseApiOptions): Promise<T | null> => {
    setLoading(true)
    setError('')
    setData(null)
    try {
      const opts: RequestInit = {
        method: options?.method || (body ? 'POST' : 'GET'),
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
      }
      if (body) {
        opts.body = typeof body === 'string' ? body : JSON.stringify(body)
      }
      const r = await fetch(url, opts)
      const text = await r.text()
      let result: any
      try { result = JSON.parse(text) } catch { result = { raw: text } }
      if (!r.ok) {
        const msg = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail || result)
        throw new Error(msg)
      }
      setData(result)
      setLoading(false)
      return result
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
      return null
    }
  }, [])

  return { data, error, loading, execute, reset }
}
