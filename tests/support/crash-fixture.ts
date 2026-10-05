// Fixture compartilhada entre o teste de interrupção e o processo filho.
import { PRODUCT_V1_DEFINITION } from '../../src/main/storage/product-schema.js'

export const CRASH_CLAIM = { taskId: 'claim-000001', reminderId: 'claim-000001-r2' }

/** Definição de origem (SQL 1) para semear perfis fictícios antes da migração real 1→2. */
export const CRASH_V1_DEFINITION = PRODUCT_V1_DEFINITION
