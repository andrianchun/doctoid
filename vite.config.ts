import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  envDir: '..',
  envPrefix: ['VITE_', 'AI_'],
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Doctoid — Mini-EMR Neurologi',
        short_name: 'Doctoid',
        description: 'Mini-EMR offline-first untuk dokter spesialis saraf',
        theme_color: '#5B7FFF',
        background_color: '#F4F5FB',
        display: 'standalone',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // chunk utama > default 2 MB
      },
    }),
  ],
})
