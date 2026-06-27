import { createClient } from '@supabase/supabase-js'

// Use the service role key to verify JWTs from the browser
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null

/** True once Supabase is wired up (hosted / multi-user lane). When false we are in local dev and
 *  the conditional gates below no-op. Exported so the server selftest can assert both branches. */
export const isAuthConfigured = () => !!supabase

export async function requireAuth(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Auth not configured' })
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return res.status(401).json({ error: 'Unauthorized' })
  req.user = user
  next()
}

/** Auth gate for the spending + key-writing routes. When Supabase is NOT configured (local dev /
 *  loopback `npm start`) this is a transparent pass-through, so a keyless local run is unchanged.
 *  Once Supabase env is set (the hosted lane that may bind HOST=0.0.0.0) it enforces a valid bearer
 *  exactly like requireAuth — closing the anonymous-budget-drain / key-overwrite holes. See SECURITY.md. */
export async function enforceAuthWhenConfigured(req, res, next) {
  if (!supabase) return next()
  return requireAuth(req, res, next)
}

/** Pure ownership decision (no Express, no supabase wiring) so it can be unit-tested directly.
 *  Ownership = the user's id is in the OWNER_USER_IDS allowlist (comma/space-separated) OR the user's
 *  Supabase role (app_metadata.role / user_metadata.role / role) is owner|admin. With auth configured
 *  but NO owners declared, every authenticated user is treated as an owner (single-operator default). */
export function isOwnerUser(user, ownerIdsEnv = process.env.OWNER_USER_IDS) {
  if (!user) return false
  const allow = (ownerIdsEnv || '').split(/[\s,]+/).filter(Boolean)
  const role = user.app_metadata?.role ?? user.user_metadata?.role ?? user.role
  return allow.length === 0 || allow.includes(user.id) || role === 'owner' || role === 'admin'
}

/** Owner/admin gate for the four .env-writing routes (SEC-2). Layers ON TOP of
 *  enforceAuthWhenConfigured: no-op in local dev; once configured, the authenticated user must be an
 *  owner (set OWNER_USER_IDS to lock it down for true multi-user). See SECURITY.md. */
export function requireOwner(req, res, next) {
  if (!supabase) return next()
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
  if (!isOwnerUser(req.user)) return res.status(403).json({ error: 'Forbidden' })
  next()
}
