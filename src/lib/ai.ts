import { supabase } from './supabase'
import type { AIExtraction } from './types'

const FALLBACK_AI_URL = 'https://competitor-market.nanastudyonly.workers.dev/api/analyze'
const AI_TIMEOUT_MS = 25000

async function optimizeForAi(file: File, maxDimension = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return fileToDataUrl(file)
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          fileToDataUrl(file).then(resolve, reject)
          return
        }

        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('Failed to prepare AI image'))
        reader.readAsDataURL(blob)
      },
      'image/jpeg',
      0.82,
    )
  })
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(file)
  })
}

async function callAnalyze(
  url: string,
  token: string,
  image: string,
  ocrText?: string | null,
) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS)

  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ image, ocr_text: ocrText || null }),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

function parseResponse(raw: string) {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function analyzePoster(
  file: File,
  ocrText?: string | null,
): Promise<AIExtraction | null> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Your session has expired. Please sign in again.')

  const image = await optimizeForAi(file)

  let response: Response

  try {
    response = await callAnalyze('/api/analyze', token, image, ocrText)
  } catch (sameOriginError) {
    try {
      response = await callAnalyze(FALLBACK_AI_URL, token, image, ocrText)
    } catch (fallbackError) {
      const timedOut =
        (sameOriginError instanceof DOMException && sameOriginError.name === 'AbortError') ||
        (fallbackError instanceof DOMException && fallbackError.name === 'AbortError')

      if (timedOut) {
        throw new Error('AI analysis timed out. OCR results are still available for review.')
      }

      throw new Error('AI API is unreachable right now. OCR results are still available for review.')
    }
  }

  const raw = await response.text()
  const payload = parseResponse(raw)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error || 'AI extraction failed')
        : raw || `AI extraction failed with HTTP ${response.status}`

    throw new Error(message)
  }

  return payload as AIExtraction
}
