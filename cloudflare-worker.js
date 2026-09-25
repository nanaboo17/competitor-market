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
    const result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
      messages: [
        {
          role: 'system',
          content: 'You are an OCR and structured extraction assistant. Extract only visible facts.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      image: extractBase64Image(body.image),
      response_format: {
        type: 'json_schema',
        json_schema: EXTRACTION_SCHEMA,
      },
      chat_template_kwargs: {
        enable_thinking: false,
      },
    })

    const candidate =
      result?.response ??
      result?.choices?.[0]?.message?.content ??
      result?.result ??
      result

    if (typeof candidate === 'string') {
      try {
        const parsed = JSON.parse(stripCodeFence(candidate))
        return json(request, normalizeExtraction(parsed))
      } catch {
        return json(request, normalizeExtraction({ raw_ocr_text: candidate }))
      }
    }

    const structured =
      candidate && typeof candidate === 'object' && candidate.response && typeof candidate.response === 'object'
        ? candidate.response
        : candidate

    return json(request, normalizeExtraction(structured))
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
