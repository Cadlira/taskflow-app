// Processo de teste exclusivamente fictício para as provas de interrupção (P03).
// Recebe um banco em diretório temporário, executa uma unidade e fica parado numa barreira
// identificada até ser encerrado pelo teste, que valida o PID antes de matar. Nunca abre
// perfil real nem recebe caminho fora do diretório temporário do próprio teste.
import { writeFileSync } from 'node:fs'
import { buildFictitiousTasks } from '../../src/main/harness/fixtures.js'
import { StorageCoordinator } from '../../src/main/storage/coordinator.js'
import { ProductDatabase, type StorageFaultPoint, type StorageFaults } from '../../src/main/storage/product-database.js'
import { PRODUCT_STORAGE_DEFINITION } from '../../src/main/storage/product-schema.js'
import { CRASH_CLAIM } from './crash-fixture.js'
import { processReminder } from '../../src/main/reminders/processor.js'

async function main(): Promise<void> {
  const [file, point, unit, barrierFile, processedFor] = process.argv.slice(2)
  if (file === undefined || point === undefined || unit === undefined || barrierFile === undefined) {
    process.exit(2)
  }

  const faults: StorageFaults = {
    at: (reached) => {
      if (reached !== (point as StorageFaultPoint)) return
      writeFileSync(barrierFile, JSON.stringify({ pid: process.pid, point: reached }))
      // Barreira: parado aqui, com a transação no estado do ponto, até ser encerrado.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
    },
  }

  if (unit === 'migrate') {
    // Migração real do produto 1→2 sobre o perfil fictício semeado em SQL 1.
    const result = ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION, faults)
    if (result.ok) result.database.close()
  } else {
    const coordinator = new StorageCoordinator({
      open: () => ProductDatabase.open(file, PRODUCT_STORAGE_DEFINITION, faults),
      faults,
    })
    coordinator.start()
    if (unit === 'reminder') {
      let attempts = 0
      const stop = (phase: string): void => {
        if (point !== phase) return
        writeFileSync(barrierFile, JSON.stringify({ pid: process.pid, point, attempts }))
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
      }
      await processReminder(coordinator, { ...CRASH_CLAIM, triggerISO: processedFor ?? '' }, {
        ready: () => true, epoch: () => 1, now: () => new Date(processedFor ?? ''),
        completed: () => undefined, report: () => undefined,
      }, {
        valid: () => true, release: () => undefined,
        submit: () => { stop('reminder:before-submit'); attempts++; stop('reminder:after-submit') },
      })
    } else if (unit === 'claim') {
      await coordinator.run((target) =>
        target.claimReminderOccurrence({ ...CRASH_CLAIM, processedFor: processedFor ?? '' }),
      )
    } else {
      // Unidade grande o bastante para o motor gravar páginas e journal antes do commit.
      await coordinator.run((target) =>
        target.saveTasks(buildFictitiousTasks(300, { idPrefix: 'crash', descriptionLength: 6000 })),
      )
    }
  }

  // Só chega aqui se a barreira não foi alcançada.
  writeFileSync(barrierFile, JSON.stringify({ pid: process.pid, point, reached: false }))
  process.exit(0)
}

void main()
