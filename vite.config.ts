import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/doc-parser/',
  optimizeDeps: {
    exclude: ['@firecrawl/anydoc-wasm']
  },
  worker: {
    format: 'es'
  }
})
