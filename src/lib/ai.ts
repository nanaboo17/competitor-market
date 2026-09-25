import { supabase } from './supabase'
import type { AIExtraction } from './types'

const FALLBACK_AI_URL = 'https://competitor-market.nanastudyonly.workers.dev/api/analyze'

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

async function callAnalyze(url: string, token: string, image: string) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image }),
  })
}

export async function analyzePoster(file: File): Promise<AIExtraction | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const image = await fileToDataUrl(file)

  let response: Response
  try {
    response = await callAnalyze('/api/analyze', token, image)
  } catch (sameOriginError) {
    try {
      response = await callAnalyze(FALLBACK_AI_URL, token, image)
    } catch {
      throw new Error(
        `AI API is unreachable from this browser. Tried ${window.location.origin}/api/analyze and ${FALLBACK_AI_URL}.`,
      )
    }
  }

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
        : raw || `AI extraction failed with HTTP ${response.status}`
    throw new Error(message)
  }

  return payload as AIExtraction
}
