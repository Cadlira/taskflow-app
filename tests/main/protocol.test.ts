import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isTrustedRendererUrl, parseAppAssetRequest, readPackagedAsset } from '../../src/main/protocol.js'

let roots: string[] = []

function createTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'taskflow-protocol-test-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
  roots = []
})

describe('protocolo de assets taskflow://app', () => {
  it('permite somente GET de assets conhecidos no host exato', () => {
    expect(parseAppAssetRequest('taskflow://app/', 'GET')).toEqual({
      assetPath: 'index.html',
      origin: 'taskflow://app',
    })
    expect(parseAppAssetRequest('taskflow://app/assets/app.js', 'GET')?.assetPath).toBe('assets/app.js')
    expect(parseAppAssetRequest('taskflow://app/assets/app.js', 'POST')).toBeNull()
    expect(parseAppAssetRequest('taskflow://other/assets/app.js', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app:80/assets/app.js', 'GET')).toBeNull()
    expect(parseAppAssetRequest('file:///C:/secret.txt', 'GET')).toBeNull()
  })

  it('recusa traversal codificado, host/paths absolutos, query, hash e barras invertidas', () => {
    expect(parseAppAssetRequest('taskflow://app/%2e%2e/secret.js', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app/%2e%2e%2fsecret.js', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app/C:/secret.js', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app/assets/app.js?file=secret', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app/assets/app.js#fragment', 'GET')).toBeNull()
    expect(parseAppAssetRequest('taskflow://app/assets%5csecret.js', 'GET')).toBeNull()
  })

  it('serve CSP estrita e bloqueia symlink que escape da raiz do renderer', async () => {
    const root = path.join(createTemporaryRoot(), 'renderer')
    const outside = path.join(createTemporaryRoot(), 'outside')
    mkdirSync(root, { recursive: true })
    mkdirSync(outside, { recursive: true })
    writeFileSync(path.join(root, 'index.html'), '<main>local</main>')
    writeFileSync(path.join(outside, 'escape.js'), 'secret')

    const response = await readPackagedAsset(root, 'index.html')
    expect(response?.status).toBe(200)
    expect(response?.headers.get('content-security-policy')).toContain("connect-src 'none'")
    expect(response?.headers.get('content-security-policy')).not.toContain('unsafe-inline')
    expect(await response?.text()).toContain('local')

    symlinkSync(outside, path.join(root, 'escape'), 'junction')
    expect(await readPackagedAsset(root, 'escape/escape.js')).toBeNull()
    expect(await readPackagedAsset(root, '../outside/escape.js')).toBeNull()
  })
})

describe('origem do renderer', () => {
  it('aceita somente a origem local autorizada e a origem empacotada', () => {
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173')).toBe(true)
    expect(isTrustedRendererUrl('http://127.0.0.1:5174/', 'http://127.0.0.1:5173')).toBe(false)
    expect(isTrustedRendererUrl('http://127.0.0.1.evil:5173/', 'http://127.0.0.1:5173')).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/', 'http://127.0.0.1:5173')).toBe(false)
    expect(isTrustedRendererUrl('taskflow://app/index.html', 'taskflow://app')).toBe(true)
    expect(isTrustedRendererUrl('taskflow://other/index.html', 'taskflow://app')).toBe(false)
  })
})
