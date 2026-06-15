---
description: Verification gate — run lint + build, then fix anything that fails
allowed-tools: Read, Edit, Grep, Glob, Bash(npm run lint:*), Bash(npm run build:*)
---
This is the de-facto verification gate for Vibemesh-AI — there is **no test suite**, so
`npm run lint && npm run build` is what every contributor runs before opening a PR.

Do this:

1. Run `npm run lint` (ESLint over the repo).
2. Run `npm run build` (`tsc -b && vite build` — typecheck + production bundle).
3. If **either** fails:
   - Read the error output and locate the offending file(s).
   - Diagnose the root cause (a real type error, an ESLint violation, a broken import,
     a stale `tsc -b` build-info, etc.) — do not paper over it with `// eslint-disable`
     or `any` unless that is genuinely the correct fix.
   - Apply a minimal, correct fix. Frontend is TypeScript (`src/`); the server
     (`server/*.mjs`) is plain ESM JS and is **not** part of `tsc -b`, so don't expect
     it in the typecheck.
   - Re-run the failed command, then re-run the full gate from step 1.
4. Repeat until **both** commands pass clean. Report the final status and a one-line
   summary of any fixes you made.

Keep changes scoped to what's needed to make the gate pass. Don't refactor unrelated code.
