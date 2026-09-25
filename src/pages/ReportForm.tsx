import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzePoster } from '../lib/ai'
import { getCurrentLocation } from '../lib/geo'
import { supabase } from '../lib/supabase'
import type { AIExtraction, Competitor } from '../lib/types'

const sightingOptions = [
  ['poster', 'Poster'],
  ['banner', 'Banner'],
  ['billboard', 'Billboard'],
  ['booth', 'Booth'],
  ['flyer', 'Flyer'],
  ['storefront', 'Storefront'],
  ['pole_ad', 'Pole advertisement'],
  ['sales_activation', 'Sales activation'],
  ['other', 'Other'],
]

export default function ReportForm() {
  const navigate = useNavigate()
  const [competitors, setCompetitors] = useState<Competitor[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMessage, setAiMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStage, setSaveStage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    competitor_id: '',
    competitor_name_detected: '',
    sighting_type: 'poster',
    package_name: '',
    speed_mbps: '',
    price_amount: '',
    promo_text: '',
    valid_until: '',
    installation_fee: '',
    contract_months: '',
    contact_number: '',
    raw_ocr_text: '',
    notes: '',
  })
  const [aiExtraction, setAiExtraction] = useState<AIExtraction | null>(null)

  const aiEnabled = true

  useEffect(() => {
    supabase.from('competitors').select('id,name').eq('active', true).order('name').then(({ data }) => {
      setCompetitors((data ?? []) as Competitor[])
    })
    captureLocation()
  }, [])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const accuracyQuality = useMemo(() => {
    if (!location) return null
    if (location.accuracy < 50) return { label: 'Good GPS', className: 'good' }
    if (location.accuracy <= 150) return { label: 'Fair GPS', className: 'warn' }
    return { label: 'Weak GPS', className: 'bad' }
  }, [location])

  async function captureLocation() {
    try {
      setLocationError('')
      const next = await getCurrentLocation()
      setLocation(next)
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : 'Location failed')
    }
  }

  async function chooseFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    if (!picked) return
    if (picked.size > 10 * 1024 * 1024) {
      setError('Photo must be 10 MB or smaller.')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
    setError('')
    setAiMessage('')
    setAiExtraction(null)

    if (aiEnabled) {
      setAiBusy(true)
      try {
        const result = await analyzePoster(picked)
        if (result) applyAI(result)
      } catch (err) {
        setAiMessage(`AI could not analyze this image. You can still submit manually. ${err instanceof Error ? err.message : ''}`)
      } finally {
        setAiBusy(false)
      }
    }
  }

  function applyAI(result: AIExtraction) {
    setAiExtraction(result)
    const match = competitors.find((c) => c.name.toLowerCase() === result.competitor_name?.toLowerCase())
    setForm((current) => ({
      ...current,
      competitor_id: match?.id ?? current.competitor_id,
      competitor_name_detected: result.competitor_name ?? current.competitor_name_detected,
      package_name: result.package_name ?? current.package_name,
      speed_mbps: result.speed_mbps != null ? String(result.speed_mbps) : current.speed_mbps,
      price_amount: result.price_amount != null ? String(result.price_amount) : current.price_amount,
      promo_text: result.promo_text ?? current.promo_text,
      valid_until: result.valid_until ?? current.valid_until,
      installation_fee: result.installation_fee != null ? String(result.installation_fee) : current.installation_fee,
      contract_months: result.contract_months != null ? String(result.contract_months) : current.contract_months,
      contact_number: result.contact_number ?? current.contact_number,
      raw_ocr_text: result.raw_ocr_text ?? current.raw_ocr_text,
    }))
    setAiMessage('AI extraction complete. Please review the values before submitting.')
  }

  function field(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError('Take or upload a competitor photo first.')
    if (!location) return setError('GPS location is required. Tap Retry GPS and allow location access.')

    setSaving(true)
    setSaveStage('Checking session…')
    setError('')

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) throw new Error('Your session is no longer valid. Please sign in again.')

      const reportId = crypto.randomUUID()
      setSaveStage('Uploading photo…')
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userData.user.id}/${reportId}/poster.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('competitor-posters')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)

      setSaveStage('Saving report…')
      const payload = {
        id: reportId,
        agent_id: userData.user.id,
        competitor_id: form.competitor_id || null,
        competitor_name_detected: form.competitor_name_detected || null,
        sighting_type: form.sighting_type,
        latitude: location.latitude,
        longitude: location.longitude,
        gps_accuracy_m: location.accuracy,
        photo_path: path,
        raw_ocr_text: form.raw_ocr_text || null,
        package_name: form.package_name || null,
        speed_mbps: form.speed_mbps ? Number(form.speed_mbps) : null,
        price_amount: form.price_amount ? Number(form.price_amount) : null,
        promo_text: form.promo_text || null,
        valid_until: form.valid_until || null,
        installation_fee: form.installation_fee ? Number(form.installation_fee) : null,
        contract_months: form.contract_months ? Number(form.contract_months) : null,
        contact_number: form.contact_number || null,
        notes: form.notes || null,
        ai_status: aiExtraction ? 'reviewed' : 'not_run',
        ai_extraction: aiExtraction ?? {},
        ai_confidence: aiExtraction?.confidence ?? {},
      }

      const { error: insertError } = await supabase.from('competitor_reports').insert(payload)
      if (insertError) {
        await supabase.storage.from('competitor-posters').remove([path])
        throw new Error(`Report save failed: ${insertError.message}`)
      }

      setSaveStage('Saved successfully')
      navigate('/reports', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report.')
    } finally {
      setSaving(false)
      setSaveStage('')
    }
  }

  return (
    <section>
      <p className="eyebrow">NEW SIGHTING</p>
      <h2>Report competitor</h2>
      <p className="muted">Capture the evidence first. AI is only used to pre-fill fields; you remain the final reviewer.</p>

      <form onSubmit={submit} className="stack top-gap">
        <div className="panel">
          <div className="panel-title-row">
            <div><span className="step">1</span><strong> Location</strong></div>
            <button type="button" className="text-button" onClick={captureLocation}>Retry GPS</button>
          </div>
          {location ? (
            <div className="location-box">
              <div><strong>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</strong></div>
              <div className="meta">Accuracy ±{Math.round(location.accuracy)} m</div>
              {accuracyQuality && <span className={`quality ${accuracyQuality.className}`}>{accuracyQuality.label}</span>}
            </div>
          ) : <div className="empty-inline">{locationError ? 'GPS unavailable — tap Retry GPS.' : 'Capturing GPS…'}</div>}
          {locationError && <div className="error-box">{locationError}</div>}
        </div>

        <div className="panel">
          <div className="panel-title-row"><div><span className="step">2</span><strong> Poster photo</strong></div></div>
          <label className="camera-drop">
            {preview ? <img src={preview} alt="Poster preview" /> : <><strong>Take photo / upload image</strong><span>JPG, PNG or WebP · max 10 MB</span></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={chooseFile} />
          </label>
          {aiBusy && <div className="ai-box">AI is reading the poster…</div>}
          {aiMessage && <div className="ai-box">{aiMessage}</div>}
          {!aiEnabled && <div className="muted small-copy">AI is optional and currently disabled until you deploy the included Cloudflare Worker and set VITE_AI_API_URL.</div>}
        </div>

        <div className="panel">
          <div className="panel-title-row"><div><span className="step">3</span><strong> Review details</strong></div></div>
          <div className="grid two">
            <label>Competitor
              <select value={form.competitor_id} onChange={(e) => field('competitor_id', e.target.value)}>
                <option value="">Unknown / other</option>
                {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Ad type
              <select value={form.sighting_type} onChange={(e) => field('sighting_type', e.target.value)}>
                {sightingOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <label>Detected competitor name
            <input value={form.competitor_name_detected} onChange={(e) => field('competitor_name_detected', e.target.value)} placeholder="e.g. MyRepublic" />
          </label>
          <label>Package name
            <input value={form.package_name} onChange={(e) => field('package_name', e.target.value)} placeholder="e.g. Internet Unlimited" />
          </label>
          <div className="grid two">
            <label>Speed (Mbps)
              <input type="number" min="0" value={form.speed_mbps} onChange={(e) => field('speed_mbps', e.target.value)} placeholder="100" />
            </label>
            <label>Price (IDR)
              <input type="number" min="0" value={form.price_amount} onChange={(e) => field('price_amount', e.target.value)} placeholder="299000" />
            </label>
          </div>
          <label>Promotion
            <textarea value={form.promo_text} onChange={(e) => field('promo_text', e.target.value)} placeholder="Free installation, discount, bundle, etc." />
          </label>
          <div className="grid two">
            <label>Valid until
              <input type="date" value={form.valid_until} onChange={(e) => field('valid_until', e.target.value)} />
            </label>
            <label>Installation fee
              <input type="number" min="0" value={form.installation_fee} onChange={(e) => field('installation_fee', e.target.value)} />
            </label>
          </div>
          <div className="grid two">
            <label>Contract (months)
              <input type="number" min="0" value={form.contract_months} onChange={(e) => field('contract_months', e.target.value)} />
            </label>
            <label>Contact number
              <input value={form.contact_number} onChange={(e) => field('contact_number', e.target.value)} />
            </label>
          </div>
          <label>OCR text
            <textarea value={form.raw_ocr_text} onChange={(e) => field('raw_ocr_text', e.target.value)} placeholder="Raw text recognized from the poster" />
          </label>
          <label>Agent notes
            <textarea value={form.notes} onChange={(e) => field('notes', e.target.value)} placeholder="Anything else worth noting?" />
          </label>
        </div>

        {error && <div className="error-box">{error}</div>}
        {saving && saveStage && <div className="ai-box">{saveStage}</div>}
        <button className="button primary wide sticky-submit" disabled={saving}>{saving ? 'Submitting…' : aiBusy ? 'Submit manually while AI runs' : 'Submit report'}</button>
      </form>
    </section>
  )
}
