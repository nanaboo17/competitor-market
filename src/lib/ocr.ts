import type { AIExtraction } from './types'

type TesseractData = {
  text: string
  confidence?: number
}

type TesseractWorker = {
  recognize: (
    image: Blob,
    options?: Record<string, unknown>,
  ) => Promise<{ data: TesseractData }>
}

type TesseractApi = {
  createWorker: (
    languages?: string,
    oem?: number,
    options?: {
      logger?: (message: { status?: string; progress?: number }) => void
      workerPath?: string
      corePath?: string
      langPath?: string
    },
  ) => Promise<TesseractWorker>
}

declare global {
  interface Window {
    Tesseract?: TesseractApi
  }
}

const TESSERACT_VERSION = '7.0.0'
const TESSERACT_SCRIPTS = [
  `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
  `https://unpkg.com/tesseract.js@${TESSERACT_VERSION}/dist/tesseract.min.js`,
]
const WORKER_PATH =
  `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`
const CORE_PATH =
  `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`
const FAST_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_fast'

let scriptPromise: Promise<TesseractApi> | null = null
let workerPromise: Promise<TesseractWorker> | null = null
let progressListener: ((progress: number, stage?: string) => void) | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    )

    if (existing) {
      if (window.Tesseract) return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('CDN load failed')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.tesseractCdn = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('CDN load failed')), {
      once: true,
    })
    document.head.appendChild(script)
  })
}

function loadTesseract(): Promise<TesseractApi> {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (scriptPromise) return scriptPromise

  scriptPromise = (async () => {
    let lastError: unknown = null

    for (const src of TESSERACT_SCRIPTS) {
      try {
        await loadScript(src)
        if (window.Tesseract) return window.Tesseract
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to load Tesseract OCR.')
  })()

  return scriptPromise
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = loadTesseract().then((tesseract) =>
      tesseract.createWorker('eng', 1, {
        workerPath: WORKER_PATH,
        corePath: CORE_PATH,
        langPath: FAST_LANG_PATH,
        logger(message) {
          if (
            message.status === 'recognizing text' &&
            typeof message.progress === 'number'
          ) {
            progressListener?.(message.progress, 'recognizing')
          }
        },
      }),
    )
  }

  return workerPromise
}

type PreprocessMode = 'balanced' | 'high-contrast'

async function preprocessImage(
  file: File,
  mode: PreprocessMode,
  maxDimension = 1600,
): Promise<Blob> {
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

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    return file
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data
  const contrast = mode === 'high-contrast' ? 1.65 : 1.25
  const threshold = mode === 'high-contrast' ? 175 : null

  for (let i = 0; i < pixels.length; i += 4) {
    const luminance =
      pixels[i] * 0.299 +
      pixels[i + 1] * 0.587 +
      pixels[i + 2] * 0.114

    let value = 128 + (luminance - 128) * contrast

    if (threshold !== null) {
      value = value >= threshold ? 255 : 0
    }

    value = Math.max(0, Math.min(255, value))
    pixels[i] = value
    pixels[i + 1] = value
    pixels[i + 2] = value
  }

  context.putImageData(imageData, 0, 0)

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      'image/jpeg',
      mode === 'high-contrast' ? 0.92 : 0.9,
    )
  })
}

function normalizeText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[|]{2,}/g, '|')
    .trim()
}

function cleanPhone(value: string) {
  const digits = value.replace(/[^0-9+]/g, '')
  if (digits.startsWith('+62')) return '0' + digits.slice(3)
  if (digits.startsWith('62')) return '0' + digits.slice(2)
  return digits
}

function parseNumber(value: string) {
  const normalized = value.replace(/[^0-9]/g, '')
  return normalized ? Number(normalized) : null
}

function normalizeCompetitor(value: string | null) {
  if (!value) return null
  const normalized = value.toLowerCase()

  if (normalized.includes('biznet')) return 'Biznet'
  if (normalized.includes('indihome')) return 'IndiHome'
  if (normalized.includes('myrepublic')) return 'MyRepublic'
  if (normalized.includes('first media')) return 'First Media'
  if (/\bcbn\b/i.test(value)) return 'CBN'
  if (/\biconnet\b/i.test(value)) return 'ICONNET'

  return value.trim()
}

function normalizeDate(value: string | null) {
  if (!value) return null

  const direct = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (direct) {
    return `${direct[1]}-${direct[2].padStart(2, '0')}-${direct[3].padStart(2, '0')}`
  }

  const dmy = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  const months: Record<string, number> = {
    januari: 1, january: 1, jan: 1,
    februari: 2, february: 2, feb: 2,
    maret: 3, march: 3, mar: 3,
    april: 4, apr: 4,
    mei: 5, may: 5,
    juni: 6, june: 6, jun: 6,
    juli: 7, july: 7, jul: 7,
    agustus: 8, august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    oktober: 10, october: 10, oct: 10,
    november: 11, nov: 11,
    desember: 12, december: 12, dec: 12,
  }

  const named = value
    .toLowerCase()
    .match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/)

  if (named && months[named[2]]) {
    return `${named[3]}-${String(months[named[2]]).padStart(2, '0')}-${named[1].padStart(2, '0')}`
  }

  return null
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

