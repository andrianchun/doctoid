import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import fs from 'fs'

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))

export default defineConfig({
  envDir: '..',
  envPrefix: ['VITE_', 'AI_'],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        name: 'Doctoid — Mini-EMR Neurologi',
        short_name: 'Doctoid',
        description: 'Mini-EMR offline-first untuk dokter spesialis saraf',
        theme_color: '#3B82F6',
        background_color: '#F4F5FB',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        globIgnores: ['index.html'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 1 },
            },
          },
        ],
      },
    }),
  ],
})
