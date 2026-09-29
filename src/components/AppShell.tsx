import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Profile = {
  full_name: string | null
  email: string | null
  avatar_url: string | null
}

export default function AppShell() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return

      const { data: row } = await supabase
        .from('users')
        .select('full_name,email,avatar_url')
        .eq('id', data.user.id)
        .maybeSingle()

      setProfile(
        (row as Profile | null) ?? {
          full_name: data.user.user_metadata?.full_name ?? data.user.user_metadata?.name ?? null,
          email: data.user.email ?? null,
          avatar_url: data.user.user_metadata?.avatar_url ?? data.user.user_metadata?.picture ?? null,
        },
      )
    })
  }, [])

  const initials = useMemo(() => {
    const value = profile?.full_name || profile?.email || 'Agent'
    return value
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('')
  }, [profile])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol">CM</div>
          <div>
            <div className="eyebrow">FIELD INTELLIGENCE</div>
            <h1>Competitor Market</h1>
          </div>
        </div>

        <div className="profile-menu">
          {profile?.avatar_url ? (
            <img className="avatar" src={profile.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="avatar avatar-fallback">{initials || 'A'}</div>
          )}
          <div className="profile-copy">
            <strong>{profile?.full_name || 'Field Agent'}</strong>
            <span>{profile?.email || 'Signed in'}</span>
          </div>
          <button className="button ghost small" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="page"><Outlet /></main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          <span className="nav-icon">⌂</span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/report" className="primary-nav">
          <span className="nav-plus">+</span>
          <span>New report</span>
        </NavLink>
        <NavLink to="/reports">
          <span className="nav-icon">▤</span>
          <span>Reports</span>
        </NavLink>
      </nav>
    </div>
  )
}
