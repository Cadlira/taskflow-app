import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  captureDestinationFingerprint,
  checkBackupDestination,
  isReservedWindowsTarget,
  sameDestinationFingerprint,
} from '../../src/main/backup/backup-destination.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa007-dest-'))
const protectedRoot = join(workDir, 'userData')
mkdirSync(protectedRoot, { recursive: true })
mkdirSync(join(workDir, 'protect-2'), { recursive: true })

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('checkBackupDestination (B04/B12)', () => {
  it('recusa nomes reservados e caminhos de dispositivo', () => {
    expect(isReservedWindowsTarget(join(workDir, 'CON.txt'))).toBe(true)
    expect(isReservedWindowsTarget(join(workDir, 'nul'))).toBe(true)
    expect(isReservedWindowsTarget('\\\\.\\pipe\\x')).toBe(true)
    expect(isReservedWindowsTarget(join(workDir, 'normal.json'))).toBe(false)
  })

  it('aceita destino comum e informa se já existia', async () => {
    const file = join(workDir, 'livre', 'b.json')
    mkdirSync(join(workDir, 'livre'), { recursive: true })
    const before = await checkBackupDestination(file, { protectedRoots: [protectedRoot] })
    expect(before).toEqual({ ok: true, destination: file, existed: false })
    writeFileSync(file, '{}')
    const after = await checkBackupDestination(file, { protectedRoots: [protectedRoot] })
    expect(after.ok).toBe(true)
    if (after.ok) expect(after.existed).toBe(true)
  })

  it('recusa destinos dentro das raízes internas e não confunde diretório irmão', async () => {
    const inside = await checkBackupDestination(join(protectedRoot, 'data', 'taskflow.sqlite'), {
      protectedRoots: [protectedRoot],
    })
    expect(inside).toEqual({ ok: false, code: 'DESTINATION_NOT_ALLOWED' })

    const sibling = await checkBackupDestination(join(workDir, 'protect-2', 'ok.json'), {
      protectedRoots: [protectedRoot],
    })
    expect(sibling.ok).toBe(true)
  })

  it('recusa destino que seja symlink conhecido', async () => {
    const target = join(workDir, 'target.json')
    writeFileSync(target, '{}')
    const link = join(workDir, 'link.json')
    try {
      symlinkSync(target, link, 'file')
    } catch {
      return
    }
    expect(await checkBackupDestination(link, { protectedRoots: [] })).toEqual({
      ok: false,
      code: 'DESTINATION_NOT_ALLOWED',
    })
  })

  it('captura e compara fingerprint observável', async () => {
    const file = join(workDir, 'fingerprint.json')
    writeFileSync(file, 'a')
    const first = await captureDestinationFingerprint(file)
    expect(first).toBeDefined()
    expect(await captureDestinationFingerprint(join(workDir, 'ausente.json'))).toBeUndefined()
    expect(sameDestinationFingerprint(first, first)).toBe(true)
    writeFileSync(file, 'bb')
    const second = await captureDestinationFingerprint(file)
    expect(sameDestinationFingerprint(first, second)).toBe(false)
    expect(sameDestinationFingerprint(undefined, undefined)).toBe(true)
  })
})
