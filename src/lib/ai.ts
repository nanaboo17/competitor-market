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
  const apiUrl = import.meta.env.VITE_AI_API_URL as string | undefined
  if (!apiUrl) return null

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const image = await fileToDataUrl(file)
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ image }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'AI extraction failed')
  }

  return (await response.json()) as AIExtraction
}
