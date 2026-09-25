import { supabase } from './supabase'
import type { AIExtraction } from './types'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

export async function analyzePoster(file: File): Promise<AIExtraction | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const image = await fileToDataUrl(file)
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image }),
  })

  const raw = await response.text()
  let payload: unknown = null

  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || 'AI extraction failed')
        : raw || 'AI extraction failed'
    throw new Error(message)
  }

  return payload as AIExtraction
}
