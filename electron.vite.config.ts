import vue from '@vitejs/plugin-vue'
import { externalizeDepsPlugin, defineConfig } from 'electron-vite'
import { fileURLToPath } from 'node:url'

const rendererRoot = fileURLToPath(new URL('./src/renderer', import.meta.url))

const developmentContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://127.0.0.1:5173",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
          chunkFileNames: 'chunks/[name]-[hash].cjs',
        },
      },
    },
  },
  renderer: {
    root: rendererRoot,
    resolve: {
      alias: {
        '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      },
    },
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      headers: {
        'Content-Security-Policy': developmentContentSecurityPolicy,
        'X-Content-Type-Options': 'nosniff',
      },
    },
    build: {
      outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
      emptyOutDir: true,
    },
  },
})
