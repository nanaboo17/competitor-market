import { MouseEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

function formatPrice(value: Report['price_amount']) {
  return value ? 'Rp' + Number(value).toLocaleString('id-ID') : '—'
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value)
  return '"' + text.replace(/"/g, '""') + '"'
}

export default function Reports() {
  const [rows, setRows] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [competitorFilter, setCompetitorFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'price_high' | 'speed_high'>('newest')
  const [copiedId, setCopiedId] = useState('')

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

  const competitors = useMemo(
    () =>
      [...new Set(rows.map((row) => row.competitors?.name || row.competitor_name_detected).filter(Boolean) as string[])]
        .sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  const adTypes = useMemo(
    () => [...new Set(rows.map((row) => row.sighting_type).filter(Boolean))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const now = Date.now()

    const next = rows.filter((row) => {
      const competitor = row.competitors?.name || row.competitor_name_detected || ''
      const haystack = [competitor, row.package_name, row.sighting_type, row.promo_text, row.contact_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (needle && !haystack.includes(needle)) return false
      if (competitorFilter !== 'all' && competitor !== competitorFilter) return false
      if (typeFilter !== 'all' && row.sighting_type !== typeFilter) return false

      if (dateFilter !== 'all') {
        const age = now - new Date(row.created_at).getTime()
        const day = 24 * 60 * 60 * 1000
        if (dateFilter === 'today' && age > day) return false
        if (dateFilter === '7d' && age > 7 * day) return false
        if (dateFilter === '30d' && age > 30 * day) return false
      }

      return true
    })

    return [...next].sort((a, b) => {
      if (sort === 'oldest') return +new Date(a.created_at) - +new Date(b.created_at)
      if (sort === 'price_high') return Number(b.price_amount || 0) - Number(a.price_amount || 0)
      if (sort === 'speed_high') return Number(b.speed_mbps || 0) - Number(a.speed_mbps || 0)
      return +new Date(b.created_at) - +new Date(a.created_at)
    })
  }, [query, rows, competitorFilter, typeFilter, dateFilter, sort])

  const summary = useMemo(() => {
    const known = filtered.filter((row) => row.competitors?.name || row.competitor_name_detected)
    const uniqueBrands = new Set(known.map((row) => row.competitors?.name || row.competitor_name_detected)).size
    const priced = filtered.filter((row) => row.price_amount != null)
    const avgPrice = priced.length
      ? Math.round(priced.reduce((sum, row) => sum + Number(row.price_amount || 0), 0) / priced.length)
      : 0
    return { uniqueBrands, avgPrice }
  }, [filtered])

  function resetFilters() {
    setQuery('')
    setCompetitorFilter('all')
    setTypeFilter('all')
    setDateFilter('all')
    setSort('newest')
  }

  function exportCsv() {
    const header = [
      'created_at', 'competitor', 'ad_type', 'package_name', 'speed_mbps', 'price_idr',
      'promotion', 'contact_number', 'latitude', 'longitude', 'gps_accuracy_m', 'notes',
    ]

    const lines = filtered.map((row) => [
      row.created_at,
      row.competitors?.name || row.competitor_name_detected || '',
      row.sighting_type,
      row.package_name || '',
      row.speed_mbps ?? '',
      row.price_amount ?? '',
      row.promo_text || '',
      row.contact_number || '',
      row.latitude,
      row.longitude,
      row.gps_accuracy_m ?? '',
      row.notes || '',
    ].map(csvCell).join(','))

    const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'competitor-reports-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function openMap(event: MouseEvent, row: Report) {
    event.preventDefault()
    event.stopPropagation()
    window.open('https://www.google.com/maps?q=' + row.latitude + ',' + row.longitude, '_blank', 'noopener,noreferrer')
  }

  async function copyCoordinates(event: MouseEvent, row: Report) {
    event.preventDefault()
    event.stopPropagation()
    await navigator.clipboard.writeText(row.latitude + ', ' + row.longitude)
    setCopiedId(row.id)
    window.setTimeout(() => setCopiedId(''), 1400)
  }

  const hasFilters = query || competitorFilter !== 'all' || typeFilter !== 'all' || dateFilter !== 'all' || sort !== 'newest'

  return (
    <section>
      <div className="page-heading reports-heading">
        <div>
          <p className="eyebrow">HISTORY</p>
          <h2>My reports</h2>
          <p className="muted">Search, filter, compare and export your field sightings.</p>
        </div>
        <div className="report-heading-actions">
          <button className="button ghost small" type="button" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <Link className="button primary small desktop-action" to="/report">+ New report</Link>
        </div>
      </div>

      <div className="report-summary-strip">
        <div><strong>{filtered.length}</strong><span>Reports</span></div>
        <div><strong>{summary.uniqueBrands}</strong><span>Brands</span></div>
        <div><strong>{summary.avgPrice ? formatPrice(summary.avgPrice) : '—'}</strong><span>Avg. price</span></div>
      </div>

      <div className="report-filter-panel">
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search brand, package, promo or phone"
            aria-label="Search reports"
          />
        </div>

        <div className="report-filter-grid">
          <label>Brand
            <select value={competitorFilter} onChange={(event) => setCompetitorFilter(event.target.value)}>
              <option value="all">All brands</option>
              {competitors.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label>Ad type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">All types</option>
              {adTypes.map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label>Date
            <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
              <option value="all">Any time</option>
              <option value="today">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <label>Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="price_high">Highest price</option>
              <option value="speed_high">Highest speed</option>
            </select>
          </label>
        </div>

        <div className="filter-footer">
          <span>{loading ? 'Loading…' : filtered.length + ' of ' + rows.length + ' reports'}</span>
          {hasFilters && <button type="button" className="text-button" onClick={resetFilters}>Reset filters</button>}
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
            <span>Try changing the filters or search terms.</span>
            <button type="button" className="button ghost small" onClick={resetFilters}>Clear filters</button>
          </div>
        )}
        {filtered.map((r) => (
          <Link className="report-card report-card-detailed report-card-link" key={r.id} to={'/reports/' + r.id}>
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

              <div className="report-footer report-footer-actions">
                <span>{new Date(r.created_at).toLocaleString('id-ID')}</span>
                <div className="quick-report-actions">
                  <button type="button" onClick={(event) => copyCoordinates(event, r)}>{copiedId === r.id ? 'Copied!' : 'Copy GPS'}</button>
                  <button type="button" onClick={(event) => openMap(event, r)}>Map ↗</button>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
