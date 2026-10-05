<script setup lang="ts">
// Área de Backup (TFA-007): exportar todas as tarefas e importar um backup com prévia imutável,
// confirmação irreversível e conferência. Usa a inscrição existente e o contexto do store; nenhum
// path/JSON/Task é recebido do main. Foco segue título/seletor/alerta/Voltar e busy permanece
// focável com aria-disabled, sem dupla ação.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { BackupErrorCode, BackupFailure, PrepareBackupRestoreAck } from '../../../../contracts/backup.js'
import { BACKUP_PREVIEW_TTL_MS } from '../../../../contracts/backup.js'
import type { BackupIssue } from '../../../../application/backup/backup-issues.js'
import { useTasksStore } from '../../stores/tasks.js'
import { formatDateTime } from '../tasks/date-time.js'

const store = useTasksStore()
const emit = defineEmits<{ back: [] }>()

type Phase = 'idle' | 'previewing' | 'preview' | 'confirm' | 'restoring' | 'success'
type BackupPreview = Extract<PrepareBackupRestoreAck, { status: 'ok' }>

const phase = ref<Phase>('idle')
const preview = ref<BackupPreview | null>(null)
const feedback = ref<{ tone: 'success' | 'warning' | 'error'; text: string } | null>(null)
const actionError = ref<string | null>(null)
const issueLines = ref<string[]>([])
const previewStale = ref<string | null>(null)
const exportedOutcome = ref<'area' | 'preview' | null>(null)
const lastExport = ref<{ outcome: 'SAVED' | 'SAVED_WITH_WARNING'; taskCount: number } | null>(null)

const titleElement = ref<HTMLElement | null>(null)
const alertElement = ref<HTMLElement | null>(null)
const successElement = ref<HTMLElement | null>(null)
const selectorButton = ref<HTMLButtonElement | null>(null)
const exportButton = ref<HTMLButtonElement | null>(null)
const confirmTrigger = ref<HTMLButtonElement | null>(null)
const confirmPanel = ref<HTMLElement | null>(null)

const busy = computed(() => phase.value === 'previewing' || phase.value === 'restoring')
const previewLocked = computed(() => previewStale.value !== null)

watch(titleElement, (element) => element?.focus())
watch(successElement, (element) => element?.focus())

onMounted(async () => {
  await nextTick()
  titleElement.value?.focus()
})

// Barreiras visíveis: outra importação/recuperação ou churn da base invalidam a confirmação.
watch(
  () => store.undoEpoch,
  (value, previous) => {
    if (preview.value === null) return
    if (previous !== undefined && value !== undefined && value > previous && !busy.value) {
      previewStale.value = 'Outra restauração foi confirmada nesta janela; esta prévia não pode ser confirmada. Selecione o arquivo novamente.'
    }
  },
)
watch(
  () => store.stale,
  (value) => {
    if (value && preview.value !== null) {
      previewStale.value = 'Os dados locais podem estar desatualizados; aguarde a reconciliação antes de confirmar.'
    }
  },
)
watch(
  () => store.revision,
  (value, previous) => {
    if (preview.value === null || value === previous) return
    if (previewStale.value === null) {
      previewStale.value = 'Os dados locais mudaram depois da prévia; selecione o arquivo novamente para revisar os números.'
    }
  },
)

const FIELD_LABELS: Record<string, string> = {
  task: 'registro',
  id: 'identificador',
  title: 'título',
  description: 'descrição',
  requester: 'solicitante',
  assignee: 'responsável',
  status: 'status',
  priority: 'prioridade',
  dueAt: 'prazo',
  reminders: 'lembretes',
  seriesId: 'série',
  recurrence: 'recorrência',
  subtasks: 'subtarefas',
  tags: 'tags',
  sourceUrl: 'origem',
  createdAt: 'criação',
  updatedAt: 'atualização',
  completedAt: 'conclusão',
}

const CODE_LABELS: Record<string, string> = {
  REQUIRED: 'obrigatório',
  INVALID_VALUE: 'valor inválido',
  TOO_LONG: 'texto longo demais',
  TOO_MANY: 'itens demais',
  INVALID_DATE: 'data inválida',
  INVALID_URL: 'URL inválida',
  DUPLICATE: 'repetido',
}

