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

    // Stage 1: vision/OCR only. Do not constrain this call to JSON.
    const visionResult = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        {
          role: 'system',
          content: 'You are an OCR assistant for Indonesian telecom advertisements. Read every visible word, number, package, price, speed, promotion, validity period, and contact number from the image. Preserve the text faithfully.',
        },
        {
          role: 'user',
          content: 'Transcribe and summarize all visible information in this advertisement. Include every package tier, speed, price, promo term, and contact number.',
        },
      ],
      image: imageBase64,
      chat_template_kwargs: {
        enable_thinking: false,
      },
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

    // Stage 2: convert OCR text to the exact app schema.
    const structuredResult = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        {
          role: 'system',
          content: 'Extract structured broadband-offer data from OCR text. Use only facts present in the OCR. Return the requested JSON schema.',
        },
        {
          role: 'user',
          content: `OCR text from poster:\n\n${ocrText}\n\nIf there are multiple package tiers, use the lowest-priced entry package for package_name, speed_mbps, and price_amount. Put the remaining tiers and bundling details in promo_text.`,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: EXTRACTION_SCHEMA,
      },
      chat_template_kwargs: {
        enable_thinking: false,
      },
    })

    let candidate =
      structuredResult?.response ??
      structuredResult?.choices?.[0]?.message?.content ??
      structuredResult?.result ??
      structuredResult

    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(stripCodeFence(candidate))
      } catch {
        candidate = {}
      }
    }

    if (candidate && typeof candidate === 'object' && candidate.response && typeof candidate.response === 'object') {
      candidate = candidate.response
    }

    const normalized = normalizeExtraction(candidate)
    normalized.raw_ocr_text = normalized.raw_ocr_text || ocrText

    // Deterministic fallback for common fields when the structured call omits them.
    if (!normalized.competitor_name) {
      const competitorMatch = ocrText.match(/\b(Biznet(?:\s+Home)?|IndiHome|MyRepublic|First\s+Media|CBN|ICONNET)\b/i)
      if (competitorMatch) normalized.competitor_name = competitorMatch[1]
    }

    if (normalized.speed_mbps == null) {
      const speeds = [...ocrText.matchAll(/(\d{2,4})\s*Mbps/gi)]
        .map((m) => Number(m[1]))
        .filter((n) => Number.isFinite(n))
      if (speeds.length) normalized.speed_mbps = Math.min(...speeds)
    }

    if (normalized.price_amount == null) {
      const prices = [...ocrText.matchAll(/Rp\s*([0-9][0-9.]{3,})/gi)]
        .map((m) => Number(m[1].replace(/\./g, '')))
        .filter((n) => Number.isFinite(n))
      if (prices.length) normalized.price_amount = Math.min(...prices)
    }

    if (!normalized.contact_number) {
      const phoneMatch = ocrText.match(/\b0\d{2,3}[-\s]?\d{3,4}[-\s]?\d{3,4}\b/)
      if (phoneMatch) normalized.contact_number = phoneMatch[0].replace(/\s+/g, '')
    }

    return json(request, normalized)
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
