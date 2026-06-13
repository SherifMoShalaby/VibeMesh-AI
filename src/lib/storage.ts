import type { Project } from '../types'

const KEY = 'vibemesh.projects.v1'
const ACTIVE_KEY = 'vibemesh.activeProject.v1'

// VibeSCAD → Vibemesh rename: copy each legacy key once (old keys are kept
// untouched so an older build can still open the same browser profile).
const LEGACY_PREFIX = 'vibescad.'
const PREFIX = 'vibemesh.'
for (const suffix of ['projects.v1', 'activeProject.v1', 'engine.v1', 'claudeModel.v1', 'quality.v1']) {
  try {
    const old = localStorage.getItem(LEGACY_PREFIX + suffix)
    if (old !== null && localStorage.getItem(PREFIX + suffix) === null) {
      localStorage.setItem(PREFIX + suffix, old)
    }
  } catch {
    /* storage unavailable — nothing to migrate */
  }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Project[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveProjects(projects: Project[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects))
  } catch {
    // quota exceeded — drop oldest projects' chat images, then retry once
    try {
      const slim = projects.map((p) => ({
        ...p,
        chat: p.chat.map((m) => ({ ...m, images: undefined })),
      }))
      localStorage.setItem(KEY, JSON.stringify(slim))
    } catch {
      /* give up silently */
    }
  }
}

export function loadActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveProjectId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
