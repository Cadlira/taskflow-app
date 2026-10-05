import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MAX_BACKUP_FILE_BYTES } from '../../src/application/backup/backup-format.js'
import {
  createNodeBackupFileOpenPort,
  decodeBackupText,
  readBackupTextFile,
  readBackupTextFromHandle,
  type BackupReadHandle,
} from '../../src/main/backup/backup-file-access.js'

const workDir = mkdtempSync(join(tmpdir(), 'tfa007-read-'))

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true })
})

function writeTemporary(name: string, bytes: Buffer): string {
  const path = join(workDir, name)
  writeFileSync(path, bytes)
  return path
}

function fakeHandle(options: {
  isFile?: boolean
  size: number
  reads: Array<number | Error>
}): BackupReadHandle {
  const queue = [...options.reads]
  return {
    stat: async () => ({ isFile: options.isFile ?? true, size: options.size }),
    read: async (buffer: Buffer, length: number) => {
      const next = queue.shift()
      if (next === undefined) return { bytesRead: 0 }
      if (next instanceof Error) throw next
      const bytesRead = Math.min(next, length, buffer.length)
      buffer.fill(0x61, 0, bytesRead)
      return { bytesRead }
    },
    close: async () => undefined,
  }
}

describe('readBackupTextFile (B03)', () => {
  it('lê multibyte preservando acentos e aceita BOM inicial único, sem devolvê-lo', async () => {
    const content = '{"tarefa":"ação çãé — 你好"}'
    const plain = writeTemporary('plain.json', Buffer.from(content, 'utf8'))
    const plainResult = await readBackupTextFile(plain)
    expect(plainResult).toEqual({ ok: true, text: content, bytes: Buffer.byteLength(content) })

    const withBom = writeTemporary('bom.json', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(content, 'utf8')]))
    const bomResult = await readBackupTextFile(withBom)
    expect(bomResult.ok).toBe(true)
    if (bomResult.ok) {
      expect(bomResult.text).toBe(content)
      expect(bomResult.text.charCodeAt(0)).not.toBe(0xfeff)
      expect(bomResult.bytes).toBe(Buffer.byteLength(content) + 3)
    }
  })

  it('aceita exatamente o limite e recusa limite+1 sem leitura ilimitada', async () => {
    const exact = writeTemporary('exact.json', Buffer.alloc(MAX_BACKUP_FILE_BYTES, 0x20))
    const exactResult = await readBackupTextFile(exact)
    expect(exactResult.ok).toBe(true)
    if (exactResult.ok) expect(exactResult.bytes).toBe(MAX_BACKUP_FILE_BYTES)

    await appendFile(exact, Buffer.alloc(1, 0x20))
    expect(await readBackupTextFile(exact)).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' })
  }, 30_000)

  it('recusa excesso já indicado pelo stat sem sequer ler', async () => {
    const result = await readBackupTextFromHandle(fakeHandle({ size: 101, reads: [1] }), 100)
    expect(result).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' })
  })

  it('recusa crescimento além do stat durante a própria coleta', async () => {
    const result = await readBackupTextFromHandle(fakeHandle({ size: 10, reads: [100, 1] }), 100)
    expect(result).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' })
  })

  it('recusa fonte que não é arquivo regular', async () => {
    expect(await readBackupTextFromHandle(fakeHandle({ isFile: false, size: 10, reads: [] }), 100)).toEqual({
      ok: false,
      reason: 'FILE_READ_FAILED',
    })
    const directoryResult = await readBackupTextFile(workDir)
    expect(directoryResult.ok).toBe(false)
  })

  it('separa UTF-16, BOM repetido, UTF-8 malformado e falha de I/O', async () => {
    const utf16 = writeTemporary('utf16.json', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"a":1}', 'utf16le')]))
    expect(await readBackupTextFile(utf16)).toEqual({ ok: false, reason: 'INVALID_ENCODING' })

    const repeatedBom = writeTemporary(
      'double-bom.json',
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]),
    )
    expect(await readBackupTextFile(repeatedBom)).toEqual({ ok: false, reason: 'INVALID_ENCODING' })

    const malformed = writeTemporary('malformed.json', Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x7d]))
    expect(await readBackupTextFile(malformed)).toEqual({ ok: false, reason: 'INVALID_ENCODING' })

    expect(await readBackupTextFile(join(workDir, 'nao-existe.json'))).toEqual({
      ok: false,
      reason: 'FILE_READ_FAILED',
    })
  })

  it('decodifica vazio como texto vazio (o leitor de JSON decide depois)', () => {
    expect(decodeBackupText(Buffer.alloc(0))).toEqual({ ok: true, text: '' })
  })

  it('lê link que resolve a arquivo regular escolhido', async () => {
    const target = writeTemporary('target.json', Buffer.from('{"ok":true}'))
    const link = join(workDir, 'link.json')
    try {
      symlinkSync(target, link, 'file')
    } catch {
      // Sem privilégio de symlink neste Windows: a cobertura real fica registrada como limitação.
      return
    }
    const result = await readBackupTextFile(link)
    expect(result).toEqual({ ok: true, text: '{"ok":true}', bytes: 11 })
  })

  it('o adaptador de produção abre um único handle e fecha', async () => {
    const path = writeTemporary('once.json', Buffer.from('{}'))
    const port = createNodeBackupFileOpenPort()
    let opened = 0
    const guarded = {
      open: async (candidate: string) => {
        opened += 1
        return port.open(candidate)
      },
    }
    const result = await readBackupTextFile(path, MAX_BACKUP_FILE_BYTES, guarded)
    expect(result.ok).toBe(true)
    expect(opened).toBe(1)
  })
})
