import { describe, expect, it } from 'vitest'
import {
  INITIAL_REVISION,
  MAX_REVISION,
  formatRevision,
  isRevision,
  nextRevision,
  parseRevision,
} from '../../src/application/storage/revisions.js'
import {
  STORAGE_FAILURE_REASONS,
  StorageFailure,
  isStorageFailureReason,
  storageFailureReasonOf,
} from '../../src/application/storage/task-storage-error.js'

describe('revisões persistíveis', () => {
  it('avança de um em um sem depender de timestamp', () => {
    expect(INITIAL_REVISION).toBe(0n)
    expect(nextRevision(0n)).toBe(1n)
    expect(nextRevision(41n)).toBe(42n)
  })

  it('conserva valores acima da precisão inteira do JS', () => {
    const beyondSafe = BigInt(Number.MAX_SAFE_INTEGER) + 2n
    const text = formatRevision(beyondSafe)

    expect(text).toBe('9007199254740993')
    expect(BigInt(Number(text))).not.toBe(beyondSafe)
    expect(parseRevision(text)).toBe(beyondSafe)
    expect(nextRevision(beyondSafe)).toBe(beyondSafe + 1n)
  })

  it('falha no limite persistível, sem wrap nem reinício', () => {
    expect(formatRevision(MAX_REVISION)).toBe('9223372036854775807')
    expect(() => nextRevision(MAX_REVISION)).toThrowError(StorageFailure)
    try {
      nextRevision(MAX_REVISION)
    } catch (error) {
      expect(storageFailureReasonOf(error)).toBe('REVISION_EXHAUSTED')
    }
  })

  it('aceita somente a forma decimal canônica no transporte', () => {
    expect(parseRevision('0')).toBe(0n)
    expect(parseRevision('9223372036854775807')).toBe(MAX_REVISION)
    for (const invalid of ['', '01', '-1', '+1', '1.0', '1e3', ' 1', '9223372036854775808', '0x10', 1, 1n, null]) {
      expect(parseRevision(invalid)).toBeUndefined()
    }
  })

  it('reconhece somente inteiros não negativos de 64 bits', () => {
    expect(isRevision(0n)).toBe(true)
    expect(isRevision(MAX_REVISION)).toBe(true)
    expect(isRevision(-1n)).toBe(false)
    expect(isRevision(MAX_REVISION + 1n)).toBe(false)
    expect(isRevision(1)).toBe(false)
  })
})

describe('razões de erro portáveis', () => {
  it('são discriminantes fechados, lidos sem instanceof', () => {
    for (const reason of STORAGE_FAILURE_REASONS) {
      expect(isStorageFailureReason(reason)).toBe(true)
      // Objeto de outro realm/bundle: mesmo shape, outro protótipo.
      expect(storageFailureReasonOf({ name: 'StorageFailure', reason })).toBe(reason)
    }
    expect(isStorageFailureReason('ID_EXISTS')).toBe(false)
    expect(storageFailureReasonOf(new Error('C:\\Users\\x\\taskflow.sqlite'))).toBeUndefined()
    expect(storageFailureReasonOf({ name: 'StorageFailure', reason: 'OTHER' })).toBeUndefined()
    expect(storageFailureReasonOf(null)).toBeUndefined()
  })

  it('não carrega caminho, SQL, identificador ou payload na mensagem', () => {
    const failure = new StorageFailure('INCOMPATIBLE_DATA')
    expect(failure.message).toBe('storage failure: INCOMPATIBLE_DATA')
    expect(Object.keys(failure).sort()).toEqual(['name', 'reason'])
    expect('cause' in failure).toBe(false)
  })
})
