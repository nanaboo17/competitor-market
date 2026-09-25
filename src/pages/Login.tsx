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
      <div className="auth-card">
        <div className="brand-mark">CM</div>
        <p className="eyebrow">COMPETITOR MARKET INTELLIGENCE</p>
        <h1>Field reporting, made fast.</h1>
        <p className="muted">Capture competitor posters, GPS coordinates, prices, packages, promotions, and AI-assisted OCR.</p>

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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="agent@company.com" />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
          </label>
          {error && <div className="error-box">{error}</div>}
          <button className="button primary" disabled={loading || googleLoading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  )
}
