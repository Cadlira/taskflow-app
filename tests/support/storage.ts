import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { UnitResult } from '../../src/application/storage/unit-of-work.js'
import type { Revision } from '../../src/application/storage/revisions.js'
import { StorageCoordinator, type CoordinatorOptions } from '../../src/main/storage/coordinator.js'
import {
  ProductDatabase,
  type StorageDefinition,
  type StorageFaults,
} from '../../src/main/storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from '../../src/main/storage/product-schema.js'

// Tudo aqui usa diretórios temporários e dados fictícios; nenhum perfil real é tocado.

const temporaryRoots: string[] = []
const coordinators: StorageCoordinator[] = []

export function createTempRoot(prefix = 'taskflow-product-test-'): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

export function productFileIn(root: string): string {
  return path.join(root, 'user-data', 'data', 'taskflow.sqlite')
}

export function createProductFile(): string {
  return productFileIn(createTempRoot())
}

export interface OpenCoordinatorOptions {
  definition?: StorageDefinition
  faults?: StorageFaults
  limits?: CoordinatorOptions['limits']
  now?: () => number
  schedule?: CoordinatorOptions['schedule']
  onDiagnostic?: CoordinatorOptions['onDiagnostic']
}

/** Coordenador sobre um arquivo temporário, já aberto; fechado automaticamente no cleanup. */
export function openCoordinator(file: string, options: OpenCoordinatorOptions = {}): StorageCoordinator {
  const coordinator = new StorageCoordinator({
    open: () => ProductDatabase.open(file, options.definition ?? PRODUCT_STORAGE_DEFINITION, options.faults),
    ...(options.faults !== undefined && { faults: options.faults }),
    ...(options.limits !== undefined && { limits: options.limits }),
    ...(options.now !== undefined && { now: options.now }),
    ...(options.schedule !== undefined && { schedule: options.schedule }),
    ...(options.onDiagnostic !== undefined && { onDiagnostic: options.onDiagnostic }),
  })
  coordinators.push(coordinator)
  coordinator.start()
  return coordinator
}

export function expectOk<T>(result: UnitResult<T>): { value: T; committed: boolean; revision: Revision } {
  if (!result.ok) throw new Error(`expected a successful unit, got ${result.reason}`)
  return result
}

export function failureReason(result: UnitResult<unknown>): string {
  if (result.ok) throw new Error('expected a failed unit')
  return result.reason
}

export function cleanupStorage(): void {
  for (const coordinator of coordinators.splice(0)) {
    try {
      coordinator.shutdown()
    } catch {
      // O teste já terminou; a pasta temporária é removida a seguir.
    }
  }
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}
