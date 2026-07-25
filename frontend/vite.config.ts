import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/lista/', // For GitHub Pages deployment under https://serjtlgram.github.io/lista/
  server: {
    port: 3000,
    host: true
  }
})
