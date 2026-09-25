export type Competitor = {
  id: string
  name: string
}

export type AIExtraction = {
  competitor_name?: string | null
  package_name?: string | null
  speed_mbps?: number | null
  price_amount?: number | null
  promo_text?: string | null
  valid_until?: string | null
  installation_fee?: number | null
  contract_months?: number | null
  contact_number?: string | null
  raw_ocr_text?: string | null
  confidence?: Record<string, number>
}

export type Report = {
  id: string
  competitor_id: string | null
  competitor_name_detected: string | null
  sighting_type: string
  latitude: number
  longitude: number
  gps_accuracy_m: number | null
  photo_path: string
  raw_ocr_text: string | null
  package_name: string | null
  speed_mbps: number | null
  price_amount: number | null
  currency: string
  promo_text: string | null
  valid_until: string | null
  installation_fee: number | null
  contract_months: number | null
  contact_number: string | null
  notes: string | null
  ai_status: string
  captured_at: string
  created_at: string
  competitors?: { name: string } | null
}
