import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
