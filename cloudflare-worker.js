const SUPABASE_URL = 'https://ynrwjaxkzlzbcuwaamix.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_AtMK3rTp1kVkhULgABDYqQ_-BkPLVT1'

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    competitor_name: { type: ['string', 'null'] },
    package_name: { type: ['string', 'null'] },
    speed_mbps: { type: ['number', 'null'] },
    price_amount: { type: ['number', 'null'] },
    promo_text: { type: ['string', 'null'] },
    valid_until: { type: ['string', 'null'] },
    installation_fee: { type: ['number', 'null'] },
    contract_months: { type: ['number', 'null'] },
    contact_number: { type: ['string', 'null'] },
    raw_ocr_text: { type: ['string', 'null'] },
    confidence: {
      type: 'object',
      additionalProperties: { type: 'number' },
    },
  },
  required: [
    'competitor_name',
    'package_name',
    'speed_mbps',
    'price_amount',
    'promo_text',
    'valid_until',
    'installation_fee',
    'contract_months',
    'contact_number',
    'raw_ocr_text',
    'confidence',
  ],
}

function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(request, data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...corsHeaders(request), ...(init.headers || {}) },
  })
}

async function authenticate(request) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return false

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: authorization,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    })
    return response.ok
  } catch {
    return false
  }
}

function extractBase64Image(value) {
  const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s)
  return match ? match[1] : value
}

function normalizeExtraction(value) {
  const defaults = {
    competitor_name: null,
    package_name: null,
    speed_mbps: null,
    price_amount: null,
    promo_text: null,
    valid_until: null,
    installation_fee: null,
    contract_months: null,
    contact_number: null,
    raw_ocr_text: null,
    confidence: {},
  }

  if (!value || typeof value !== 'object') return defaults

  return {
    ...defaults,
    ...value,
    confidence:
      value.confidence && typeof value.confidence === 'object'
        ? value.confidence
        : {},
  }
}

function parseOcrLocally(ocrText) {
  const result = normalizeExtraction({ raw_ocr_text: ocrText })

  const competitorMatch = ocrText.match(
    /\b(Nethome(?:\.id)?|Biznet(?:\s+Home)?|IndiHome|MyRepublic|First\s+Media|CBN|ICONNET)\b/i,
  )
  if (competitorMatch) {
    const value = competitorMatch[1]
    result.competitor_name = /nethome/i.test(value) ? 'Nethome.id' : value
  }

  const speeds = [...ocrText.matchAll(/(\d{2,4})\s*(?:Mbps|Mpbs|Mb\/s)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 10 && n <= 10000)
  if (speeds.length) result.speed_mbps = Math.min(...speeds)

  const prices = [...ocrText.matchAll(/Rp\.?\s*([0-9][0-9.,\s]*)/gi)]
    .map((m) => Number(m[1].replace(/[^0-9]/g, '')))
    .filter((n) => Number.isFinite(n) && n >= 10000 && n <= 100000000)
  if (prices.length) result.price_amount = Math.min(...prices)

  const phoneMatch = ocrText.match(/(?:\+?62|0)\s*8\d{1,2}(?:[-.\s]?\d{3,4}){2,3}/)
  if (phoneMatch) {
    let phone = phoneMatch[0].replace(/[^0-9+]/g, '')
    if (phone.startsWith('+62')) phone = '0' + phone.slice(3)
    if (phone.startsWith('62')) phone = '0' + phone.slice(2)
    result.contact_number = phone
  }

  const nethomePackage = ocrText.match(/\b(Nethome\s+(?:Lancar|Ngebut|Sultan))\b/i)
  const genericPackage = ocrText.match(/\b(Paket\s+[^\n]{3,60})/i)
  const biznetPackage = ocrText.match(/\b(Biznet\s+Home\s+[0-9]+D)\b/i)
  const packageMatch = nethomePackage || biznetPackage || genericPackage
  if (packageMatch) result.package_name = packageMatch[1].trim()

  const promoLines = ocrText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /promo|gratis|free|bundling|hemat|diskon|discount|bonus|bulan/i.test(line))
  if (promoLines.length) result.promo_text = [...new Set(promoLines)].join(' | ')

  return result
}

function usefulFieldCount(value) {
  return [
    value.competitor_name,
    value.package_name,
    value.speed_mbps,
    value.price_amount,
    value.promo_text,
    value.valid_until,
    value.installation_fee,
    value.contract_months,
    value.contact_number,
  ].filter((item) => item !== null && item !== undefined && item !== '').length
}

function extractModelPayload(response) {
  const parsed = response?.choices?.[0]?.message?.parsed
  if (parsed && typeof parsed === 'object') return parsed

  const candidate =
    response?.response ??
    response?.choices?.[0]?.message?.content ??
    response?.result ??
    response

  if (candidate && typeof candidate === 'object') return candidate

  if (typeof candidate === 'string') {
    const clean = candidate
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim()

    try {
      return JSON.parse(clean)
    } catch {
      return parseOcrLocally(clean)
    }
  }

  return null
}

