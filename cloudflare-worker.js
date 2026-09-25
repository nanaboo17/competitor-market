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
    'Vary': 'Origin',
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

function stripCodeFence(value) {
  return value
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
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

  const competitorMatch = ocrText.match(/\b(Biznet(?:\s+Home)?|IndiHome|MyRepublic|First\s+Media|CBN|ICONNET)\b/i)
  if (competitorMatch) result.competitor_name = competitorMatch[1]

  const speeds = [...ocrText.matchAll(/(\d{2,4})\s*Mbps/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n))
  if (speeds.length) result.speed_mbps = Math.min(...speeds)

  const prices = [...ocrText.matchAll(/Rp\s*([0-9][0-9.]{3,})/gi)]
    .map((m) => Number(m[1].replace(/\./g, '')))
    .filter((n) => Number.isFinite(n))
  if (prices.length) result.price_amount = Math.min(...prices)

  const phoneMatch = ocrText.match(/\b0\d{2,3}[-\s]?\d{3,4}[-\s]?\d{3,4}\b/)
  if (phoneMatch) result.contact_number = phoneMatch[0].replace(/\s+/g, '')

  const packageMatch =
    ocrText.match(/(?:Paket\s+)?(Biznet\s+Home\s+[0-9]+D)\b/i) ||
    ocrText.match(/\b(Paket\s+[^\n]{3,60})/i)
  if (packageMatch) result.package_name = packageMatch[1].trim()

  const promoLines = ocrText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /promo|gratis|bundling|hemat|langganan|discount|diskon/i.test(line))
  if (promoLines.length) result.promo_text = promoLines.join(' | ')
  else result.promo_text = ocrText.slice(0, 1000)

  const confidence = {}
  if (result.competitor_name) confidence.competitor_name = 0.9
  if (result.package_name) confidence.package_name = 0.75
  if (result.speed_mbps != null) confidence.speed_mbps = 0.9
  if (result.price_amount != null) confidence.price_amount = 0.9
  if (result.contact_number) confidence.contact_number = 0.9
  result.confidence = confidence

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

  const prompt = `
Analyze this Indonesian telecom or fixed-broadband competitor advertisement image.

Perform OCR and extract ONLY information that is visible in the image. Do not infer missing values.

Return ONLY valid JSON with exactly these fields:
{
  "competitor_name": string|null,
  "package_name": string|null,
  "speed_mbps": number|null,
  "price_amount": number|null,
  "promo_text": string|null,
  "valid_until": "YYYY-MM-DD"|null,
  "installation_fee": number|null,
  "contract_months": number|null,
  "contact_number": string|null,
  "raw_ocr_text": string|null,
  "confidence": {
    "competitor_name": number,
    "package_name": number,
    "speed_mbps": number,
    "price_amount": number,
    "promo_text": number,
    "valid_until": number,
    "installation_fee": number,
    "contract_months": number,
    "contact_number": number
  }
}

Rules:
- price_amount and installation_fee must be numeric IDR values without punctuation.
- speed_mbps must be Mbps.
- confidence values must be between 0 and 1.
- Use null when a field is not clearly visible.
- If the poster contains multiple package tiers, use the lowest-priced/entry package for package_name, speed_mbps, and price_amount.
- Put the other visible package tiers and prices into promo_text so no useful offer data is lost.
- raw_ocr_text should contain all important readable text from the poster, including all package tiers and contact information.
- Do not include markdown fences or commentary.
`.trim()

  try {
    const imageBase64 = extractBase64Image(body.image)

    // One vision call only for speed. Parse the OCR locally afterwards.
    const visionResult = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        {
          role: 'system',
          content: 'You are a fast OCR assistant for Indonesian telecom advertisements. Transcribe visible text faithfully. Do not explain or reason.',
        },
        {
          role: 'user',
          content: 'Read this poster. Return plain text only. Preserve package names, internet speeds, prices, promo terms, dates, and contact numbers. Put separate offer lines on separate lines.',
        },
      ],
      image: imageBase64,
      chat_template_kwargs: {
        enable_thinking: false,
      },
      max_tokens: 700,
    })

    const ocrCandidate =
      visionResult?.response ??
      visionResult?.choices?.[0]?.message?.content ??
      visionResult?.result ??
      ''

    const ocrText =
      typeof ocrCandidate === 'string'
        ? ocrCandidate.trim()
        : JSON.stringify(ocrCandidate ?? '')

    if (!ocrText) {
      return json(request, normalizeExtraction({}))
    }

    return json(request, parseOcrLocally(ocrText))
  } catch (error) {
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
