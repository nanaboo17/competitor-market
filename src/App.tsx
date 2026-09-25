import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Login from './pages/Login'
import ReportForm from './pages/ReportForm'
import Reports from './pages/Reports'

function Protected({ session }: { session: Session | null }) {
  return session ? <AppShell /> : <Navigate to="/login" replace />
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="loading-screen">Loading…</div>

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login session={session} />} />
        <Route element={<Protected session={session} />}>
          <Route index element={<Home />} />
          <Route path="report" element={<ReportForm />} />
          <Route path="reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to={session ? '/' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  )
}
