import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

function formatPrice(value: Report['price_amount']) {
  return value ? 'Rp' + Number(value).toLocaleString('id-ID') : '—'
}

export default function Reports() {
  const [rows, setRows] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    supabase
      .from('competitor_reports')
      .select('*, competitors(name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as Report[])
        setLoading(false)
      })
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows

    return rows.filter((row) => {
      const haystack = [
        row.competitors?.name,
        row.competitor_name_detected,
        row.package_name,
        row.sighting_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(needle)
    })
  }, [query, rows])

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">HISTORY</p>
          <h2>My reports</h2>
          <p className="muted">Review the competitor sightings captured by your account.</p>
        </div>
        <Link className="button primary small desktop-action" to="/report">+ New report</Link>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search competitor, package or ad type"
            aria-label="Search reports"
          />
        </div>
        <div className="result-count">
          {loading ? 'Loading…' : String(filtered.length) + ' report' + (filtered.length === 1 ? '' : 's')}
        </div>
      </div>

      <div className="card-list">
        {loading && <div className="empty-card skeleton-card">Loading reports…</div>}
        {!loading && rows.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">▤</div>
            <strong>No reports yet</strong>
            <span>Capture your first field sighting to start building the dataset.</span>
            <Link className="button primary small" to="/report">Create report</Link>
          </div>
        )}
        {!loading && rows.length > 0 && filtered.length === 0 && (
          <div className="empty-state compact">
            <strong>No matching reports</strong>
            <span>Try another competitor, package, or ad type.</span>
          </div>
        )}
        {filtered.map((r) => (
          <Link className="report-card report-card-detailed report-card-link" key={r.id} to={"/reports/" + r.id}>
            <div className="report-brand-mark">
              {(r.competitors?.name || r.competitor_name_detected || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="grow">
              <div className="report-title-row">
                <div>
                  <strong>{r.competitors?.name || r.competitor_name_detected || 'Unknown competitor'}</strong>
                  <div className="meta capitalize">{r.sighting_type.replace('_', ' ')}</div>
                </div>
                <span className={'status ' + r.ai_status}>{r.ai_status.replace('_', ' ')}</span>
              </div>

              <div className="report-metrics detailed">
                <span><b>{r.speed_mbps ? String(r.speed_mbps) + ' Mbps' : '—'}</b><small>Speed</small></span>
                <span><b>{formatPrice(r.price_amount)}</b><small>Price</small></span>
                <span><b>{r.gps_accuracy_m ? '±' + Math.round(r.gps_accuracy_m) + ' m' : '—'}</b><small>GPS accuracy</small></span>
              </div>

              <div className="report-footer">
                <span>{new Date(r.created_at).toLocaleString('id-ID')}</span>
                <span>{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
