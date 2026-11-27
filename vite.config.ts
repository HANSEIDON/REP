/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.svg'],
      manifest: {
        name: 'REP — 운동 기록',
        short_name: 'REP',
        description: '개인용 오프라인 운동 기록',
        lang: 'ko',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#0F0F11',
        theme_color: '#0F0F11',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}', 'exercises/exercises.json'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Exercise images (public/exercises/images/*.webp) — fetched on demand, never precached.
            urlPattern: /\/exercises\/images\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 1000, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Exercise master data (public/exercises/exercises.json).
            urlPattern: /\/exercises\/exercises\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-data',
              expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
