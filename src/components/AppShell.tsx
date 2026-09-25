import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AppShell() {
  const navigate = useNavigate()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">FIELD INTELLIGENCE</div>
          <h1>Competitor Market</h1>
        </div>
        <button className="button ghost small" onClick={signOut}>Sign out</button>
      </header>

      <main className="page"><Outlet /></main>

      <nav className="bottom-nav">
        <NavLink to="/" end>Home</NavLink>
        <NavLink to="/report" className="primary-nav">+ Report</NavLink>
        <NavLink to="/reports">My Reports</NavLink>
      </nav>
    </div>
  )
}
