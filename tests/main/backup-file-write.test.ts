import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { captureDestinationFingerprint } from '../../src/main/backup/backup-destination.js'
import { writeBackupFile, type BackupWriteFaultPoint } from '../../src/main/backup/backup-file-write.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa007-write-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function destination(name: string): string {
  return join(workDir, name)
}

function temporaryFilesOf(directory: string): string[] {
  return readdirSync(directory).filter((entry) => entry.endsWith('.tmp'))
}

describe('writeBackupFile (B12)', () => {
  it('grava bytes completos, substitui e confirma por releitura, sem sobras', async () => {
    const file = destination('novo.json')
    const content = Buffer.from('{"format":"taskflow-backup"}', 'utf8')
    const result = await writeBackupFile({ destination: file, content, expectedFingerprint: undefined })
    expect(result).toEqual({ status: 'SAVED', bytes: content.length })
    expect(readFileSync(file).equals(content)).toBe(true)
    expect(temporaryFilesOf(workDir)).toEqual([])
  })

  it('substitui destino existente com fingerprint conferido e preserva em destinos idênticos', async () => {
    const file = destination('existente.json')
    writeFileSync(file, 'antigo')
    const fingerprint = await captureDestinationFingerprint(file)
    const result = await writeBackupFile({
      destination: file,
      content: Buffer.from('novo'),
      expectedFingerprint: fingerprint,
    })
    expect(result.status).toBe('SAVED')
    expect(readFileSync(file, 'utf8')).toBe('novo')
  })

  it('recusa destino alterado após a escolha sem sobrescrever nem deixar temporário', async () => {
    const file = destination('mudou.json')
    writeFileSync(file, 'versao-1')
    const fingerprint = await captureDestinationFingerprint(file)
    writeFileSync(file, 'versao-2-externa')
    const result = await writeBackupFile({
      destination: file,
      content: Buffer.from('backup'),
      expectedFingerprint: fingerprint,
    })
    expect(result).toEqual({ status: 'DESTINATION_CHANGED' })
    expect(readFileSync(file, 'utf8')).toBe('versao-2-externa')
    expect(temporaryFilesOf(workDir)).toEqual([])
  })

  it.each<[BackupWriteFaultPoint]>([['temp:before-write'], ['temp:after-write'], ['temp:after-sync'], ['rename:before']])(
    'falha em %s preserva o destino anterior, limpa o próprio temporário e não usa copy-delete',
    async (point) => {
      const file = destination(`falha-${point.replace(/[:]/g, '-')}.json`)
      writeFileSync(file, 'original')
      const fault = {
        at: (candidate: BackupWriteFaultPoint) => {
          if (candidate === point) throw new Error('fault')
        },
      }
      const result = await writeBackupFile({
        destination: file,
        content: Buffer.from('conteudo-novo'),
        expectedFingerprint: await captureDestinationFingerprint(file),
        faults: fault,
      })
      expect(result).toEqual({ status: 'FAILED', code: 'FILE_WRITE_FAILED' })
      expect(readFileSync(file, 'utf8')).toBe('original')
      expect(temporaryFilesOf(workDir)).toEqual([])
    },
  )

  it('falha depois da substituição vira aviso, sem segunda gravação nem rollback', async () => {
    const file = destination('aviso.json')
    const fault = {
      at: (candidate: BackupWriteFaultPoint) => {
        if (candidate === 'rename:after') throw new Error('fault')
      },
    }
    const result = await writeBackupFile({
      destination: file,
      content: Buffer.from('confirmado'),
      expectedFingerprint: undefined,
      faults: fault,
    })
    expect(result).toEqual({ status: 'SAVED_WITH_WARNING', bytes: 10 })
    expect(readFileSync(file, 'utf8')).toBe('confirmado')
  })

  it('falha de rename em destino inválido (diretório) preserva a pasta e limpa o temporário', async () => {
    const directory = destination('como-pasta')
    mkdirSync(directory)
    const result = await writeBackupFile({
      destination: directory,
      content: Buffer.from('x'),
      expectedFingerprint: undefined,
    })
    expect(result).toEqual({ status: 'FAILED', code: 'FILE_WRITE_FAILED' })
    expect(existsSync(directory)).toBe(true)
    expect(temporaryFilesOf(workDir)).toEqual([])
  })

  it('releitura detecta alteração externa imediatamente posterior e emite aviso', async () => {
    const file = destination('alterado-pos.json')
    const fault = {
      at: (candidate: BackupWriteFaultPoint) => {
        // Simula um terceiro alterando o arquivo entre o rename e a releitura.
        if (candidate === 'readback:before') writeFileSync(file, 'outro-conteudo')
      },
    }
    const result = await writeBackupFile({
      destination: file,
      content: Buffer.from('meu-conteudo'),
      expectedFingerprint: undefined,
      faults: fault,
    })
    expect(result.status).toBe('SAVED_WITH_WARNING')
    expect(readFileSync(file, 'utf8')).toBe('outro-conteudo')
  })
})
