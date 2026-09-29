import type { AIExtraction } from './types'

type TesseractWorker = {
  recognize: (
    image: Blob,
    options?: Record<string, unknown>,
  ) => Promise<{ data: { text: string; confidence?: number } }>
}

type TesseractApi = {
  createWorker: (
    languages?: string,
    oem?: number,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void
    },
  ) => Promise<TesseractWorker>
}

declare global {
  interface Window {
    Tesseract?: TesseractApi
  }
}

const TESSERACT_CDN =
  'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js'

let scriptPromise: Promise<TesseractApi> | null = null
let workerPromise: Promise<TesseractWorker> | null = null
let progressListener: ((progress: number) => void) | null = null

function loadTesseract(): Promise<TesseractApi> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-tesseract-cdn="true"]',
    )

    const finish = () => {
      if (window.Tesseract) resolve(window.Tesseract)
      else reject(new Error('Tesseract loaded but did not initialize.'))
    }

    if (existing) {
      existing.addEventListener('load', finish, { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Tesseract OCR.')),
        { once: true },
      )
      return
    }

    const script = document.createElement('script')
    script.src = TESSERACT_CDN
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.tesseractCdn = 'true'
    script.addEventListener('load', finish, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load Tesseract OCR.')),
      { once: true },
    )

    document.head.appendChild(script)
  })

  return scriptPromise
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = loadTesseract().then((tesseract) =>
      tesseract.createWorker('eng', 1, {
        logger(message) {
          if (
            message.status === 'recognizing text' &&
            typeof message.progress === 'number'
          ) {
            progressListener?.(message.progress)
          }
        },
      }),
    )
  }

  return workerPromise
}

async function resizeForOcr(file: File, maxDimension = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(
    1,
    maxDimension / Math.max(bitmap.width, bitmap.height),
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      'image/jpeg',
      0.9,
    )
  })
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function cleanPhone(value: string) {
  return value.replace(/[^0-9+]/g, '')
}

function parseNumber(value: string) {
  const normalized = value.replace(/[^0-9]/g, '')
  return normalized ? Number(normalized) : null
}

export function countUsefulFields(result: AIExtraction) {
  return [
    result.competitor_name,
    result.package_name,
    result.speed_mbps,
    result.price_amount,
    result.promo_text,
    result.valid_until,
    result.installation_fee,
    result.contract_months,
    result.contact_number,
  ].filter(
    (value) => value !== null && value !== undefined && value !== '',
  ).length
}

export function parsePosterText(rawText: string): AIExtraction {
  const text = normalizeText(rawText)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const competitorMatch = text.match(
    /\b(Biznet(?:\s+Home)?|IndiHome|MyRepublic|First\s+Media|CBN|ICONNET)\b/i,
  )

  const speedMatches = [
    ...text.matchAll(/\b(\d{2,4})\s*(?:Mbps|Mb\/s|MBPS)\b/gi),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)

  const rupiahMatches = [
    ...text.matchAll(
      /(?:Rp\.?\s*)?([0-9]{2,3}(?:[.,][0-9]{3})+)(?:\s*\/\s*bulan)?/gi,
    ),
  ]
    .map((match) => parseNumber(match[1]))
    .filter((value): value is number => value !== null && value >= 10000)

  const explicitRpMatches = [
    ...text.matchAll(/Rp\.?\s*([0-9][0-9.,]*)/gi),
  ]
    .map((match) => parseNumber(match[1]))
    .filter((value): value is number => value !== null && value >= 10000)

  const prices = [...rupiahMatches, ...explicitRpMatches]

  const phoneMatch = text.match(
    /(?:\+62|0)\d{2,3}(?:[-.\s]?\d{3,4}){2,3}/,
  )

  const promoLines = lines.filter((line) =>
    /promo|gratis|free|bundling|bundle|hemat|diskon|discount|langganan|bulan/i.test(
      line,
    ),
  )

  const packageLine =
    lines.find((line) => /biznet\s+home\s*\w*/i.test(line)) ??
    lines.find((line) =>
      /paket|package|internet|home\s+internet/i.test(line),
    ) ??
    null

  const validUntilMatch = text.match(
    /(?:berlaku\s+(?:sampai|hingga)|valid\s+until)\s*[:\-]?\s*([^\n]+)/i,
  )

  const installationMatch = text.match(
    /(?:biaya\s+instalasi|installation\s+fee)\s*[:\-]?\s*(?:Rp\.?\s*)?([0-9.,]+)/i,
  )

  const contractMatch = text.match(
    /(?:kontrak|contract)\s*[:\-]?\s*(\d{1,2})\s*bulan/i,
  )

  return {
    competitor_name: competitorMatch?.[1] ?? null,
    package_name: packageLine,
    speed_mbps: speedMatches.length ? Math.min(...speedMatches) : null,
    price_amount: prices.length ? Math.min(...prices) : null,
    promo_text: promoLines.length
      ? [...new Set(promoLines)].slice(0, 8).join(' | ')
      : null,
    valid_until: validUntilMatch?.[1]?.trim() ?? null,
    installation_fee: installationMatch
      ? parseNumber(installationMatch[1])
      : null,
    contract_months: contractMatch ? Number(contractMatch[1]) : null,
    contact_number: phoneMatch ? cleanPhone(phoneMatch[0]) : null,
    raw_ocr_text: text || null,
    confidence: {},
  }
}

export async function runTesseract(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<AIExtraction> {
  progressListener = onProgress ?? null

  try {
    const image = await resizeForOcr(file)
    const worker = await getWorker()
    const { data } = await worker.recognize(image, { rotateAuto: true })

    const result = parsePosterText(data.text)

    result.confidence = {
      ocr: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
    }

    return result
  } finally {
    progressListener = null
  }
}
