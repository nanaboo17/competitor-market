import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

function formatPrice(value: Report['price_amount']) {
  return value ? 'Rp' + Number(value).toLocaleString('id-ID') : 'Price —'
}

export default function Home() {
  const [reports, setReports] = useState<Report[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase
        .from('competitor_reports')
        .select('*, competitors(name)')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('competitor_reports')
        .select('id', { count: 'exact', head: true }),
    ]).then(([recentResult, countResult]) => {
      setReports((recentResult.data ?? []) as Report[])
      setTotal(countResult.count ?? 0)
      setLoading(false)
    })
  }, [])

  const reviewed = reports.filter((report) => ['reviewed', 'completed'].includes(report.ai_status)).length
  const uniqueCompetitors = new Set(
    reports
      .map((report) => report.competitors?.name || report.competitor_name_detected)
      .filter(Boolean),
  ).size

  return (
    <>
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow hero-eyebrow">FIELD CAPTURE</p>
          <h2>Turn competitor sightings into usable market data.</h2>
          <p>Capture the poster, location, price and package while you are on site. AI helps with the first pass; you stay in control of the final data.</p>
          <div className="hero-actions">
            <Link className="button primary" to="/report">Create new report</Link>
            <Link className="button hero-secondary" to="/reports">Browse reports</Link>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="radar-ring ring-one" />
          <div className="radar-ring ring-two" />
          <div className="radar-dot dot-one" />
          <div className="radar-dot dot-two" />
          <div className="radar-core">CM</div>
        </div>
      </section>

      <section className="stat-grid" aria-label="Reporting summary">
        <div className="stat-card">
          <span className="stat-label">Your reports</span>
          <strong>{loading ? '—' : total}</strong>
          <span className="stat-foot">Total submitted</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Recent brands</span>
          <strong>{loading ? '—' : uniqueCompetitors}</strong>
          <span className="stat-foot">Across latest sightings</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">AI reviewed</span>
          <strong>{loading ? '—' : reviewed}</strong>
          <span className="stat-foot">Latest 5 reports</span>
        </div>
      </section>

      <section className="section-head">
        <div>
          <p className="eyebrow">RECENT ACTIVITY</p>
          <h2>Your latest sightings</h2>
          <p className="section-subtitle">Quick view of the most recent competitor reports from your account.</p>
        </div>
        <Link to="/reports">View all</Link>
      </section>

      <div className="card-list">
        {loading && <div className="empty-card skeleton-card">Loading your reports…</div>}
        {!loading && reports.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">＋</div>
            <strong>No reports yet</strong>
            <span>Your first competitor sighting will appear here.</span>
            <Link className="button primary small" to="/report">Create report</Link>
          </div>
        )}
        {reports.map((r) => (
          <article className="report-card" key={r.id}>
            <div className="report-brand-mark">
              {(r.competitors?.name || r.competitor_name_detected || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="grow">
              <div className="report-title-row">
                <strong>{r.competitors?.name || r.competitor_name_detected || 'Unknown competitor'}</strong>
                <span className={'status ' + r.ai_status}>{r.ai_status.replace('_', ' ')}</span>
              </div>
              <div className="report-metrics">
                <span>{r.speed_mbps ? String(r.speed_mbps) + ' Mbps' : 'Speed —'}</span>
                <span>{formatPrice(r.price_amount)}</span>
                <span>{r.sighting_type.replace('_', ' ')}</span>
              </div>
              <div className="meta">{new Date(r.created_at).toLocaleString('id-ID')}</div>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
