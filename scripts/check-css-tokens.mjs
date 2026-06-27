#!/usr/bin/env node
/**
 * check-css-tokens.mjs
 *
 * Guard: every var(--token) reference in src/ must resolve to a token
 * declared in a src/styles.css :root { } block (including media-scoped roots).
 *
 * Usage:
 *   node scripts/check-css-tokens.mjs
 *
 * Exit 0 = clean.  Exit 1 = phantom refs found (prints file:line for each).
 *
 * Rule: var(--x, fallback) ONLY passes when --x is declared.
 * A fallback value is not a license to reference an undefined token.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STYLES_PATH = path.join(ROOT, 'src', 'styles.css')

// ── 1. Collect all declared custom-property names from styles.css :root blocks ─

function collectDeclaredTokens(cssText) {
  const declared = new Set()

  // Match every  --token-name:  declaration (property declarations only,
  // not usages inside var()). This intentionally ignores selector context —
  // we collect declarations from ALL :root blocks (media-scoped or not).
  const declRe = /^\s*(--[\w-]+)\s*:/gm
  let m
  while ((m = declRe.exec(cssText)) !== null) {
    declared.add(m[1])
  }

  return declared
}

// ── 2. Find all var(--token) usages across src/ ─────────────────────────────

function findVarUsages() {
  // Use grep to get file:line:content for every var(--…) occurrence.
  // Works on macOS and Linux; -r recurse, -n line numbers, -o match only.
  // We need the full line so we can extract the token name precisely.
  let raw
  try {
    raw = execSync(
      `grep -rn --include='*.ts' --include='*.tsx' --include='*.css' "var(--" src/`,
      { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }
    ).toString()
  } catch (err) {
    // grep exit 1 = no matches (completely clean), which is fine
    if (err.status === 1) return []
    throw err
  }

  // Extract (file, line, token) triples from the grep output.
  // Each line looks like:  src/components/Foo.tsx:42:  ...var(--token-name...)...
  const usages = []
  const lineRe = /^([^:]+):(\d+):(.*)$/gm
  const tokenRe = /var\((--[\w-]+)/g

  let lineMatch
  while ((lineMatch = lineRe.exec(raw)) !== null) {
    const [, file, lineNo, content] = lineMatch
    let tokenMatch
    while ((tokenMatch = tokenRe.exec(content)) !== null) {
      usages.push({ file, line: Number(lineNo), token: tokenMatch[1] })
    }
    // Reset inner regex between lines
    tokenRe.lastIndex = 0
  }

  return usages
}

// ── 3. Main ─────────────────────────────────────────────────────────────────

const cssText = readFileSync(STYLES_PATH, 'utf8')
const declared = collectDeclaredTokens(cssText)

const usages = findVarUsages()

const phantoms = usages.filter(({ token }) => !declared.has(token))

if (phantoms.length === 0) {
  console.log('check-css-tokens: OK — all var(--token) references are declared.')
  process.exit(0)
}

// Group by file for readable output
const byFile = {}
for (const { file, line, token } of phantoms) {
  if (!byFile[file]) byFile[file] = []
  byFile[file].push({ line, token })
}

console.error('\ncheck-css-tokens: PHANTOM TOKEN REFERENCES FOUND\n')
for (const [file, hits] of Object.entries(byFile).sort()) {
  for (const { line, token } of hits.sort((a, b) => a.line - b.line)) {
    console.error(`  ${file}:${line}  →  ${token}  (not declared in src/styles.css :root)`)
  }
}
console.error(`\n${phantoms.length} phantom reference(s). Declare the token in src/styles.css :root or replace with a declared one.\n`)
process.exit(1)
