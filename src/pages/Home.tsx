import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

export default function Home() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('competitor_reports')
      .select('*, competitors(name)')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setReports((data ?? []) as Report[])
        setLoading(false)
      })
  }, [])

  return (
    <>
      <section className="hero-card">
        <p className="eyebrow">FIELD CAPTURE</p>
        <h2>See a competitor poster?</h2>
        <p>Capture the photo and location while you are still on site. AI can pre-fill the details for review.</p>
        <Link className="button primary wide" to="/report">+ Report competitor</Link>
      </section>

      <section className="section-head">
        <div>
          <p className="eyebrow">RECENT</p>
          <h2>Your latest sightings</h2>
        </div>
        <Link to="/reports">View all</Link>
      </section>

      <div className="card-list">
        {loading && <div className="empty-card">Loading reports…</div>}
        {!loading && reports.length === 0 && <div className="empty-card">No reports yet. Your first sighting will appear here.</div>}
        {reports.map((r) => (
          <article className="report-card" key={r.id}>
            <div className="report-dot" />
            <div className="grow">
              <strong>{r.competitors?.name || r.competitor_name_detected || 'Unknown competitor'}</strong>
              <div className="meta">{r.speed_mbps ? `${r.speed_mbps} Mbps` : 'Speed not captured'} · {r.price_amount ? `Rp${Number(r.price_amount).toLocaleString('id-ID')}` : 'Price not captured'}</div>
              <div className="meta">{new Date(r.created_at).toLocaleString('id-ID')}</div>
            </div>
            <span className={`status ${r.ai_status}`}>{r.ai_status.replace('_', ' ')}</span>
          </article>
        ))}
      </div>
    </>
  )
}
