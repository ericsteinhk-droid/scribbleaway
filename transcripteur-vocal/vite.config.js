import { defineConfig } from 'vite'

// Base relative pour que les assets se chargent dans le WebView Capacitor.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
})
