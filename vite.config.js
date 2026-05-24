import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase'
          if (id.includes('node_modules/@react-pdf')) return 'pdf'
          if (id.includes('node_modules/docx')) return 'docx'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Rapports de Chantier',
        short_name: 'Chantier',
        description: 'Application de gestion des rapports de chantier pour architectes',
        theme_color: '#00a99e',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache' },
          },
          {
            urlPattern: /^https:\/\/storage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'storage-cache', expiration: { maxEntries: 100 } },
          },
        ],
      },
    }),
  ],
})
