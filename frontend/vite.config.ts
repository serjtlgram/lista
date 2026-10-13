import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const cacheBustPlugin: Plugin = {
  name: 'html-cache-bust',
  enforce: 'post',
  transformIndexHtml(html) {
    return html
      .replace(/(src="(?:\.\/|\/)?assets\/[^"]+\.js)(")/g, '$1?v=2$2')
      .replace(/(href="(?:\.\/|\/)?assets\/[^"]+\.css)(")/g, '$1?v=2$2')
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cacheBustPlugin],
  base: './', // For Vercel relative paths
  server: {
    port: 3000,
    host: true
  }
})
