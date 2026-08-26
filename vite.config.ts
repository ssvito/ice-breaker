import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/ice-breaker/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'ICE Breaker',
        short_name: 'ICE Breaker',
        description: 'Cyberpunk tower defense — defend the mainframe from intrusion.',
        theme_color: '#0a0e14',
        background_color: '#0a0e14',
        // 'fullscreen', not 'standalone': it drops the Android navigation bar in the
        // installed app for one line and no code, and that bar is ~48px of an 81px
        // band once the board is turned.
        display: 'fullscreen',
        // 'any', not 'landscape': the installed PWA otherwise never rotates, and
        // portrait is a first-class layout as of v1.4.
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
