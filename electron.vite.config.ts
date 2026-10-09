import vue from '@vitejs/plugin-vue'
import { externalizeDepsPlugin, defineConfig } from 'electron-vite'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const rendererRoot = fileURLToPath(new URL('./src/renderer', import.meta.url))

// Relaciona somente módulos com bytes efetivamente incorporados ao renderer.
// Dependência classificada como dev ainda pode exigir notice no produto.
function runtimeNotices(): Plugin {
  return { name: 'taskflow-runtime-notices', generateBundle(_options, bundle) {
    const root = fileURLToPath(new URL('.', import.meta.url))
    const names = new Set<string>()
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue
      for (const [id, info] of Object.entries(output.modules)) {
        if (info.renderedLength === 0) continue
        const match = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id.replace(/\\/g, '/'))
        if (match?.[1]) names.add(match[1])
      }
    }
    // A fachada vue pode ser eliminada como reexportação pura; o runtime Vue
    // continua incorporado pelos pacotes @vue/runtime-*.
    if (names.has('@vue/runtime-dom') || names.has('@vue/runtime-core')) names.add('vue')
    const components = [...names].sort().map(name => {
      const packageRoot = path.join(root, 'node_modules', name)
      const metadata: unknown = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
      if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string' ||
          !('license' in metadata) || typeof metadata.license !== 'string') throw new Error('Runtime component metadata missing')
      const license = readFileSync(path.join(packageRoot, 'LICENSE'), 'utf8')
      if (!license.trim()) throw new Error('Runtime component license missing')
      return { name, version: metadata.version, license: metadata.license,
        origin: `node_modules/${name}`, licenseSha256: createHash('sha256').update(license).digest('hex'), text: license }
    })
    for (const name of ['vue', 'pinia']) if (!names.has(name)) throw new Error(`Expected incorporated component missing: ${name}`)
    writeFileSync(path.join(root, 'build/runtime-components.json'), JSON.stringify(components.map(component => ({
      name: component.name, version: component.version, license: component.license,
      origin: component.origin, licenseSha256: component.licenseSha256,
    })), null, 2) + '\n')
    writeFileSync(path.join(root, 'build/THIRD-PARTY-NOTICES.txt'), components.map(component =>
      `${component.name} ${component.version}\nOrigin: ${component.origin}\nLicense: ${component.license}\n\n${component.text}\n`).join('\n---\n\n'))
  } }
}

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
    plugins: [vue(), runtimeNotices()],
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