export function shouldUseAiFallback(result: AIExtraction) {
  const useful = countUsefulFields(result)
  const confidence = result.confidence?.ocr ?? 0

  const essentialCount = [
    result.competitor_name,
    result.speed_mbps,
    result.price_amount,
  ].filter((value) => value !== null && value !== undefined && value !== '').length

  return useful < 4 || essentialCount < 2 || confidence < 0.58
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
    ...text.matchAll(/\b(\d{2,4})\s*(?:Mbps|Mb\/s|MBPS|Mpbs|Mbos)\b/gi),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 10 && value <= 10000)

  const explicitRpMatches = [
    ...text.matchAll(/Rp\.?\s*([0-9][0-9.,\s]*)/gi),
  ]
    .map((match) => parseNumber(match[1]))
    .filter(
      (value): value is number =>
        value !== null && value >= 10000 && value <= 100000000,
    )

  const formattedPriceMatches = [
    ...text.matchAll(/\b([0-9]{2,3}(?:[.,][0-9]{3})+)\b/g),
  ]
    .map((match) => parseNumber(match[1]))
    .filter(
      (value): value is number =>
        value !== null && value >= 10000 && value <= 100000000,
    )

  const prices = [...explicitRpMatches, ...formattedPriceMatches]

  const phoneMatch = text.match(
    /(?:\+?62|0)\s*8\d{1,2}(?:[-.\s]?\d{3,4}){2,3}/,
  )

  const promoLines = lines.filter((line) =>
    /promo|gratis|free|bundling|bundle|hemat|diskon|discount|langganan|bonus|bulan/i.test(
      line,
    ),
  )

  const packageCodeMatch = text.match(
    /\b(Biznet\s+Home\s+[0-9]+D|Paket\s+[A-Za-z0-9][A-Za-z0-9 ._/-]{2,45})\b/i,
  )

  const packageLine =
    packageCodeMatch?.[1] ??
    lines.find((line) =>
      /paket|package|internet|home\s+internet/i.test(line),
    ) ??
    null

  const validUntilMatch = text.match(
    /(?:berlaku\s+(?:sampai|hingga)|valid\s+until|periode\s+promo)\s*[:\-]?\s*([^\n]+)/i,
  )

  const installationMatch = text.match(
    /(?:biaya\s+(?:pasang|instalasi)|installation\s+fee)\s*[:\-]?\s*(?:Rp\.?\s*)?([0-9.,\s]+)/i,
  )

  const contractMatch = text.match(
    /(?:kontrak|contract|minimal\s+berlangganan)\s*[:\-]?\s*(\d{1,2})\s*bulan/i,
  )

  const competitor = normalizeCompetitor(competitorMatch?.[1] ?? null)

  return {
    competitor_name: competitor,
    package_name: packageLine?.trim() ?? null,
    speed_mbps: speedMatches.length ? Math.min(...speedMatches) : null,
    price_amount: prices.length ? Math.min(...prices) : null,
    promo_text: promoLines.length
      ? [...new Set(promoLines)].slice(0, 10).join(' | ')
      : null,
    valid_until: normalizeDate(validUntilMatch?.[1]?.trim() ?? null),
    installation_fee: installationMatch
      ? parseNumber(installationMatch[1])
      : null,
    contract_months: contractMatch ? Number(contractMatch[1]) : null,
    contact_number: phoneMatch ? cleanPhone(phoneMatch[0]) : null,
    raw_ocr_text: text || null,
    confidence: {},
  }
}

function mergeOcrResults(
  primary: AIExtraction,
  secondary: AIExtraction,
): AIExtraction {
  const choose = <T,>(a: T | null | undefined, b: T | null | undefined) =>
    a !== null && a !== undefined && a !== '' ? a : b

  const combinedText = [primary.raw_ocr_text, secondary.raw_ocr_text]
    .filter(Boolean)
    .join('\n\n--- OCR RETRY ---\n\n')

  const reparsed = parsePosterText(combinedText)

  return {
    competitor_name: choose(reparsed.competitor_name, choose(primary.competitor_name, secondary.competitor_name)),
    package_name: choose(reparsed.package_name, choose(primary.package_name, secondary.package_name)),
    speed_mbps: choose(reparsed.speed_mbps, choose(primary.speed_mbps, secondary.speed_mbps)),
    price_amount: choose(reparsed.price_amount, choose(primary.price_amount, secondary.price_amount)),
    promo_text: choose(reparsed.promo_text, choose(primary.promo_text, secondary.promo_text)),
    valid_until: choose(reparsed.valid_until, choose(primary.valid_until, secondary.valid_until)),
    installation_fee: choose(reparsed.installation_fee, choose(primary.installation_fee, secondary.installation_fee)),
    contract_months: choose(reparsed.contract_months, choose(primary.contract_months, secondary.contract_months)),
    contact_number: choose(reparsed.contact_number, choose(primary.contact_number, secondary.contact_number)),
    raw_ocr_text: combinedText || null,
    confidence: {
      ocr: Math.max(
        primary.confidence?.ocr ?? 0,
        secondary.confidence?.ocr ?? 0,
      ),
    },
  }
}

async function recognize(
  worker: TesseractWorker,
  image: Blob,
): Promise<AIExtraction> {
  const { data } = await worker.recognize(image, { rotateAuto: true })
  const result = parsePosterText(data.text)

  result.confidence = {
    ocr: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
  }

  return result
}

export async function runTesseract(
  file: File,
  onProgress?: (progress: number, stage?: string) => void,
): Promise<AIExtraction> {
  progressListener = onProgress ?? null

  try {
    progressListener?.(0.02, 'preprocessing')
    const balanced = await preprocessImage(file, 'balanced')
    const worker = await getWorker()

    progressListener?.(0.08, 'recognizing')
    const first = await recognize(worker, balanced)

    if (!shouldUseAiFallback(first)) {
      return first
    }

    progressListener?.(0.05, 'retrying')
    const highContrast = await preprocessImage(file, 'high-contrast')
    const second = await recognize(worker, highContrast)

    return mergeOcrResults(first, second)
  } finally {
    progressListener = null
  }
}
