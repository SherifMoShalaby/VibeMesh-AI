---
description: Pre-PR readiness checklist (lint/build, SPEC, secrets, branding)
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(npm run lint:*), Bash(npm run build:*)
---
Run a pre-PR readiness check for Vibemesh-AI and report a pass/fail line per item. This is
inspection + the verification gate — do not commit, push, or open a PR.

Gather the diff first: `git status` and `git diff --stat`, plus `git diff` (staged and
unstaged) for the substantive checks below.

1. **Verification gate** — run `npm run lint`, then `npm run build` (`tsc -b && vite build`).
   Both must pass clean. There is no test suite, so this is the bar. Report failures with
   the offending file(s); fixing is out of scope for this command (use `/check` for that).

2. **SPEC in sync** — if the diff touches the **image / refine / versioning / multi-part**
   surfaces, `docs/SPEC.md` must be updated in the same change. Heuristics: look for changes
   under the image-prompt / refine pass / version-restore / `part` enum / multi-part export
   paths (e.g. `src/lib/threeMF.ts`, `src/lib/stl.ts`, image/refine handlers in
   `src/state/store.ts`, the multi-part rules in `server/prompt.mjs`). If those changed but
   `docs/SPEC.md` didn't, flag it.

3. **No secrets staged** — fail if the diff adds `.env` (it's gitignored; it must NOT be
   staged) or contains real credentials. Grep the diff for likely keys: `sk-ant-`,
   `ANTHROPIC_API_KEY=` / `KIMI_API_KEY=` with a non-empty value, bearer tokens, long
   high-entropy strings. `.env.example` placeholders (commented, no real value) are fine.
   Also confirm `bench/results/` (gitignored) isn't being added.

4. **Branding** — the product name is **Vibemesh-AI**. The legacy name "VibeSCAD"/"vibescad"
   is only allowed where it's intentional (the package directory's legacy name, the README
   origin note, and the `vibescad.*` → `vibemesh.*` localStorage migration in
   `src/lib/storage.ts`). Flag any **new** user-facing "VibeSCAD" string the diff introduces
   outside those sanctioned spots.

Finish with a concise checklist (✅/❌ per item) and, if anything failed, the exact files to fix.
