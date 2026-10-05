# Lixeira e desfazer — operação e limites (TFA-006)

Documento operacional do que foi implementado para exclusão recuperável, restauração, exclusão
definitiva/esvaziamento e desfazer temporário. Complementa
[persistência e IPC](local-persistence-and-state-ipc.md) e
[gerenciamento de tarefas](desktop-task-management.md).

## Política da lixeira

- **Retenção:** 30 × 24 h decorridas (`TRASH_RETENTION_MS`), independentes de calendário/DST.
  Exatamente 30 dias e datas futuras permanecem; 30 dias + 1 ms vence. O clock pertence ao main.
- **Capacidade:** 100 entradas. O move aplica expurgo por idade, substituição do mesmo ID,
  inserção e corte no **mesmo commit**.
- **Ordem:** `deletedAt` decrescente; empate pela revisão de conteúdo da entrada, decrescente;
  desempate final por ID em ordem lexicográfica UTF-16 (sem `localeCompare`).
- **Relógio recuado:** com 100 entradas futuras, a nova exclusão pode cair fora do limite e não
  ser retida. O resultado informa `retained:false` e a interface avisa que não há recuperação;
  a política por data **não** é alterada e nenhum `deletedAt` é falsificado.
- **Descartes irreversíveis:** itens vencidos, cortados pelo limite, substituídos pelo mesmo ID e
  a versão antiga da lixeira substituída não retornam pelo desfazer. Exclusão definitiva e
  esvaziamento são remoção lógica do produto, sem promessa de apagamento forense de páginas do
  SQLite ou de cópias de backup.

## Identidade da entrada (D3, sem SQL novo)

Cada move efetivo cria a linha de lixeira com `contentRevision = editRevision = g`, a revisão
global do commit; payload, versão e timestamps da Task permanecem íntegros. Restore, definitiva e
undo vinculam-se à **referência observada** `{taskId, contentRevision, deletedAt}` — nunca só ao
ID nem a `globalRevision`. Restore → nova exclusão com o mesmo relógio gera identidade nova e a
operação pendente antiga recebe `ENTRY_CHANGED`/`CONFIRMATION_CHANGED`.

## Restore e recusas

Ordem das recusas: `NOT_IN_TRASH` → `ENTRY_CHANGED` → `ENTRY_EXPIRED` → `ID_EXISTS` →
`SERIES_CONFLICT`. Recusa conserva coleções, revisões e a própria entrada (sem expurgo oculto).
Sucesso restitui a Task com `id/createdAt/updatedAt/completedAt/status/campos/ordens/regra`
intactos, novas revisões de storage, liquidação pura de lembretes vencidos (`<= now`) e **nenhuma
ocorrência nova**. Entrada vencida é recusada em todo caminho (mesmo sem abrir a área).

## Manutenção explícita

- `prepareTrashView` (unidade explícita) expurga por idade no startup válido, ao entrar na área e
  dentro do move. Snapshots/list/get continuam **puros** — leitura nunca expurga.
- No-op de manutenção não incrementa revisão nem emite evento; falha é visível com retry e nunca
  vira lista vazia.
- A apresentação filtra vencidos em até 60 s e ao foco/retomada, sem timer de escrita.

## Desfazer temporário

- Uma oferta por documento, **somente em memória**, sem prazo/pilha/redo. Elegíveis: edição,
  status e exclusão retida efetivas. Criação, check, restauração, no-op, definitiva, esvaziamento
  e expurgo **não** oferecem desfazer.
- O recibo é capturado na leitura real da unidade (before-image relida, referência exata da
  gerada) e reservado antes da escrita; a publicação acontece após o commit, somente com sessão e
  contexto ainda correntes.
- Reversão usa `contentRevision` completa do alvo e da gerada: edição/check/ABA/ausência bloqueiam
  (`CHANGED`/`REMOVED`/`GENERATED_CHANGED`); claim isolado não bloqueia e o marcador atual é
  preservado. Reversão de série restaura a anterior e remove a gerada **diretamente de tasks** no
  mesmo commit, validando a portadora única no plano final e sem calcular próxima.
- O token é opaco, próprio do documento/contexto, e é consumido **uma vez** em sucesso, recusa ou
  falha. Sem redo/replay/recriação após ressync.
- Nova ação/área/abandono limpa a oferta antes do percurso dependente; filtros, ordenação,
  expansão, minimizar e espera **não** expiram. Fechar/reload/crash conserva commits e perde o
  histórico temporário; reabrir não recupera undo.

## Contexto ordenado e recursos

- Cada ação começa com `clearUndoOffer` de uma sequência monotônica por documento; comandos exigem
  a sequência estabelecida na admissão e na execução. Sequência menor recebe `STALE_CONTEXT`;
  igual é clear idempotente. Undo é exceção: usa a sequência/token da oferta.
- Orçamento lógico global de **64 MiB** para recibos + confirmações + candidatos, com charge
  determinístico; falta de recurso recusa **antes** de escrever (`RESOURCE_LIMIT`), sem cortar
  conteúdo, IDs históricos ou o codec.
- Porta interna `invalidateAfterSuccessfulBackupRestore` invalida recibos/confirmações de todas as
  sessões após sucesso `APPLIED`/`UNCHANGED` do futuro backup, por época monotônica. O percurso de
  arquivo/UI e a propagação visual ficam na TFA-007.

## Lembretes (recorte delimitado)

Restore/revert apenas preservam `processedFor` atual e liquidam gatilhos pendentes representáveis
`<= now`; futuros permanecem pendentes. Não há scheduler/notifier nem mensagem de alarme
agendado; a guarda D8 de prazo/status/fechamento com lembretes continua valendo até a TFA-008.

## Verificação humana pendente

O roteiro de teclado/zoom/DPI/leitor de tela está em
[a11y-manual-checklist-tfa006.md](a11y-manual-checklist-tfa006.md). Ele **não foi executado**
nesta entrega; mocks e testes de componente não substituem a prova humana.
