// import { defineConfig } from 'vite';
// import fs from 'fs';
// import path from 'path';

// export default defineConfig({
//   server: {
//     https: {
//       // Kita arahkan ke folder server/cert menggunakan path.resolve
//       // Sesuaikan nama filenya (localhost+2 atau cert) sesuai hasil mkcert Anda tadi
//       key: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2-key.pem')),
//       cert: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2.pem')),
//     },
//     // Membuka akses agar bisa diakses via IP (10.165.51.183) oleh Siswa
//     host: true, 
//     port: 5173,
//     // Penting: Memastikan HMR (Hot Module Replacement) juga berjalan di atas WSS (Secure WebSocket)
//     hmr: {
//         protocol: 'wss',
//         host: 'localhost',
//     },
//   },
//   resolve: {
//     alias: {
//       // Memudahkan import jika diperlukan
//       '@': path.resolve(__dirname, './src'),
//     },
//   },
// });

import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    https: {
      // Path sudah benar, arahkan ke folder server/cert
      key: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2-key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../server/cert/localhost+2.pem')),
    },
    host: true, // Membuka akses via IP (10.165.51.183)
    port: 5173,
    hmr: {
      protocol: 'wss',
      // host: 'localhost', <-- Hapus ini biar otomatis pakai IP yang diakses
    },
    fs: {
      // PENTING: Izinkan Vite mengakses folder 'shared' di luar folder 'client'
      allow: [
        '..', // Izinkan naik satu level ke root project
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Opsional: Buat alias biar import constants gampang
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});