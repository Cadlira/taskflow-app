import vue from '@vitejs/plugin-vue'
import { externalizeDepsPlugin, defineConfig } from 'electron-vite'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite'

const rendererRoot = fileURLToPath(new URL('./src/renderer', import.meta.url))

// Preloads sandboxed autocontidos; nenhum require de chunks locais.
function quickAddPreload(): Plugin {
  return { name: 'quick-add-isolated-preload', async generateBundle() {
    const result = await build({ configFile: false, logLevel: 'warn',
      build: { write: false, minify: false, target: 'es2022', rollupOptions: {
        input: fileURLToPath(new URL('./src/preload/quick-add.ts', import.meta.url)), external: ['electron'],
        output: { format: 'cjs', inlineDynamicImports: true },
      } },
    })
    if (!('output' in result)) throw new Error('Quick Add preload bundle unavailable')
    const chunks = result.output.filter(chunk => chunk.type === 'chunk')
    if (chunks.length !== 1 || !chunks[0]) throw new Error('Quick Add preload must be self-contained')
    this.emitFile({ type: 'asset', fileName: 'quick-add.cjs', source: chunks[0].code })
  } }
}

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
    plugins: [externalizeDepsPlugin(), quickAddPreload()],
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
