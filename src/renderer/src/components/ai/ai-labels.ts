import type {
  AiBlockCode,
  AiErrorCode,
  AiFailureReason,
} from '../../../../contracts/ai.js'

/**
 * Mensagens fixas dos códigos fechados de IA. Nenhuma mensagem carrega credencial, URL completa,
 * cabeçalho ou corpo do provedor: somente motivo e, quando houver, código de estado.
 */
const ERROR_LABELS: Record<AiErrorCode, string> = {
  INVALID_REQUEST: 'O pedido não pôde ser validado. Nada foi enviado nem gravado.',
  UNAUTHORIZED: 'A operação não é permitida nesta janela.',
  BUSY: 'Já existe uma operação de IA em andamento. Aguarde ou cancele a atual.',
  NOT_CONFIGURED: 'Nenhum provedor de IA está configurado.',
  CONSENT_REQUIRED: 'É necessário autorizar esta operação antes de enviar qualquer dado.',
  STALE_REQUEST: 'A prévia mudou ou expirou. Prepare novamente antes de enviar.',
  SESSION_CLOSED: 'A janela foi recarregada ou fechada; a operação foi descartada.',
  VALIDATION_FAILED: 'Revise os campos indicados antes de salvar.',
  BLOCKED: 'A configuração de IA está bloqueada. Veja o motivo abaixo.',
  FAILED: 'A operação com o provedor não foi concluída.',
  CANCELLED: 'A operação foi cancelada.',
  DISCARDED: 'O resultado foi descartado porque a janela ou a configuração mudou.',
  UNKNOWN_REQUEST: 'O pedido não pertence a esta janela ou já foi encerrado.',
  RESOURCE_LIMIT: 'O conteúdo excede o limite permitido. Nada foi enviado nem gravado.',
  UNAVAILABLE: 'A operação de IA está indisponível no momento.',
}

const BLOCK_LABELS: Record<AiBlockCode, string> = {
  INCOMPATIBLE: 'O arquivo de configuração está em um formato incompatível e foi preservado. Somente remover é possível.',
  PROTECTION_UNAVAILABLE: 'A proteção nativa do Windows não está disponível. Salvar e usar a credencial ficam bloqueados; remover continua possível.',
  CREDENTIAL_UNREADABLE: 'A credencial salva não pode ser decifrada neste perfil. O arquivo foi preservado; somente remover é possível.',
  UNKNOWN: 'A publicação da configuração ficou incerta. Salve ou remova novamente para reconciliar; nada foi sobrescrito.',
  UNAVAILABLE: 'A configuração de IA não pôde ser lida ou gravada agora.',
  STALE_REVISION: 'A configuração mudou desde a última leitura. Recarregue o estado e tente de novo.',
  RESOURCE_LIMIT: 'A configuração excede o tamanho permitido. Nada foi gravado.',
}

const REASON_LABELS: Record<AiFailureReason, string> = {
  INVALID_CREDENTIALS: 'A credencial foi recusada pelo provedor.',
  ENDPOINT_UNREACHABLE: 'Não foi possível alcançar o endereço do provedor.',
  MODEL_LIST_UNSUPPORTED: 'Este endereço não oferece listagem de modelos; use o envio mínimo.',
  TIMEOUT: 'O provedor não respondeu dentro do tempo limite.',
  UNEXPECTED_RESPONSE: 'O provedor devolveu uma resposta inesperada.',
  EMPTY_RESPONSE: 'O provedor devolveu uma resposta vazia.',
  UNREADABLE_RESPONSE: 'Não foi possível interpretar a resposta do provedor.',
  NO_VALID_ITEM: 'Nenhum item sugerido passou na validação de subtarefas.',
}

export function aiErrorLabel(code: AiErrorCode): string {
  return ERROR_LABELS[code]
}

export function aiBlockLabel(blocked: AiBlockCode): string {
  return BLOCK_LABELS[blocked]
}

export function aiReasonLabel(reason: AiFailureReason): string {
  return REASON_LABELS[reason]
}

/** Rótulos dos provedores; a base oficial é exibida como valor fixo, sem campo editável. */
export const AI_PROVIDER_LABELS: Record<'OPENAI' | 'ANTHROPIC' | 'CUSTOM', string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  CUSTOM: 'Personalizado (compatível com OpenAI)',
}

export const AI_OFFICIAL_BASE_LABELS: Record<'OPENAI' | 'ANTHROPIC', string> = {
  OPENAI: 'https://api.openai.com/v1',
  ANTHROPIC: 'https://api.anthropic.com',
}