function issueText(issue: BackupIssue, index: number): string {
  const parts = [`Problema ${index + 1}: tarefa ${issue.taskIndex + 1}`, FIELD_LABELS[issue.field] ?? issue.field]
  if (issue.reminderIndex !== undefined) parts.push(`lembrete ${issue.reminderIndex + 1}`)
  if (issue.subtaskIndex !== undefined) parts.push(`subtarefa ${issue.subtaskIndex + 1}`)
  parts.push(CODE_LABELS[issue.code] ?? issue.code)
  return parts.join(' · ')
}

function errorText(code: BackupErrorCode): string {
  const messages: Partial<Record<BackupErrorCode, string>> = {
    BUSY: 'Outra operação de backup está em andamento; aguarde a conclusão.',
    SESSION_CLOSED: 'A janela foi recarregada; tente novamente.',
    STALE_CONTEXT: 'A ação ficou desatualizada por outra operação; tente novamente.',
    STORAGE_UNAVAILABLE: 'O armazenamento local está indisponível. Nenhum dado foi redefinido.',
    INCOMPATIBLE_DATA: 'Os dados locais estão em uma versão incompatível; nada foi alterado.',
    CORRUPTED_DATA: 'Os dados locais não puderam ser lidos; nada foi alterado.',
    RESOURCE_LIMIT: 'A operação excedeu os recursos locais reservados para backup.',
    FILE_TOO_LARGE: 'O arquivo excede o limite de 20 MiB do aplicativo; nada foi alterado.',
    FILE_READ_FAILED: 'Não foi possível ler o arquivo selecionado; nada foi alterado.',
    INVALID_ENCODING: 'O arquivo não está em UTF-8 válido; nada foi importado.',
    INVALID_JSON: 'O arquivo não contém JSON válido; nada foi importado.',
    NOT_TASKFLOW_BACKUP: 'O arquivo não é um backup TaskFlow; nada foi importado.',
    INVALID_FORMAT_VERSION: 'A versão do arquivo de backup não é reconhecida; nada foi importado.',
    NEWER_FORMAT_VERSION: 'O arquivo foi gerado por uma versão mais nova do aplicativo; atualize o app e tente novamente.',
    INVALID_STRUCTURE: 'A estrutura do arquivo está incompleta ou inválida; nada foi importado.',
    INVALID_TASKS: 'O arquivo contém registros inválidos; nada foi importado.',
    LOCAL_DATA_NOT_EXPORTABLE: 'Há dados locais que o formato de backup não aceita. Nada foi exportado e os dados permanecem intactos.',
    FILE_WRITE_FAILED: 'Não foi possível gravar o arquivo; o arquivo anterior foi preservado.',
    DESTINATION_CHANGED: 'O arquivo de destino mudou durante a exportação; nada foi sobrescrito.',
    DESTINATION_NOT_ALLOWED: 'O destino escolhido pertence ao aplicativo ou não é permitido; escolha outra pasta.',
    BACKUP_PREVIEW_INVALID: 'A prévia não é mais válida; selecione o arquivo novamente.',
    BACKUP_PREVIEW_EXPIRED: 'A prévia expirou após 5 minutos; selecione o arquivo novamente.',
    BACKUP_BASE_CHANGED: 'Os dados locais mudaram depois da prévia; nada foi substituído. Revise uma nova prévia.',
    BACKUP_VERIFICATION_FAILED: 'A conferência anterior à confirmação falhou; a substituição foi revertida por inteiro.',
    SERIES_CONFLICT: 'Há mais de uma portadora da mesma série entre as tarefas importadas e a lixeira; nada foi alterado.',
    INVALID_REQUEST: 'A solicitação não pôde ser aceita.',
    UNAUTHORIZED: 'A janela atual não está autorizada.',
  }
  return messages[code] ?? 'Não foi possível concluir a operação de backup.'
}

function mapFailure(failure: BackupFailure): void {
  actionError.value = errorText(failure.code)
  issueLines.value = (failure.issues ?? []).slice(0, 5).map((issue, index) => issueText(issue, index))
  if (failure.extraIssueCount !== undefined && failure.extraIssueCount > 0) {
    issueLines.value.push(`Há mais ${failure.extraIssueCount} problema(s) não listado(s).`)
  }
  void alertElement.value?.focus()
}

function resetMessages(): void {
  feedback.value = null
  actionError.value = null
  issueLines.value = []
}

