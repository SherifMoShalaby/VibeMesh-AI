import { useEffect } from 'react'
import { useAuth } from '../state/authStore'
import { supabase } from '../lib/supabase'
import { reconcileProjects, loadProjects, saveProjects } from '../lib/storage'
import AuthModal from './AuthModal'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  // On sign-in: reconcile server projects with local IDB
  useEffect(() => {
    if (!user || !supabase) return
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      try {
        const res = await fetch('/api/projects', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const remote = await res.json() as unknown[]
        const local = loadProjects()
        // reconcileProjects merges: remote wins when it has something local doesn't,
        // local wins when its updatedAt is more recent (offline edits take priority)
        const merged = reconcileProjects(local, remote as Parameters<typeof reconcileProjects>[0])
        const hasNew = merged.length !== local.length || merged.some((m, i) => m.id !== local[i]?.id)
        if (hasNew) saveProjects(merged)
      } catch { /* offline — IDB only */ }
    })
  }, [user])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <span style={{ opacity: 0.5, fontSize: '0.9rem' }}>Loading…</span>
      </div>
    )
  }

  // If Supabase is not configured, skip the auth gate entirely (local-only mode)
  if (!supabase || user) return <>{children}</>

  return <AuthModal />
}
