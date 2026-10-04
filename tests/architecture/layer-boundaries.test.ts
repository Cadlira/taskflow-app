import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const rendererRoot = path.join(projectRoot, 'src', 'renderer', 'src')
const preloadRoot = path.join(projectRoot, 'src', 'preload')
const mainRoot = path.join(projectRoot, 'src', 'main')
const coreRoots = ['contracts', 'domain', 'application']
  .map((layer) => path.join(projectRoot, 'src', layer))
  .filter(existsSync)

// Qualquer módulo embutido do Node, com ou sem prefixo `node:`, inclusive `node:sqlite`,
// em import estático, import dinâmico ou require.
const NODE_BUILTIN =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:[^'"]+|(?:fs|path|child_process|os|crypto|url|sqlite|worker_threads|net|http|https|stream|module|vm|util|events|buffer|process)(?:\/[^'"]*)?)['"]/

const RENDERER_FORBIDDEN = [
  { label: 'Electron', pattern: /from\s*['"]electron['"]/ },
  { label: 'Node/filesystem', pattern: NODE_BUILTIN },
  { label: 'main/preload', pattern: /from\s*['"][^'"]*\/(?:main|preload)\/[^'"]*['"]/ },
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
  { label: 'Node', pattern: NODE_BUILTIN },
  { label: 'globais Node', pattern: /\b(?:require\s*\(|process\s*\.|Buffer\b|__dirname|__filename)/ },
  { label: 'main/preload/renderer', pattern: /from\s*['"][^'"]*\/(?:main|preload|renderer)\/[^'"]*['"]/ },
  { label: 'API Chrome', pattern: /\b(?:browser|chrome)\.[a-zA-Z]/ },
  { label: 'infraestrutura', pattern: /from\s*['"][^'"]*\/(?:infrastructure|adapters)(?:\/|['"])/ },
  { label: 'rede', pattern: /\b(?:fetch|WebSocket|XMLHttpRequest|EventSource)\s*\(/ },
]

// O preload só pode falar com o Electron e com o núcleo portável.
const PRELOAD_FORBIDDEN = [
  { label: 'Node', pattern: NODE_BUILTIN },
  { label: 'main/renderer', pattern: /from\s*['"][^'"]*\/(?:main|renderer)\/[^'"]*['"]/ },
  { label: 'IPC livre', pattern: /ipcRenderer\.(?:send|sendSync|postMessage|sendToHost)\b/ },
]

type Rule = { label: string; pattern: RegExp }

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filename)
    return /\.(?:ts|vue)$/.test(entry.name) ? [filename] : []
  })
}

function violations(directory: string, forbidden: Rule[]): string[] {
  return sourceFiles(directory).flatMap((filename) => {
    const content = readFileSync(filename, 'utf8')
    return forbidden.filter(({ pattern }) => pattern.test(content)).map(({ label }) => `${filename} → ${label}`)
  })
}

function coreViolations(): string[] {
  return coreRoots.flatMap((root) => violations(root, CORE_FORBIDDEN))
}

function relative(filename: string): string {
  return path.relative(projectRoot, filename).split(path.sep).join('/')
}

function labelsFor(rules: Rule[], source: string): string[] {
  return rules.filter(({ pattern }) => pattern.test(source)).map(({ label }) => label)
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

  it('núcleo portável inclui domínio e aplicação reais, não só contratos', () => {
    expect(coreRoots.map((root) => path.basename(root)).sort()).toEqual(['application', 'contracts', 'domain'])
    for (const root of coreRoots) expect(sourceFiles(root).length).toBeGreaterThan(0)
  })

  it('preload não importa Node, main ou renderer e não usa IPC livre', () => {
    expect(sourceFiles(preloadRoot).length).toBeGreaterThan(0)
    expect(violations(preloadRoot, PRELOAD_FORBIDDEN)).toEqual([])
  })

  it('node:sqlite só é importado pelo adapter de armazenamento do main e pela prova da fundação', () => {
    const importers = sourceFiles(path.join(projectRoot, 'src'))
      .filter((filename) => /['"]node:sqlite['"]/.test(readFileSync(filename, 'utf8')))
      .map(relative)
      .sort()

    expect(importers).toEqual(['src/main/foundation-proof.ts', 'src/main/storage/product-database.ts'])
  })

  it('a conexão de produto só é usada pelo coordenador, pela composição e pelo harness restrito', () => {
    const users = sourceFiles(mainRoot)
      .filter((filename) => /\bProductDatabase\b/.test(readFileSync(filename, 'utf8')))
      .map(relative)
      .sort()

    expect(users).toEqual([
      'src/main/harness/product-harness.ts',
      'src/main/index.ts',
      'src/main/storage/coordinator.ts',
      'src/main/storage/product-database.ts',
    ])
    // O IPC de estado só conhece a leitura coordenada: sem conexão, escrita ou Electron.
    const stateIpc = readFileSync(path.join(mainRoot, 'ipc', 'state.ts'), 'utf8')
    expect(stateIpc).not.toMatch(/node:|ProductDatabase|storage\.run\(|writeRow|saveTask|from\s*['"]electron['"]/)
  })

  it('renderer não detém autoridade de armazenamento, writer, SQL, canais ou opener', () => {
    const authorityRules: Rule[] = [
      {
        label: 'armazenamento',
        pattern: /StorageCoordinator|TaskStorageUnit|ProductDatabase|updateTaskConditionally|replaceAllTasks|moveToTrash/,
      },
      { label: 'SQLite', pattern: /node:sqlite/ },
      { label: 'IPC bruto', pattern: /\bipcRenderer\b/ },
      { label: 'opener', pattern: /shell\.openExternal/ },
    ]
    const sources = sourceFiles(rendererRoot)
    expect(sources.length).toBeGreaterThan(0)
    expect(violations(rendererRoot, authorityRules)).toEqual([])
    // Fixtures negativas: o detector reconhece cada forma de autoridade indevida.
    for (const source of [
      'const unit: TaskStorageUnit = {} as never',
      "import { DatabaseSync } from 'node:sqlite'",
      "import { ipcRenderer } from 'electron'",
      'await shell.openExternal(href)',
    ]) {
      expect(labelsFor(authorityRules, source).length).toBeGreaterThan(0)
    }
  })

  it('preload fala somente com o Electron e o núcleo portável: sem shell, SQLite, filesystem ou canais livres', () => {
    const preload = readFileSync(path.join(preloadRoot, 'index.ts'), 'utf8')
    expect(preload).not.toMatch(/\bshell\b|node:sqlite|node:fs|ipcRenderer\.(?:send|sendSync|postMessage|sendToHost)\b/)
  })

  it('fixtures de violação são detectadas pelas regras estáticas do núcleo, do renderer e do preload', () => {
    const coreFixtures = [
      { source: "import { ref } from 'vue'", label: 'Vue' },
      { source: "import { defineStore } from 'pinia'", label: 'Pinia' },
      { source: "import { app } from 'electron'", label: 'Electron' },
      { source: "import { readFile } from 'node:fs'", label: 'Node' },
      { source: "import { DatabaseSync } from 'node:sqlite'", label: 'Node' },
      { source: "import { Worker } from 'node:worker_threads'", label: 'Node' },
      { source: "import path from 'path'", label: 'Node' },
      { source: "const sqlite = await import('node:sqlite')", label: 'Node' },
      { source: "const fs = require('fs')", label: 'Node' },
      { source: "Buffer.byteLength('x')", label: 'globais Node' },
      { source: "process.env['HOME']", label: 'globais Node' },
      { source: "import { coordinator } from '../../main/storage/coordinator.js'", label: 'main/preload/renderer' },
      { source: 'chrome.storage.local.get()', label: 'API Chrome' },
      { source: "import { store } from '../infrastructure/store.js'", label: 'infraestrutura' },
      { source: "fetch('https://example.invalid')", label: 'rede' },
    ]
    const rendererFixtures = [
      { source: "import { readFile } from 'node:fs'", label: 'Node/filesystem' },
      { source: "import { DatabaseSync } from 'node:sqlite'", label: 'Node/filesystem' },
      { source: "import { open } from '../../main/storage/product-database.js'", label: 'main/preload' },
      { source: "import { ipcRenderer } from 'electron'", label: 'Electron' },
      { source: "window.require('fs')", label: 'require/process/Buffer' },
      { source: "Buffer.from('secret')", label: 'require/process/Buffer' },
      { source: "fetch('https://example.invalid')", label: 'rede' },
      { source: 'browser.storage.local.get()', label: 'API Chrome' },
      { source: "import { store } from '../infrastructure/store.js'", label: 'infraestrutura' },
    ]
    const preloadFixtures = [
      { source: "import { DatabaseSync } from 'node:sqlite'", label: 'Node' },
      { source: "import { coordinator } from '../main/storage/coordinator.js'", label: 'main/renderer' },
      { source: "ipcRenderer.send('any-channel', payload)", label: 'IPC livre' },
    ]

    for (const fixture of coreFixtures) expect(labelsFor(CORE_FORBIDDEN, fixture.source)).toContain(fixture.label)
    for (const fixture of rendererFixtures) expect(labelsFor(RENDERER_FORBIDDEN, fixture.source)).toContain(fixture.label)
    for (const fixture of preloadFixtures) expect(labelsFor(PRELOAD_FORBIDDEN, fixture.source)).toContain(fixture.label)
  })

  it('fixtures negativas: código portável legítimo não dispara o detector', () => {
    const allowed = [
      "import type { Task } from '../../domain/task.js'",
      "import { utf8ByteLength } from '../../contracts/text.js'",
      'const processedFor = reminder.processedFor',
      "const description = 'usa buffer de invalidações e fila de processos'",
      "import { createStateClient } from '../application/state/state-client.js'",
    ]
    for (const source of allowed) {
      expect(labelsFor(CORE_FORBIDDEN, source)).toEqual([])
      expect(labelsFor(PRELOAD_FORBIDDEN, source)).toEqual([])
    }
  })
})
