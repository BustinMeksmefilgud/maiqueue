import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 1. Force IPv4 to fix the WebSocket error
    host: '127.0.0.1', 
    port: 5173,

    // 2. Setup Proxy for your Flask Backend
    // This tells Vite: "If a request starts with /api, send it to Python"
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // Your Flask URL
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
