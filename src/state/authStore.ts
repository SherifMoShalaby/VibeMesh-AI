import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,

  signIn: async (email, password) => {
    if (!supabase) return 'Supabase not configured'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  },

  signUp: async (email, password) => {
    if (!supabase) return 'Supabase not configured'
    const { error } = await supabase.auth.signUp({ email, password })
    return error?.message ?? null
  },

  signOut: async () => {
    await supabase?.auth.signOut()
    set({ user: null, session: null })
  },
}))

// Bootstrap: sync auth state from Supabase on load + on every change
if (supabase) {
  void supabase.auth.getSession().then(({ data: { session } }) => {
    useAuth.setState({ user: session?.user ?? null, session, loading: false })
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ user: session?.user ?? null, session, loading: false })
  })
} else {
  // no Supabase configured — skip the auth gate entirely
  useAuth.setState({ loading: false })
}