async function runExport(source: 'area' | 'preview'): Promise<void> {
  if (busy.value) return
  resetMessages()
  phase.value = 'previewing'
  try {
    if (!(await store.startAction())) {
      actionError.value = errorText('BUSY')
      phase.value = preview.value === null ? 'idle' : 'preview'
      return
    }
    const result = await window.taskflowDesktop.exportBackup({ version: 1, contextSequence: store.currentContext() })
    if (result.status === 'cancelled') {
      feedback.value = { tone: 'success', text: 'Seleção cancelada. Nada foi gravado.' }
      phase.value = preview.value === null ? 'idle' : 'preview'
      void exportButton.value?.focus()
      return
    }
    if (result.status === 'error') {
      mapFailure(result)
      phase.value = preview.value === null ? 'idle' : 'preview'
      return
    }
    lastExport.value = { outcome: result.outcome, taskCount: result.taskCount }
    exportedOutcome.value = source
    feedback.value = {
      tone: result.outcome === 'SAVED' ? 'success' : 'warning',
      text:
        result.outcome === 'SAVED'
          ? `Backup salvo com ${result.taskCount} tarefa(s).`
          : `Backup salvo com ${result.taskCount} tarefa(s), mas a conferência posterior encontrou um aviso. O arquivo permanece gravado.`,
    }
    phase.value = preview.value === null ? 'idle' : 'preview'
    void exportButton.value?.focus()
  } catch {
    actionError.value = errorText('STORAGE_UNAVAILABLE')
    phase.value = preview.value === null ? 'idle' : 'preview'
  }
}

async function chooseBackup(): Promise<void> {
  if (busy.value) return
  resetMessages()
  phase.value = 'previewing'
  try {
    if (!(await store.startAction())) {
      actionError.value = errorText('BUSY')
      phase.value = 'idle'
      return
    }
    const result = await window.taskflowDesktop.prepareBackupRestore({
      version: 1,
      contextSequence: store.currentContext(),
    })
    if (result.status === 'cancelled') {
      feedback.value = { tone: 'success', text: 'Seleção cancelada. Nada foi alterado.' }
      phase.value = 'idle'
      void selectorButton.value?.focus()
      return
    }
    if (result.status === 'error') {
      mapFailure(result)
      phase.value = 'idle'
      return
    }
    preview.value = result
    previewStale.value = null
    lastExport.value = null
    phase.value = 'preview'
    void titleElement.value?.focus()
  } catch {
    actionError.value = errorText('STORAGE_UNAVAILABLE')
    phase.value = 'idle'
  }
}

async function openConfirmation(): Promise<void> {
  if (preview.value === null || previewLocked.value) return
  phase.value = 'confirm'
  await nextTick()
  confirmPanel.value?.focus()
}

/** Abandono modal: nenhum confirm é enviado e a prévia/token continuam válidos. */
function abandonConfirmation(): void {
  if (phase.value !== 'confirm') return
  phase.value = 'preview'
  void confirmTrigger.value?.focus()
}

async function confirmRestore(): Promise<void> {
  const current = preview.value
  if (current === null || previewLocked.value || phase.value !== 'confirm') return
  phase.value = 'restoring'
  try {
    const result = await window.taskflowDesktop.confirmBackupRestore({
      version: 1,
      contextSequence: store.currentContext(),
      restoreToken: current.restoreToken,
    })
    if (result.status === 'error') {
      const recoverable = result.code === 'BACKUP_BASE_CHANGED' || result.code === 'BACKUP_PREVIEW_EXPIRED' || result.code === 'BACKUP_PREVIEW_INVALID'
      if (recoverable) {
        previewStale.value = errorText(result.code)
        phase.value = 'preview'
        return
      }
      mapFailure(result)
      phase.value = 'preview'
      return
    }
    await store.refresh()
    preview.value = null
    previewStale.value = null
    phase.value = 'success'
    feedback.value = {
      tone: result.verification === 'VERIFIED' ? 'success' : 'warning',
      text:
        result.outcome === 'UNCHANGED'
          ? `Nenhuma tarefa precisou mudar (${result.restoredCount} conferida(s)). O desfazer anterior foi invalidado.`
          : `Substituição concluída: ${result.restoredCount} tarefa(s). Não há desfazer de importação.`,
    }
    if (result.verification === 'PENDING') {
      feedback.value.tone = 'warning'
      feedback.value.text += ' A conferência posterior ficou pendente; a gravação confirmada permanece.'
    }
    await nextTick()
    successElement.value?.focus()
  } catch {
    actionError.value = errorText('STORAGE_UNAVAILABLE')
    phase.value = 'preview'
  }
}

