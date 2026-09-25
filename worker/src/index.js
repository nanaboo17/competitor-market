const schema = {
  type: 'object',
  properties: {
    competitor_name: { type: ['string', 'null'] },
    package_name: { type: ['string', 'null'] },
    speed_mbps: { type: ['number', 'null'] },
    price_amount: { type: ['number', 'null'] },
    promo_text: { type: ['string', 'null'] },
    valid_until: { type: ['string', 'null'], description: 'YYYY-MM-DD when clearly visible, otherwise null' },
    installation_fee: { type: ['number', 'null'] },
    contract_months: { type: ['number', 'null'] },
    contact_number: { type: ['string', 'null'] },
    raw_ocr_text: { type: ['string', 'null'] },
    confidence: {
      type: 'object',
      additionalProperties: { type: 'number' }
    }
  },
  required: [
    'competitor_name','package_name','speed_mbps','price_amount','promo_text',
    'valid_until','installation_fee','contract_months','contact_number','raw_ocr_text','confidence'
  ]
}

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  }
}

async function authenticate(request, env) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return false

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  })
  return res.ok
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '*'

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) })
    }

    if (request.method === 'GET') {
      return Response.json(
        {
          ok: true,
          service: 'competitor-market-ai',
          message: 'Worker is running. Use POST / for poster analysis.',
          supabase_project: 'market-research',
        },
        { status: 200, headers: cors(origin) },
      )
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed', allowed_methods: ['GET', 'POST', 'OPTIONS'] },
        { status: 405, headers: cors(origin) },
      )
    }

    if (!(await authenticate(request, env))) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors(origin) })
    }

    const body = await request.json().catch(() => null)
    if (!body?.image || typeof body.image !== 'string') {
      return Response.json({ error: 'Missing image data' }, { status: 400, headers: cors(origin) })
    }

    const prompt = `Read this Indonesian telecom/fixed-broadband competitor advertisement. Perform OCR and extract only facts visible in the image. Do not guess missing values. Prices must be numeric IDR amounts without separators. Speed must be Mbps. Return confidence values from 0 to 1 for each extracted field.`

    try {
      const response = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
        messages: [
          { role: 'system', content: 'You extract structured competitor market data from poster images.' },
          { role: 'user', content: prompt },
        ],
        image: body.image,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'competitor_poster_extraction',
            strict: true,
            schema,
          },
        },
      })

      const candidate = response?.response ?? response?.result ?? response
      const parsed = typeof candidate === 'string' ? JSON.parse(candidate) : candidate
      return Response.json(parsed, { headers: { ...cors(origin), 'Content-Type': 'application/json' } })
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'AI extraction failed' },
        { status: 500, headers: cors(origin) },
      )
    }
  },
}
