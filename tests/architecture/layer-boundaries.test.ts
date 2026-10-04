import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const rendererRoot = path.join(projectRoot, 'src', 'renderer', 'src')
const coreRoots = ['contracts', 'domain', 'application']
  .map((layer) => path.join(projectRoot, 'src', layer))
  .filter(existsSync)

const RENDERER_FORBIDDEN = [
  { label: 'Electron', pattern: /from\s*['"]electron['"]/ },
  { label: 'Node/filesystem', pattern: /from\s*['"](?:node:)?(?:fs|path|child_process|os|crypto)(?:\/[^'"]*)?['"]/ },
  { label: 'require/process/Buffer', pattern: /\b(?:require\s*\(|process\s*\.|Buffer\b|window\.(?:require|process)\b)/ },
  { label: 'IPC genérico', pattern: /ipcRenderer|contextBridge|nodeIntegration/ },
  { label: 'rede', pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/ },
  { label: 'API Chrome', pattern: /\b(?:browser|chrome)\.[a-zA-Z]/ },
  { label: 'infraestrutura', pattern: /from\s*['"][^'"]*\/(?:infrastructure|adapters)(?:\/|['"])/ },
]

const CORE_FORBIDDEN = [
  { label: 'Vue', pattern: /from\s*['"]vue['"]/ },
  { label: 'Pinia', pattern: /from\s*['"]pinia['"]/ },
  { label: 'Electron', pattern: /from\s*['"]electron['"]/ },
  { label: 'Node', pattern: /from\s*['"](?:node:)?(?:fs|path|child_process|os|crypto|url)(?:\/[^'"]*)?['"]/ },
  { label: 'API Chrome', pattern: /\b(?:browser|chrome)\.[a-zA-Z]/ },
  { label: 'infraestrutura', pattern: /from\s*['"][^'"]*\/(?:infrastructure|adapters)(?:\/|['"])/ },
  { label: 'rede', pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/ },
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filename)
    return /\.(?:ts|vue)$/.test(entry.name) ? [filename] : []
  })
}

function violations(directory: string, forbidden: typeof RENDERER_FORBIDDEN): string[] {
  return sourceFiles(directory).flatMap((filename) => {
    const content = readFileSync(filename, 'utf8')
    return forbidden.filter(({ pattern }) => pattern.test(content)).map(({ label }) => `${filename} → ${label}`)
  })
}

function coreViolations(): string[] {
  return coreRoots.flatMap((root) => violations(root, CORE_FORBIDDEN))
}

describe('fronteiras da fundação desktop', () => {
  it('renderer não tem acesso a Electron, Node, filesystem, IPC genérico ou rede', () => {
    expect(sourceFiles(rendererRoot).length).toBeGreaterThan(0)
    expect(violations(rendererRoot, RENDERER_FORBIDDEN)).toEqual([])
  })

  it('núcleo presente (contratos/domínio/aplicação) não depende de UI, Electron, Node, Chrome, infraestrutura ou rede', () => {
    expect(coreRoots.length).toBeGreaterThan(0)
    expect(coreRoots.flatMap((root) => sourceFiles(root)).length).toBeGreaterThan(0)
    expect(coreViolations()).toEqual([])
  })

  it('fixtures de violação são detectadas pelas regras estáticas do núcleo e do renderer', () => {
    const coreFixtures = [
      { source: "import { ref } from 'vue'", label: 'Vue' },
      { source: "import { defineStore } from 'pinia'", label: 'Pinia' },
      { source: "import { app } from 'electron'", label: 'Electron' },
      { source: "import { readFile } from 'node:fs'", label: 'Node' },
      { source: 'chrome.storage.local.get()', label: 'API Chrome' },
      { source: "import { store } from '../infrastructure/store.js'", label: 'infraestrutura' },
      { source: "fetch('https://example.invalid')", label: 'rede' },
    ]
    const rendererFixtures = [
      { source: "import { readFile } from 'node:fs'", label: 'Node/filesystem' },
      { source: "import { ipcRenderer } from 'electron'", label: 'Electron' },
      { source: "window.require('fs')", label: 'require/process/Buffer' },
      { source: "Buffer.from('secret')", label: 'require/process/Buffer' },
      { source: "fetch('https://example.invalid')", label: 'rede' },
      { source: 'browser.storage.local.get()', label: 'API Chrome' },
      { source: "import { store } from '../infrastructure/store.js'", label: 'infraestrutura' },
    ]

    for (const fixture of coreFixtures) {
      const labels = CORE_FORBIDDEN.filter(({ pattern }) => pattern.test(fixture.source)).map(({ label }) => label)
      expect(labels).toContain(fixture.label)
    }
    for (const fixture of rendererFixtures) {
      const labels = RENDERER_FORBIDDEN.filter(({ pattern }) => pattern.test(fixture.source)).map(({ label }) => label)
      expect(labels).toContain(fixture.label)
    }
  })
})
