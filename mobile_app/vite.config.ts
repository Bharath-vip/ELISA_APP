import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    host: true, // Allow mobile phone connection over local Wi-Fi!
    port: 5173
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web']
  }
})
