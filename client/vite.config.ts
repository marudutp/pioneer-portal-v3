import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2.pem')),
    },
    host: "0.0.0.0", // Biar bisa dibuka dari laptop lain
    port: 5173,
    hmr: { protocol: 'wss' },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    fs: {
      // IZINKAN Vite mengakses file di luar folder client
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      // Buat alias agar kita tidak perlu pakai ../../../ lagi
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, './src')
    }
  }
});