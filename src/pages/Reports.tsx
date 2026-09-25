import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Report } from '../lib/types'

export default function Reports() {
  const [rows, setRows] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <section>
      <p className="eyebrow">HISTORY</p>
      <h2>My reports</h2>
      <p className="muted">Only reports created by your account are visible here.</p>
      <div className="card-list top-gap">
        {loading && <div className="empty-card">Loading…</div>}
        {!loading && rows.length === 0 && <div className="empty-card">No reports yet.</div>}
        {rows.map((r) => (
          <article className="report-card" key={r.id}>
            <div className="grow">
              <strong>{r.competitors?.name || r.competitor_name_detected || 'Unknown competitor'}</strong>
              <div className="meta">{r.sighting_type.replace('_', ' ')} · {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</div>
              <div className="meta">{r.speed_mbps ? `${r.speed_mbps} Mbps` : '—'} · {r.price_amount ? `Rp${Number(r.price_amount).toLocaleString('id-ID')}` : '—'}</div>
              <div className="meta">{new Date(r.created_at).toLocaleString('id-ID')}</div>
            </div>
            <span className={`status ${r.ai_status}`}>{r.ai_status.replace('_', ' ')}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
