import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

export default function Login({ session }: { session: Session | null }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  if (session) return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  async function signInWithGoogle() {
    setGoogleLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      setError(error.message)
      setGoogleLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-showcase">
        <div className="auth-showcase-inner">
          <div className="brand-lockup auth-brand">
            <div className="brand-symbol">CM</div>
            <div>
              <div className="eyebrow hero-eyebrow">FIELD INTELLIGENCE</div>
              <strong>Competitor Market</strong>
            </div>
          </div>

          <div className="auth-copy">
            <span className="auth-kicker">Market intelligence, from the field.</span>
            <h1>Capture what competitors are doing while it is still fresh.</h1>
            <p>Turn real-world posters, promotions and packages into structured, reviewable market data.</p>
          </div>

          <div className="auth-feature-grid">
            <div><b>01</b><span>GPS-backed sightings</span></div>
            <div><b>02</b><span>AI-assisted extraction</span></div>
            <div><b>03</b><span>Structured report history</span></div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="mobile-auth-logo"><div className="brand-symbol">CM</div></div>
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Sign in to continue</h2>
          <p className="muted">Use your Google account or your existing email credentials.</p>

          <button
            type="button"
            className="button google-button"
            onClick={signInWithGoogle}
            disabled={googleLoading || loading}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
          </button>

          <div className="auth-divider"><span>or use email</span></div>

          <form onSubmit={submit} className="stack">
            <label>Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="agent@company.com" autoComplete="email" />
            </label>
            <label>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
            </label>
            {error && <div className="error-box">{error}</div>}
            <button className="button primary auth-submit" disabled={loading || googleLoading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
      </section>
    </div>
  )
}
