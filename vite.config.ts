import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Defense-in-depth CSP, injected only into the production build (a <meta> CSP in
// dev would block Vite's HMR inline scripts/eval). 'wasm-unsafe-eval' lets
// openscad-wasm instantiate; data:/blob: cover image data URLs, the worker and
// canvas/STL object URLs; Google Fonts are explicitly allowlisted.
//
// NOTE: frame-ancestors / report-uri / sandbox are intentionally omitted — browsers
// ignore them when delivered via <meta> (they require a real HTTP header) and would
// only emit a console error. Clickjacking protection is delivered by the Express
// server's `X-Frame-Options: DENY` header (server/index.mjs); a static host that
// needs it should set the `Content-Security-Policy: frame-ancestors` response header.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'vibemesh-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('</title>', `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

export default defineConfig({
  // Relative asset URLs so the built app works at any path — root domain OR a
  // GitHub Pages project subpath (username.github.io/<repo>/) — with no hardcoded
  // repo name. The app is a single page (no client-side router), so this is safe.
  base: './',
  plugins: [react(), cspPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5175',
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    // openscad-wasm embeds the WASM binary as base64 inside a ~14MB JS module
    chunkSizeWarningLimit: 20000,
  },
})
