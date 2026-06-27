import { useRef, useState } from 'react'
import { useAuth } from '../state/authStore'
import { useFocusTrap } from '../lib/useFocusTrap'

export default function AuthModal() {
  const [mode, setMode]     = useState<'signin' | 'signup'>('signin')
  const [email, setEmail]   = useState('')
  const [password, setPass] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const [busy, setBusy]     = useState(false)
  const { signIn, signUp }  = useAuth()
  const dialogRef = useRef<HTMLFormElement>(null)
  useFocusTrap(dialogRef)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = mode === 'signin'
      ? await signIn(email, password)
      : await signUp(email, password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg)', zIndex: 1000,
    }}>
      <form
        ref={dialogRef} tabIndex={-1}
        role="dialog" aria-modal="true"
        aria-label={mode === 'signin' ? 'Sign in to Vibemesh' : 'Create account'}
        onSubmit={(e) => { void submit(e) }} style={{
        background: 'var(--raised)', border: '1px solid var(--line)',
        borderRadius: 12, padding: 32, width: 340, display: 'flex',
        flexDirection: 'column', gap: 16,
      }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
          {mode === 'signin' ? 'Sign in to Vibemesh' : 'Create account'}
        </h2>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
          Email
          <input
            type="email" value={email} required autoFocus
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--inset)', color: 'var(--text)', fontSize: '0.9rem' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.85rem' }}>
          Password
          <input
            type="password" value={password} required minLength={8}
            onChange={(e) => setPass(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--inset)', color: 'var(--text)', fontSize: '0.9rem' }}
          />
        </label>

        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--err)', fontSize: '0.82rem' }}>{error}</p>
        )}

        <button
          type="submit" disabled={busy}
          className="btn btn-primary"
          style={{ marginTop: 4 }}
        >
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: '0.82rem' }}
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null) }}
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
