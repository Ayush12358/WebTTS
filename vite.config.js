import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'WebTTS - EPUB to Audiobook',
        short_name: 'WebTTS',
        description: 'Read EPUBs with text-to-speech. Offline-capable audiobook reader.',
        theme_color: '#1E3A8A',
        background_color: '#1E3A8A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB to handle WASM files
      }
    })
  ],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/edge-tts-api': {
        target: 'https://speech.platform.bing.com',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/edge-tts-api/, ''),
        onProxyReqWs: (proxyReq, req, socket) => {
          proxyReq.setHeader('Origin', 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold');
        }
      }
    }
  }
})