/** Cancelar a prévia consome/libera o token no main; abandonar o modal não. */
async function cancelPreview(): Promise<void> {
  const current = preview.value
  if (current === null || busy.value) return
  try {
    await window.taskflowDesktop.cancelBackupRestore({
      version: 1,
      contextSequence: store.currentContext(),
      restoreToken: current.restoreToken,
    })
  } catch {
    // O cancelamento local continua liberando a prévia visível.
  }
  preview.value = null
  previewStale.value = null
  phase.value = 'idle'
  feedback.value = { tone: 'success', text: 'Prévia cancelada. Nenhuma tarefa foi alterada.' }
  void selectorButton.value?.focus()
}

function leave(): void {
  emit('back')
}
</script>

<template>
  <section class="backup-manager">
    <header class="backup-header">
      <h1
        ref="titleElement"
        tabindex="-1"
        data-backup-title
      >
        Backup
      </h1>
      <button
        type="button"
        class="button-secondary"
        data-action="back"
        @click="leave"
      >
        Voltar
      </button>
    </header>

    <p class="backup-intro">
      Exporte um arquivo com todas as tarefas ou importe um backup exportado pela extensão.
      A lixeira atual é preservada; o arquivo não inclui lixeira, credenciais/configuração de IA nem
      desfazer temporário. O JSON não é criptografado e pode conter dados pessoais das tarefas.
    </p>

    <div
      aria-live="polite"
      class="live-region"
    >
      <p
        v-if="feedback"
        class="feedback"
        :class="`feedback-${feedback.tone}`"
      >
        {{ feedback.text }}
      </p>
    </div>

    <p
      v-if="actionError"
      ref="alertElement"
      class="feedback feedback-error"
      tabindex="-1"
      role="alert"
    >
      {{ actionError }}
    </p>
    <ul
      v-if="issueLines.length > 0"
      class="backup-issues"
    >
      <li
        v-for="line in issueLines"
        :key="line"
      >
        {{ line }}
      </li>
    </ul>

    <section
      v-if="phase === 'idle' || phase === 'previewing'"
      class="backup-actions"
      aria-label="Ações de backup"
    >
      <button
        ref="exportButton"
        type="button"
        :aria-disabled="busy ? 'true' : undefined"
        data-action="export"
        @click="runExport('area')"
      >
        Exportar tarefas atuais
      </button>
      <button
        ref="selectorButton"
        type="button"
        class="button-secondary"
        :aria-disabled="busy ? 'true' : undefined"
        data-action="select"
        @click="chooseBackup"
      >
        Selecionar backup…
      </button>
      <p
        v-if="busy"
        class="status"
        role="status"
      >
        Operação em andamento…
      </p>
      <p
        v-if="feedback && feedback.text.includes('Backup salvo')"
        class="status"
        role="status"
      >
        Guarde o arquivo original exportado pela extensão até conferir a importação.
      </p>
    </section>

    <section
      v-if="phase === 'previewing'"
      class="state"
      role="status"
      aria-live="polite"
      data-backup-loading
    >
      <p>Lendo e validando o arquivo no aplicativo…</p>
    </section>

    <section
      v-if="phase === 'preview' && preview"
      class="backup-preview"
      aria-labelledby="backup-preview-title"
    >
      <h2 id="backup-preview-title">
        Revisar importação
      </h2>
      <dl class="backup-summary">
        <div><dt>Versão original do arquivo</dt><dd>v{{ preview.sourceFormatVersion }}</dd></div>
        <div><dt>Formato normalizado</dt><dd>v{{ preview.formatVersion }}</dd></div>
        <div><dt>Exportado em</dt><dd>{{ formatDateTime(preview.exportedAt) }}</dd></div>
        <div><dt>Aplicativo de origem</dt><dd>{{ preview.appVersion }}</dd></div>
        <div><dt>Tarefas no arquivo</dt><dd>{{ preview.fileTaskCount }}</dd></div>
        <div><dt>Tarefas locais atuais</dt><dd>{{ preview.localTaskCount }}</dd></div>
        <div><dt>Validade desta prévia</dt><dd>{{ Math.round(BACKUP_PREVIEW_TTL_MS / 60000) }} minutos</dd></div>
      </dl>

      <p
        v-if="preview.fileTaskCount === 0"
        class="feedback feedback-warning"
        role="alert"
      >
        O arquivo não contém tarefas: todas as tarefas ativas serão removidas.
      </p>
      <p class="feedback feedback-warning">
        A substituição é total e irreversível: as tarefas do aplicativo que não estiverem no arquivo
        serão removidas, sem passar pela lixeira e sem desfazer de importação.
      </p>
      <p
        v-if="previewStale"
        class="feedback feedback-error"
        role="alert"
      >
        {{ previewStale }}
      </p>

      <div class="backup-actions">
        <button
          ref="confirmTrigger"
          type="button"
          :aria-disabled="previewLocked ? 'true' : undefined"
          data-action="confirm"
          @click="openConfirmation"
        >
          Confirmar substituição…
        </button>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy ? 'true' : undefined"
          data-action="export-current"
          @click="runExport('preview')"
        >
          Exportar preventiva (opcional)
        </button>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy ? 'true' : undefined"
          data-action="select-other"
          @click="chooseBackup"
        >
          Selecionar outro backup…
        </button>
        <button
          type="button"
          class="button-secondary"
          :aria-disabled="busy ? 'true' : undefined"
          data-action="cancel-preview"
          @click="cancelPreview"
        >
          Cancelar prévia
        </button>
      </div>
      <p
        v-if="lastExport"
        class="status"
        role="status"
      >
        {{
          lastExport.outcome === 'SAVED'
            ? `Backup preventivo salvo com ${lastExport.taskCount} tarefa(s).`
            : `Backup preventivo salvo com ${lastExport.taskCount} tarefa(s) e aviso de conferência.`
        }}
        A prévia, o token e o prazo continuam os mesmos.
      </p>
    </section>

    <section
      v-if="phase === 'confirm' && preview"
      ref="confirmPanel"
      class="backup-confirm"
      tabindex="-1"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="backup-confirm-title"
      @keydown.esc="abandonConfirmation"
    >
      <h2 id="backup-confirm-title">
        Substituir todas as tarefas?
      </h2>
      <p>
        {{ preview.fileTaskCount }} tarefa(s) do arquivo substituirão as {{ preview.localTaskCount }} tarefa(s) atuais.
        <template v-if="preview.fileTaskCount === 0">
          Todas as tarefas ativas serão removidas.
        </template>
        Não há desfazer de importação e a lixeira atual permanece como está.
      </p>
      <div class="backup-actions">
        <button
          type="button"
          :aria-disabled="phase !== 'confirm' ? 'true' : undefined"
          data-action="confirm-irreversible"
          @click="confirmRestore"
        >
          Substituir agora
        </button>
        <button
          type="button"
          class="button-secondary"
          data-action="abandon"
          @click="abandonConfirmation"
        >
          Voltar à prévia
        </button>
      </div>
    </section>

    <section
      v-if="phase === 'restoring'"
      class="state"
      role="status"
      aria-live="polite"
    >
      <p>Substituindo as tarefas em uma única unidade e conferindo o resultado…</p>
    </section>

    <section
      v-if="phase === 'success'"
      class="state state-success"
      role="status"
    >
      <p
        ref="successElement"
        tabindex="-1"
        data-backup-success
      >
        {{ feedback?.text ?? 'Operação de backup concluída.' }}
      </p>
      <div class="backup-actions">
        <button
          type="button"
          class="button-secondary"
          data-action="success-back"
          @click="leave"
        >
          Voltar às tarefas
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
.backup-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.backup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.backup-intro {
  margin: 0;
  color: var(--color-muted, #4a4a4a);
}

.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.backup-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.5rem 1rem;
}

.backup-summary dt {
  font-weight: 600;
}

.backup-preview,
.backup-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.backup-confirm {
  border: 2px solid #8a6d1d;
  border-radius: 0.5rem;
  padding: 1rem;
}

.backup-issues {
  margin: 0;
  padding-left: 1.25rem;
}
</style>
