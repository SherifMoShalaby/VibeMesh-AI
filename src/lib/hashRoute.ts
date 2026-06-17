/** Hash-based chat routing: every chat (project) gets a URL `#/c/<projectId>`. Hash routing
 *  (not path routing) because the app ships with Vite `base: './'` for static / GitHub-Pages
 *  hosting, where a deep path route would 404 on refresh. The hash is the single source of
 *  truth for "which chat is open": a bare URL (no hash) opens a fresh chat, and a URL carrying
 *  a chat id opens that chat — so a new window/tab is a new chat unless its URL names one. */

const RE = /^#\/c\/([\w-]+)$/

export function chatIdFromHash(): string | null {
  return window.location.hash.match(RE)?.[1] ?? null
}

export function hashForChat(id: string): string {
  return `#/c/${id}`
}

/** Point the URL hash at a chat id (or clear it to a bare URL). No-op when the hash is already
 *  correct, so it never spawns a redundant history entry or a re-entrant `hashchange`. Use
 *  `replace` for non-navigational syncs (initial load, deletes) so browser Back stays clean. */
export function setChatHash(id: string | null, opts?: { replace?: boolean }): void {
  const target = id ? hashForChat(id) : ''
  if (window.location.hash === target) return
  const bare = window.location.pathname + window.location.search
  if (opts?.replace) {
    window.history.replaceState(null, '', target || bare)
  } else if (target) {
    window.location.hash = target // a real navigation → browser Back returns to the prior chat
  } else {
    window.history.pushState(null, '', bare)
  }
}
