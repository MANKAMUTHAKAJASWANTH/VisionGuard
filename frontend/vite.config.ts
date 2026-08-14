import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Split large vendor chunks for faster initial load (code splitting)
    rollupOptions: {
      output: {
        // Split vendor chunks so browsers can cache them independently
        manualChunks(id: string) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }
        },
      },
    },
    // Increase chunk size warning threshold (face-api models are inherently large)
    chunkSizeWarningLimit: 600,
  },
  server: {
    // Proxy API calls to Spring Boot backend to avoid CORS during dev
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
