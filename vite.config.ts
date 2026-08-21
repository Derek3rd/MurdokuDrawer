import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Path del progetto su GitHub Pages: https://<owner>.github.io/MurdokuDrawer/
  base: '/MurdokuDrawer/',
  plugins: [react()],
})
