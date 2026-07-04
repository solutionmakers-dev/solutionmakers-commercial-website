import { defineConfig } from 'vite'
export default defineConfig({
  // Relative base so the build works at any mount path (GitHub Pages project URL, CDN, Worker)
  base: './',
  build: { target: 'es2022' },
  server: { host: true },
})
