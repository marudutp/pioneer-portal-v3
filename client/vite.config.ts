import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    hmr: { clientPort: 443 },
    resolve: {
      preserveSymlinks: true,
    },
    fs: {
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
      '@': path.resolve(__dirname, './src')
    }
  }
});
