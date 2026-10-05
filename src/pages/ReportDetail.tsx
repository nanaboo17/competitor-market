import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

function money(value: number | null) {
  return value == null ? '—' : 'Rp' + Number(value).toLocaleString('id-ID')
}

function textOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : '—'
}

function whatsappNumber(value: string | null) {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  return digits
}

export default function ReportDetail() {
  const { id } = useParams()
  const [report, setReport] = useState<Report | null>(null)
  const [photoUrl, setPhotoUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!id) {
      setError('Report ID is missing.')
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      setError('')

      const { data, error: reportError } = await supabase
        .from('competitor_reports')
        .select('*, competitors(name)')
        .eq('id', id)
        .single()

      if (reportError || !data) {
        setError(reportError?.message || 'Report not found.')
        setLoading(false)
        return
      }

      const row = data as Report
      setReport(row)

      if (row.photo_path) {
        const { data: signed, error: photoError } = await supabase.storage
          .from('competitor-posters')
          .createSignedUrl(row.photo_path, 60 * 30)

        if (!photoError && signed?.signedUrl) {
          setPhotoUrl(signed.signedUrl)
        }
      }

      setLoading(false)
    }

    load()
  }, [id])

  const brand = useMemo(
    () => report?.competitors?.name || report?.competitor_name_detected || 'Unknown competitor',
    [report],
  )

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    window.setTimeout(() => setCopied(''), 1400)
  }

  async function copySummary() {
    if (!report) return
    const summary = [
      'Competitor: ' + brand,
      'Package: ' + textOrDash(report.package_name),
      'Speed: ' + (report.speed_mbps ? report.speed_mbps + ' Mbps' : '—'),
      'Price: ' + money(report.price_amount),
      'Promo: ' + textOrDash(report.promo_text),
      'Contact: ' + textOrDash(report.contact_number),
      'Location: ' + report.latitude + ', ' + report.longitude,
      'Captured: ' + new Date(report.captured_at || report.created_at).toLocaleString('id-ID'),
    ].join('\n')

    await copy(summary, 'summary')
  }

  if (loading) return <div className="empty-card skeleton-card">Loading report…</div>

  if (error || !report) {
    return (
      <section>
        <Link className="back-link" to="/reports">← Back to reports</Link>
        <div className="empty-state compact">
          <strong>Could not open report</strong>
          <span>{error || 'Report not found.'}</span>
        </div>
      </section>
    )
  }

  const wa = whatsappNumber(report.contact_number)

  return (
    <section>
      <div className="detail-topbar">
        <div>
          <Link className="back-link" to="/reports">← Back to reports</Link>
          <p className="eyebrow">REPORT DETAIL</p>
          <h2>{brand}</h2>
          <p className="muted">{report.sighting_type.replace('_', ' ')} · {new Date(report.created_at).toLocaleString('id-ID')}</p>
        </div>
        <span className={'status ' + report.ai_status}>{report.ai_status.replace('_', ' ')}</span>
      </div>

      <div className="detail-action-bar">
        <button type="button" className="button ghost small" onClick={copySummary}>{copied === 'summary' ? 'Copied!' : 'Copy summary'}</button>
        <button type="button" className="button ghost small" onClick={() => copy(report.latitude + ', ' + report.longitude, 'gps')}>{copied === 'gps' ? 'GPS copied!' : 'Copy GPS'}</button>
        {wa && <a className="button ghost small" href={'https://wa.me/' + wa} target="_blank" rel="noreferrer">WhatsApp ↗</a>}
        {report.contact_number && <a className="button ghost small" href={'tel:' + report.contact_number}>Call</a>}
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <div className="panel report-photo-panel">
            <div className="panel-title-row">
              <strong>Poster evidence</strong>
              <span className="meta">Private image</span>
            </div>
            {photoUrl ? (
              <a href={photoUrl} target="_blank" rel="noreferrer" className="report-photo-link" title="Open full image">
                <img className="report-photo" src={photoUrl} alt={'Competitor poster for ' + brand} />
              </a>
            ) : (
              <div className="empty-state compact">
                <strong>Photo unavailable</strong>
                <span>The report exists, but the stored image could not be opened.</span>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title-row"><strong>Offer details</strong></div>
            <div className="detail-grid">
              <div><span>Competitor</span><strong>{brand}</strong></div>
              <div><span>Detected name</span><strong>{textOrDash(report.competitor_name_detected)}</strong></div>
              <div><span>Package</span><strong>{textOrDash(report.package_name)}</strong></div>
              <div><span>Speed</span><strong>{report.speed_mbps ? report.speed_mbps + ' Mbps' : '—'}</strong></div>
              <div><span>Price</span><strong>{money(report.price_amount)}</strong></div>
              <div><span>Installation fee</span><strong>{money(report.installation_fee)}</strong></div>
              <div><span>Contract</span><strong>{report.contract_months ? report.contract_months + ' months' : '—'}</strong></div>
              <div><span>Valid until</span><strong>{textOrDash(report.valid_until)}</strong></div>
              <div><span>Contact</span><strong>{textOrDash(report.contact_number)}</strong></div>
            </div>

            <div className="detail-copy-block">
              <span>Promotion</span>
              <p>{textOrDash(report.promo_text)}</p>
            </div>

            <div className="detail-copy-block">
              <span>Agent notes</span>
              <p>{textOrDash(report.notes)}</p>
            </div>
          </div>

          <details className="panel detail-disclosure">
            <summary>Extracted text</summary>
            <pre>{textOrDash(report.raw_ocr_text)}</pre>
          </details>
        </div>

        <aside className="detail-side">
          <div className="panel sticky-detail-card">
            <div className="panel-title-row"><strong>Field metadata</strong></div>
            <div className="metadata-list">
              <div><span>Latitude</span><strong>{report.latitude.toFixed(6)}</strong></div>
              <div><span>Longitude</span><strong>{report.longitude.toFixed(6)}</strong></div>
              <div><span>GPS accuracy</span><strong>{report.gps_accuracy_m ? '±' + Math.round(report.gps_accuracy_m) + ' m' : '—'}</strong></div>
              <div><span>Captured</span><strong>{new Date(report.captured_at || report.created_at).toLocaleString('id-ID')}</strong></div>
              <div><span>Saved</span><strong>{new Date(report.created_at).toLocaleString('id-ID')}</strong></div>
            </div>

            <a
              className="button ghost wide"
              href={'https://www.google.com/maps?q=' + report.latitude + ',' + report.longitude}
              target="_blank"
              rel="noreferrer"
            >
              Open location
            </a>
          </div>
        </aside>
      </div>
    </section>
  )
}
