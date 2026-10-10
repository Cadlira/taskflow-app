// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createSmokeEnvironment, PROD_SENTINEL } from '../../scripts/smoke-environment.mjs'

// Teste de EFEITOS do isolamento do smoke: observa o ambiente/efeito real de um processo
// filho lançado com o mesmo ambiente dos filhos do smoke, além das invariantes de layout.
// Não substitui a execução do smoke; comprova que o ambiente passado não aponta para o
// perfil pessoal e que os efeitos de um filho ficam somente sob as fixtures.
const createdRoots: string[] = []
const makeRoot = (): string => {
  const root = path.join(os.tmpdir(), `tfa012-isolation-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  createdRoots.push(root)
  return root
}
afterEach(() => {
  for (const root of createdRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('isolamento do smoke: layout e ambiente de launch (task 3.2)', () => {
  it('calcula todos os paths sob o smokeRoot e recusa root relativo', () => {
    const root = makeRoot()
    const layout = createSmokeEnvironment(root)
    for (const [name, value] of Object.entries(layout)) {
      if (name === 'childEnvironment') continue
      const relative = path.relative(root, value as string)
      expect(relative.startsWith('..'), `${name} escapou do root`).toBe(false)
      expect(path.isAbsolute(relative)).toBe(false)
    }
    expect(() => createSmokeEnvironment('relative/root')).toThrow('SMOKE_ROOT_NOT_ABSOLUTE')
  })

  it('entrega LOCALAPPDATA fictício e nunca o do perfil pessoal', () => {
    const root = makeRoot()
    const layout = createSmokeEnvironment(root)
    expect(layout.childEnvironment.LOCALAPPDATA).toBe(layout.localAppData)
    expect(layout.childEnvironment.TASKFLOW_PROFILE).toBe('dev')
    expect(layout.childEnvironment.ELECTRON_RENDERER_URL).toBe('http://127.0.0.1:9/')
    const real = process.env['LOCALAPPDATA']
    if (real !== undefined) {
      expect(layout.childEnvironment['LOCALAPPDATA']).not.toBe(real)
      // O root fictício fica no diretório temporário aprovado; nunca na árvore do perfil real.
      expect(layout.localAppData.startsWith(path.join(real, 'TaskFlowApp'))).toBe(false)
    }
  })

  it('processo filho lançado com esse ambiente escreve somente sob as fixtures', () => {
    const root = makeRoot()
    const layout = createSmokeEnvironment(root)
    mkdirSync(layout.prodProfileRoot, { recursive: true })
    writeFileSync(layout.prodSentinelFile, `${JSON.stringify(PROD_SENTINEL)}\n`)
    const script = [
      "const fs = require('node:fs'); const path = require('node:path');",
      "const root = process.env.LOCALAPPDATA;",
      "const markerDir = path.join(root, 'marker');",
      "fs.mkdirSync(markerDir, { recursive: true });",
      "fs.writeFileSync(path.join(markerDir, 'fixture.txt'), 'TFA012-EFFECTS');",
      "process.stdout.write(JSON.stringify({ localAppData: root, marker: path.join(markerDir, 'fixture.txt') }));",
    ].join('\n')
    const child = spawnSync(process.execPath, ['-e', script], {
      env: { ...layout.childEnvironment, SystemRoot: process.env['SystemRoot'], PATH: process.env['PATH'] },
      encoding: 'utf8',
      windowsHide: true,
    })
    expect(child.status).toBe(0)
    const observed = JSON.parse(child.stdout) as { localAppData: string; marker: string }
    expect(observed.localAppData).toBe(layout.localAppData)
    expect(existsSync(observed.marker)).toBe(true)
    expect(observed.marker.startsWith(root)).toBe(true)
    // O efeito observado no root é somente o esperado: sentinela prod + fixture do filho.
    expect(readdirSync(layout.localAppData).sort()).toEqual(['TaskFlowApp', 'marker'])
    expect(readdirSync(layout.prodProfileRoot)).toEqual(['sentinel.json'])
  })
})
