import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
const githubPagesBase = repository ? `/${repository}/` : '/'

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS === 'true' ? githubPagesBase : '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (
            id.includes('@react-three/fiber') ||
            id.includes('@react-three/drei') ||
            id.includes('@react-three/postprocessing') ||
            id.includes('/postprocessing/')
          )
            return 'r3f'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/maath'))
            return 'vendor'
        },
      },
    },
  },
})
