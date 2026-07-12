import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ICE Breaker',
        short_name: 'ICE Breaker',
        description: 'Cyberpunk tower defense — defend the mainframe from intrusion.',
        theme_color: '#0a0e14',
        background_color: '#0a0e14',
        display: 'standalone',
        orientation: 'landscape',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