function mergeMissing(target, fallback) {
  const result = normalizeExtraction(target)
  for (const key of [
    'competitor_name',
    'package_name',
    'speed_mbps',
    'price_amount',
    'promo_text',
    'valid_until',
    'installation_fee',
    'contract_months',
    'contact_number',
    'raw_ocr_text',
  ]) {
    if (result[key] == null || result[key] === '') result[key] = fallback[key] ?? result[key]
  }
  result.confidence = { ...(fallback.confidence || {}), ...(result.confidence || {}) }
  return result
}

async function analyze(request, env) {
  if (request.method !== 'POST') {
    return json(request, { error: 'Method not allowed' }, { status: 405 })
  }

  if (!(await authenticate(request))) {
    return json(request, { error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.image || typeof body.image !== 'string') {
    return json(request, { error: 'Missing image data' }, { status: 400 })
  }

  if (!env.AI) {
    return json(request, { error: 'Workers AI binding is not configured' }, { status: 500 })
  }

  const browserOcrText =
    typeof body.ocr_text === 'string' && body.ocr_text.trim()
      ? body.ocr_text.trim().slice(0, 12000)
      : ''
  const browserFallback = browserOcrText
    ? parseOcrLocally(browserOcrText)
    : normalizeExtraction({})

  const prompt = `Analyze this Indonesian fixed-broadband advertisement poster and extract only information that is clearly visible.

The browser OCR below is additional evidence. Correct obvious OCR mistakes using the image, but do not ignore useful text that the browser already recognized.

BROWSER OCR:\n${browserOcrText || '(no browser OCR available)'}

Rules:
- Identify the ISP brand exactly as shown. Examples include Nethome.id, Biznet, IndiHome, MyRepublic, First Media, CBN, and ICONNET, but do not limit yourself to these brands.
- If several packages are shown, use the lowest-priced entry package for package_name, speed_mbps, and price_amount.
- Preserve other visible package tiers in promo_text and raw_ocr_text.
- price_amount and installation_fee must be numeric IDR values without punctuation.
- speed_mbps must be a number in Mbps.
- valid_until must be YYYY-MM-DD only when explicitly visible.
- Do not invent installation fees, contract periods, or validity dates.
- raw_ocr_text should contain the important readable poster text.
- confidence values must be between 0 and 1.`

  try {
    const visionResult = await env.AI.run(
      '@cf/google/gemma-4-26b-a4b-it',
      {
        messages: [
          {
            role: 'system',
            content: 'You are a precise OCR and structured-data extraction assistant for Indonesian telecom advertisements.',
          },
          { role: 'user', content: prompt },
        ],
        image: extractBase64Image(body.image),
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACTION_SCHEMA,
        },
        max_completion_tokens: 1200,
        temperature: 0.1,
        chat_template_kwargs: {
          enable_thinking: false,
        },
      },
      { rejectIfBusy: true },
    )

    let result = normalizeExtraction(extractModelPayload(visionResult))

    if (result.raw_ocr_text) {
      result = mergeMissing(result, parseOcrLocally(result.raw_ocr_text))
    }

    // Browser OCR is a deterministic safety net. If Gemma misses a field that
    // Tesseract already saw, keep the Tesseract-derived value instead of null.
    result = mergeMissing(result, browserFallback)

    if (!result.raw_ocr_text && browserOcrText) result.raw_ocr_text = browserOcrText

    return json(request, {
      ...result,
      _debug: {
        model_fields: usefulFieldCount(normalizeExtraction(extractModelPayload(visionResult))),
        final_fields: usefulFieldCount(result),
        browser_ocr_supplied: Boolean(browserOcrText),
      },
    })
  } catch (error) {
    // Even when Workers AI fails, return useful deterministic extraction from
    // browser OCR instead of throwing away already recognized poster data.
    if (browserOcrText && usefulFieldCount(browserFallback) > 0) {
      return json(request, {
        ...browserFallback,
        _debug: {
          model_fields: 0,
          final_fields: usefulFieldCount(browserFallback),
          browser_ocr_supplied: true,
          ai_error: error instanceof Error ? error.message : 'AI extraction failed',
        },
      })
    }

    return json(
      request,
      { error: error instanceof Error ? error.message : 'AI extraction failed' },
      { status: 500 },
    )
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }

    if (url.pathname === '/api/health') {
      return json(request, {
        ok: true,
        service: 'competitor-market',
        ai: Boolean(env.AI),
      })
    }

    if (url.pathname === '/api/analyze') {
      return analyze(request, env)
    }

    return env.ASSETS.fetch(request)
  },
}
