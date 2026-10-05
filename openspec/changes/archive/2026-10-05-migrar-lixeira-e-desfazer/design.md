# Design

## Context

Motivação em [proposal.md](C:/QSI/Workspaces/taskflow-app/openspec/changes/migrar-lixeira-e-desfazer/proposal.md). Base `ab3ed688f025064c16ce155ff5220fe62f9dbc59`, branch `codex/tfa-006-migrar-lixeira-e-desfazer`; TFA-003/004/005 integradas. Os documentos abaixo propõem implementação futura e aguardam revisão, exceto a preferência humana de esvaziamento expressamente registrada em D4.

Evidências que determinam o desenho:

- [Unidade atual](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:227) já move/restaura/expurga/reverte sob o coordenador. Move conserva revisões antigas; restore não verifica idade; revert confere conteúdo mas não valida portadora final. [Teste de metadados](C:/QSI/Workspaces/taskflow-app/tests/application/task-storage-revisions.test.ts:129) espera revisões antigas no move e terá de mudar explicitamente.
- [Comandos](C:/QSI/Workspaces/taskflow-app/src/application/tasks/task-commands.ts:229) retornam revisões sem before-image/referência da gerada. [Sessões](C:/QSI/Workspaces/taskflow-app/src/main/ipc/document-sessions.ts:73) têm geração e limpeza; [coordenador](C:/QSI/Workspaces/taskflow-app/src/main/storage/coordinator.ts:255) publica depois do commit. [Store](C:/QSI/Workspaces/taskflow-app/src/renderer/src/stores/tasks.ts:144) adota apenas tasks do snapshot que já contém trash.
- [D9 arquivado](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-preservar-recorrencias-e-subtarefas/design.md) exige conteúdo completo de anterior/gerada e portadora única em tasks+trash. D8 mantém bloqueio de prazo/status/fechamento com reminders. SQL 2, codec 4, revisão estrutural e conteúdo completo já existem.
- Origem somente leitura `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`: [política](C:/QSI/Workspaces/taskflow-extension/src/domain/task-trash.ts:10), [undo](C:/QSI/Workspaces/taskflow-extension/src/domain/task-undo.ts:25), [serviço de lixeira](C:/QSI/Workspaces/taskflow-extension/src/application/trash-service.ts), [reset e ações](C:/QSI/Workspaces/taskflow-extension/src/components/tasks/TaskManager.vue:178), [confirmações/foco](C:/QSI/Workspaces/taskflow-extension/src/components/trash/TrashManager.vue:138) e [liquidação](C:/QSI/Workspaces/taskflow-extension/src/domain/task-reminders.ts:177).
- Testes de domínio trash/undo, aplicação task-service, TrashManager/TaskManager, stored-trash e integração/repository Chrome foram consultados; não executados na origem. O restore direto da origem não confere retenção, embora sua spec a exija; não copiar essa lacuna.

## Goals / Non-Goals

**Goals:** tornar cada ação uma decisão condicionada sobre dados atuais; separar commit durável de oferta temporária; impedir autorização por snapshot anterior forjado, timestamp, sessão alheia ou confirmação antiga; manter uma projeção autoritativa e preservar os contratos de série/claims.

**Non-Goals:** novo mecanismo de armazenamento, log de eventos/histórico, serviço Chrome completo, scheduler fictício, importação funcional, segundo escritor/subscription, novas janelas de produto ou reescrita visual. Duas janelas são somente superfícies fictícias de teste. Nenhuma rotina de TFA-007/008 é exposta como produto neste recorte.

## Decisions

### D1 — Planejamento portável e autoridade no main

Reutilizar seletivamente regras, componentes/CSS e cenários; domínio/aplicação permanecem independentes de Vue/Pinia/Electron. Main fornece relógio, gerador de token e coordenação; funções internas síncronas leem, validam e planejam antes da primeira escrita. Não aguardar UI, rede, shell ou scheduler dentro da unidade. Falha de planejamento retorna código sem alocar revisão; falha após começar a aplicar o plano precisa lançar falha interna para rollback, nunca retornar uma recusa depois de escrever.

Usar o coordenador existente para tasks+trash+global. Não reenfileirar uma unidade dentro dela mesma. Registrar recibo no main apenas depois de resultado `ok` com `committed:true`, usando os fatos produzidos pela própria unidade; nunca reconstruir antes/depois a partir de snapshots, título ou varredura de série.

Alternativas rejeitadas: filas por janela deixam decisões concorrentes; serviço inteiro da origem traz Chrome/alarms/backups; UndoPlan fornecido pelo renderer permite inventar estado anterior. Um log persistente resolveria outro produto e fica excluído.

### D2 — Retenção, limite, ordem e relógio explicitados

Retenção usa milissegundos decorridos: remover somente `Date.parse(deletedAt) < now - 30*24*60*60*1000`. Exatamente 30 dias e datas futuras permanecem. Ler `now` uma vez ao executar a unidade, depois da fila; nunca aceitar clock/deletedAt do renderer. Datas extremas válidas usam comparação numérica finita, sem converter o limiar de retenção em ISO ou dias civis.

Move planeja: conferir alvo; filtrar vencidos; retirar versão anterior da lixeira de mesmo ID; inserir nova entrada; ordenar; manter primeiros 100; aplicar remoção da tarefa e diferenças da lixeira num commit/global+1. Não gerar ocorrência nem mudar status, completedAt, regra, payload ou timestamps da tarefa. Descartes do limite/retenção/mesmo ID são irreversíveis e não entram no recibo de undo.

Ordem: deletedAt numérico decrescente; empate por contentRevision da entrada decrescente; último desempate por ID em ordem lexicográfica de unidades UTF-16, sem localeCompare. Em novas exclusões com relógio igual, a maior revisão coloca a inserção mais recente primeiro, reproduzindo a inserção à frente da origem. A ordem da antiga lista Chrome não existe no banco: empates históricos têm desempate determinístico explicitamente adaptado, sem regravar entradas apenas para ordenar.

Conservar a consequência do relógio recuado: com 100 entradas futuras, a tarefa recém-excluída pode cair fora dos primeiros 100. Confirmação sempre informa 30 dias, limite 100 e descartes irreversíveis; texto inclui que ajustes do relógio podem reduzir a recuperação. Ack de move distingue `retained:true|false`. Se não retida, informar remoção sem recuperação e não oferecer Desfazer; não privilegiar silenciosamente a nova entrada, falsificar deletedAt ou capturar descartes colaterais para um undo ampliado. A prévia pode avisar esse risco, mas o resultado efetivo é decidido no commit.

Alternativa de sempre conservar a última exclusão alteraria a política por data/limite, exigindo outra escolha de produto; não é adotada. Só expurgo por idade no startup/entrada, como list/purge da origem. Coleção histórica acima de 100 não é truncada por leitura/entrada; o próximo move aplica o limite de inserção. A UI explica a política sem declarar incompatível dado aceito pelo codec.

### D3 — Identidade de entrada sem SQL novo

Cada move efetivo atribui à nova linha de trash `contentRevision=editRevision=g`, onde g é a revisão global do commit. Payload/versão e timestamps Task permanecem íntegros. Essa é uma evolução explícita da primitiva que hoje conserva as revisões antigas: a exclusão cria uma nova identidade de entrada, inclusive ao substituir uma versão de mesmo ID que coexistia com tasks. Restore já recebe revisões novas; purge/permanent/empty não reescrevem sobreviventes.

Referência observada da entrada: `{taskId,contentRevision,deletedAt}`. As três propriedades são comparadas exatamente na unidade, sem normalizar o texto de deletedAt recebido do snapshot. Mesmo ID/mesmo relógio/mesmo conteúdo após restore→delete tem revisão nova. A substituição tasks/trash de mesmo ID também recebe g, cobrindo fixtures históricas em que ambas as linhas tinham revisão igual. Não confiar apenas em deletedAt nem em comparação de payload que volta em A→B→A.

SQL permanece 2, payload/codec 4 e backup não recebem metadata. Não há coluna de geração ou migração de linhas existentes: tokens novos observam a tupla que existe; toda substituição autorizada posterior cria revisão nova. Revisões antigas legítimas continuam legíveis; limite de bigint recusa antes de escrever sem wrap. Claim interno continua em tasks, não modifica linha de trash.

Alternativas: coluna separada de geração exige SQL 3 sem benefício necessário; conservar metadata e só comparar timestamps deixa substituição de mesma identidade ambígua. Não usar globalRevision como CAS de um item, pois tarefas independentes não mudam sua identidade.

### D4 — Confirmações, restore e manutenção

**Escolha humana desta conversa:** “Recusar a confirmação antiga e pedir revisão da lista (recomendado)”. Esvaziamento é condicionado à composição completa observada, incluindo as identidades de entradas, não só IDs/contagem nem globalRevision. Outra exclusão, restore, purge, permanent ou substituição de mesmo ID altera a base; alteração de tarefa/claim fora da lixeira não a altera.

Preparação de confirmação usa leitura pura coordenada. Guarda um token aleatório opaco no main, próprio do documento/contexto e tipo MOVE/PERMANENT/EMPTY, com base interna. MOVE recebe ID/contentRevision da tarefa vista ao abrir o diálogo, confere essa revisão completa e conserva a base; PERMANENT confere a referência vista; EMPTY captura as referências atuais de todas as linhas da lixeira, sem enviar Tasks. Resposta pequena contém token, revisão global da leitura e contagem/aviso de série pertinente. Antes de apresentar o diálogo, o cliente aguarda snapshot completo >= revisão preparada. Se o transporte/snapshot falhar, não mostrar confirmação habilitada. Mudança depois da preparação será recusada no commit; base nunca é elevada silenciosamente pelo diálogo.

Ao confirmar, tomar/consumir token próprio uma vez, conferir tipo/contexto e base inteira antes de escrever. MOVE usa contentRevision, portanto check posterior recusa; claim conserva revisão e seus marcadores atuais seguem no payload. PERMANENT só remove a entrada observada. EMPTY remove todas as linhas da base se a composição continua igual; não remove tarefas. Token errado/alheio não consome o token legítimo de outra sessão. Abandono/Escape limpa contexto/token e não escreve. Mudança durante espera fecha diálogo, apresenta `CONFIRMATION_CHANGED`, ressincroniza e exige novo diálogo; nunca reaproveitar confirmação antiga para o estado atual.

Restore não pede confirmação adicional: recebe referência observada e relê idade, identidade, ID ativo e portadora. Ordem das recusas: ausência `NOT_IN_TRASH`, identidade diferente `ENTRY_CHANGED`, vencido `ENTRY_EXPIRED`, ID ativo `ID_EXISTS`, conflito final `SERIES_CONFLICT`. Recusa conserva coleções/global/metadados, inclusive entrada vencida; manutenção é unidade distinta. Sucesso remove entrada e restaura Task com id/createdAt/updatedAt/completedAt/status/campos/ordens/regra intactos, exceto liquidação D8 e novas revisões. Não gera próxima e não oferece undo. Definitiva pode eliminar a entrada confirmada que venceu durante o diálogo, pois não restaura dados; age check obrigatório é de restore/undo.

Expurgo explícito por idade no startup após abertura válida/ownership, antes da primeira superfície, ao entrar na lixeira e dentro do move. Abertura da área usa `prepareTrashView`, uma unidade própria, seguida de snapshot; get/list/snapshot continuam puros. No-op de purge não incrementa revisão/evento. Falha de manutenção não se disfarça de lista vazia: mostrar erro/retry, conservar snapshot stale e bloquear ações dependentes até reconciliação; falha incerta segue reopen da base. Startup com falha recuperável pode manter tarefas disponíveis, comunicando falha de manutenção sem afirmar que lixeira foi limpa.

Enquanto a área fica aberta, relógio de apresentação filtra vencidos em até 60 s e imediatamente no foco/retomada; o main recusa restore vencido em qualquer milissegundo. Nenhum timer grava/expurga. A apresentação não altera snapshot bruto nem esconde incompatibilidade como vazio. Fechar app não expurga por conveniência.

### D5 — Recibo capturado na unidade e reversão integral

Tipos internos discriminados: DELETE guarda referência da nova entrada; REVERT guarda clone da Task realmente relida antes da alteração, revisão completa produzida para o alvo e referência/revisão completa da gerada, se houver. Before-image de save depois de checks inclui done atual. Gerada é identificada pelo plano de fechamento, nunca inferida depois. Funções de update/status passam a produzir fatos internos de undo junto do outcome; isso não expõe Task no ack.

Planejar alteração efetiva primeiro; reservar/clonear before-image e preparar resposta/token antes da primeira gravação. No-op/recusa/rollback não publicam recibo. A reserva existe temporariamente, sob orçamento D9; commit confirmado publica apenas se ticket/contexto/época internos ainda atuais. Não tentar salvar recibo na transação SQL; fechar processo perde-o intencionalmente.

REVERT relê alvo e eventual gerada, compara contentRevision completa de ambas. Ausência do alvo é REMOVED; alteração do alvo CHANGED; ausência/alteração/restore/exclusão/check/avanço da gerada é GENERATED_CHANGED. Timestamp igual, editRevision igual ou campos que retornaram à versão anterior não liberam undo. Claim isolado não conflita. Planejar anterior restaurada com updatedAt=now, id/createdAt originais e todos os demais campos/ordens/done/regra/completedAt da before-image, conservando marcadores atuais da mesma ocorrência e liquidando vencidos D8. Reversão válida atribui content/edit=g novas, mesmo em extremo de igualdade de payload após transformação, sem reaproveitar revisão anterior.

Validar portadora única em tasks+trash **do plano final**: desconsiderar alvo substituído e gerada removida em tasks ou entrada movida de trash, mantendo distinção de coleção mesmo para IDs iguais. Não chamar o helper atual ignorando só um ID, pois ele contaria a gerada que será removida ou excluiria indevidamente uma entrada homônima. Se o plano reintroduz regra e encontra outra portadora da série, recusar inteiro; duplicidade histórica permanece legível e não é reparada. Undo de edição independente que não altera a portadora conserva o tratamento de dados históricos, sem inventar uma restrição global sobre séries alheias.

Aplicar restauração do alvo e remoção direta da gerada, sem passar pela lixeira e sem calcular próxima, num commit único. DONE/SKIP/END, fim natural, edição terminal, retirada de regra e reabertura efetivas são cobertos. Qualquer falha mantém ambas inteiras. DELETE reutiliza o mesmo caminho condicionado de restore, inclusive idade/entrada/ID/portadora/liquidação, e só recupera sua tarefa. Sem redo, undo de undo, criação/check/restore/definitiva/empty/purge.

### D6 — Oferta por documento e contexto ordenado

Uma oferta publicada por DocumentTicket.key. Renderer guarda apenas token/ação/identidade local para mensagem e foco, nunca before-image persistida. Outra janela não recebe a oferta. Não há timeout de undo: minimizar, foco, espera, filtros, ordenação, limpar filtros e expansão não encerram a oferta. Concorrência externa/retenção/capacidade pode torná-la inaplicável, e a tentativa recebe recusa segura.

Nova ação começa limpando oferta anterior, inclusive ação que falha, no-op, check, abrir confirmação ou abrir formulário/área. Ações somente de apresentação não fazem isso. Cancelar/voltar explicitamente de formulário/área também limpa; fechamento automático do formulário após save faz parte da mesma ação e pode apresentar a oferta desse save na lista. Abrir diagnóstico secundário conta como troca de área. Recursos futuros chamarão o mesmo protocolo, mas não são montados agora.

Protocolo concreto, sem confiar em ordem de respostas:

1. Cliente mantém `contextSequence` inteiro seguro 1..Number.MAX_SAFE_INTEGER por documento e incrementa ao começar cada nova ação/área. Esconde oferta local imediatamente e chama `clearUndoOffer` com a nova sequência; espera ack antes do comando dependente. Esgotamento recusa por RESOURCE_LIMIT, sem wrap; novo documento inicia sessão/contador novos.
2. Main aceita sequência maior que a atual para estabelecer contexto e invalidar recibo/confirmação/reserva anteriores; igual é clear idempotente; menor é STALE_CONTEXT. Não vem sessionId do renderer. Um pedido alheio não altera estado local.
3. Todos os comandos de tarefa/lixeira desta Change levam a sequência **já estabelecida**, exigem igualdade com contexto corrente na admissão e execução e um slot de ação próprio. Slot permite preparar confirmação e depois executá-la uma vez; mutação direta ou prepareTrashView conclui o slot. Duplicatas não são replay/no-op autorizado. `openTaskSource` v1 e diagnóstico conservam seus contratos; a UI faz clear antes da ação, sem dar-lhes recibo.
4. Troca de contexto antes de unidade iniciar cancela sua admissão. Se commit já ocorreu, clear invalida publicação/entrega da oferta e o banco conserva commit. Contexto antigo não entrega token; resposta tardia não aparece na UI nem apaga oferta nova. Sequência não é relógio nem autoridade entre sessões.
5. Undo é exceção ao clear inicial: usa sequência da oferta e seu token, tomado uma vez no próprio registro. A tentativa válida consome em sucesso, recusa ou falha de storage, inclusive resultado incerto; token repetido/ausente retorna UNDO_NOT_AVAILABLE. Payload/remetente inválido não consome recibo legítimo. Sem recriação de recibo em ressync/reattempt.

Reload/navegação mesmo URL/crash/fechamento usam onInvalidated para cancelar fila, reservas, tokens e referências. Perda de transporte limpa a oferta local e tenta clear em sequência nova quando a sessão volta, exigindo snapshot antes de outra escrita. Commit incerto não é chamado rollback; recibo candidato não é reconstruído da base. Mudança de documento durante unit ativa não desfaz commit nem o entrega ao novo documento.

Alternativas: apenas esconder botão no renderer deixa resposta antiga recriá-lo; contador de UI sem verificação main permite execução tardia; prazo artificial não corrige concorrência e muda a semântica temporária. Contexto próprio + token interno resolve essas duas fases sem histórico persistente.

### D7 — IPC, schemas, versões, acks e erros

**17 wrappers finais:** os nove existentes mais oito abaixo. Estado/snapshot/subscription/eventos permanecem v2, sem novo campo de metadata; diagnóstico e openTaskSource v1. As quatro mutações create/update/status/setSubtaskDone passam a **v3**, canais próprios v3, contextSequence obrigatório e resultado `outcome:'APPLIED'|'UNCHANGED'`; update/status podem trazer undoToken. Requests v2 dessas mutações são recusados sem alias. Main/preload/renderer mudam no mesmo pacote; CAS de edição/toggle permanece editRevision. Somente exclusão/undo usam a condição completa própria.

| Wrapper novo (v1) | Request exato além de version:1 | Resultado ok específico além de version/status |
| --- | --- | --- |
| clearUndoOffer | contextSequence | contextSequence |
| prepareTrashConfirmation | contextSequence + união discriminada kind MOVE(taskId,expectedContentRevision), PERMANENT(entry), EMPTY(sem alvo) | confirmationToken,revision,itemCount; hasRecurrence somente MOVE |
| moveTaskToTrash | contextSequence,confirmationToken | revision,retained,undoToken somente quando retida e contexto válido |
| restoreTrashItem | contextSequence,entry | revision,contentRevision,editRevision |
| deleteTrashItem | contextSequence,confirmationToken | revision |
| emptyTrash | contextSequence,confirmationToken | revision,removedCount |
| prepareTrashView | contextSequence | revision,purgedCount |
| undoLastTaskAction | contextSequence,undoToken | revision,contentRevision,editRevision |

`entry` é exatamente taskId/contentRevision/deletedAt (strings do snapshot), nunca Task. Revisões decimais exatas conforme contrato existente; IDs históricos não recebem limite de codec. Token gerado por main: 24 bytes aleatórios em base64url, 32 caracteres, sem derivar de dados da tarefa. Main vincula tipo, sessão, contexto e base; qualquer propriedade extra, clock, predicate, Task, before-image, UndoPlan, autoridade de série, shell/SQL/path é recusada. Escolhas e regras v3 existentes conservam shapes atuais mais contextSequence. Resultado v3 de create inclui apenas ID novo + revisões + outcome; check não traz token; update/status traz token somente APPLIED/commit atual.

Requests de comando novos/v3 mantêm **64 KiB**, respostas **8 KiB** UTF-8 JSON completo com envelope/escaping. Estado/diagnóstico/eventos mantêm 1 KiB e página 256 KiB; fila 64/8 por sessão, espera 2 s, lock 100 ms, oito documentos, um cursor/subscription, cursor 30 s permanecem. Não transmitir base EMPTY com 100 Tasks, nem refletir ID/título histórico em ack. Preparar/reservar shape curto antes de commit impede transformar uma ação confirmada em falso erro de orçamento na saída. Campos como counts são inteiros seguros e nunca representam coleção truncada; excesso legítimo recebe RESOURCE_LIMIT antes de efeito.

Autorização de webContents/main frame/origem real/URL/ticket e contexto em admissão, execução e saída; schemas/versões/bytes de entrada e saída também runtime no preload. Guards de remetente precedem todo acesso; DTO inválido precede consulta/alteração de tokens. Token válido tomado pode ser consumido em recusa funcional sem escrita durável. Não criar RPC genérico ou hooks na bridge de produção.

Erros comuns: códigos de STATE_ERROR_CODES atuais. Novos fechados por operação: `STALE_CONTEXT`, `CONFIRMATION_INVALID`, `CONFIRMATION_CHANGED`, `NOT_IN_TRASH`, `ENTRY_CHANGED`, `ENTRY_EXPIRED`, `ID_EXISTS`, `UNDO_NOT_AVAILABLE`, `CHANGED`, `REMOVED`, `GENERATED_CHANGED`; reutilizar NOT_FOUND/CONFLICT/SERIES_CONFLICT/RESOURCE_LIMIT pertinentes. Confirm errado/alheio/repetido usa CONFIRMATION_INVALID; base alterada confirmada usa CONFIRMATION_CHANGED. Resultado não inclui stack, payload, título, path, SQL, causa ou mensagens arbitrárias; strings pt-BR são locais. Nenhum conteúdo de recibo/token em logs.

Store amplia a mesma adoção atômica para tasks+trash e usa cliente/subscription atuais. Apresentação filtra/ordena trash sem mutá-la. Ack confirmado aguarda snapshot completo >= revision; respostas antigas não fazem upsert. Receber ack sem conseguir ressync significa salvo/atualização pendente; não reenviar nem anunciar rollback. Publicar oferta visual após ack e snapshot válido, sob contexto ainda atual; aparecer oferta não rouba foco. Snapshots nunca contêm undoToken/recibo nem recriam uma oferta perdida.

### D8 — Integrações estritamente delimitadas

Adicionar apenas helper puro de liquidação da origem para restore/revert: com dueAt, reminders pendentes de gatilho representável <=now recebem processedFor desse instante; futuros permanecem pendentes, sem disparar aviso retroativo. Conservar primeiro marcadores atuais de mesmo reminder/instante por preserveProcessedMarkers, depois liquidar. AT/OFFSET, igualdade do gatilho, ausência de prazo, status terminal e marcadores já processados são testados. A liquidação da origem não depende de status ativo; não acrescentar essa condição silenciosamente. Gatilhos históricos não representáveis permanecem íntegros conforme helper atual, sem RangeError ou marcador inventado.

Restore conserva updatedAt/completedAt, revert dá updatedAt novo; modificações de markers integram o mesmo commit com novas revisões de restauração. Claim entre ação e undo conserva metadata completa e marcador; não reabrir ocorrência processada. D8 da TFA-005 continua bloqueando mudanças efetivas de prazo/status ou fechamento/geração com reminders. Não chamar scheduler no-op, remover alarmes fictícios ou retornar remindersPending=false como prova de agendamento. UI informa que agendamento desktop depende da TFA-008 quando pertinente. Portadora excluída não participa de claims porque deixou tasks; restituí-la não gera próxima.

Porta interna de sucesso de backup: `invalidateAfterSuccessfulBackupRestore`, acionada **após** resultado durável confirmado e também após substituição UNCHANGED bem-sucedida. Invalida recibos, confirmações e publicações pendentes de todas as sessões usando época interna monotônica, antes da próxima admissão de ação; sem mudar revision SQL por invalidação. Essa época cerca candidatos que já existiam antes do restore, impedindo publicação tardia depois dele. Cancelamento/falha com rollback confirmado não invalida outras sessões. Resultado incerto exige ressync/validação, sem chamar sucesso. Fixtures testam a porta; percurso de arquivo/substituição/confirmação e propagação visual entre janelas ficam na TFA-007, que terá de limpar as ofertas na UI inclusive UNCHANGED. Não há novo wrapper de backup ou segundo subscriber nesta Change.

Backup segue tasks somente, preserva trash e não transporta revisões internas/undo/credenciais. ID_EXISTS e portadora única continuam obrigatórios na restauração da lixeira. Não ligar a invalidação a todo replaceAll interno/harness: ela depende de sucesso do caso de uso de backup, não de título igual ou comparação parcial. Nenhum histórico vai para SQL, disco, exports ou telemetry; conteúdo pode existir apenas temporariamente na memória do processo, sem promessa de apagamento forense.

### D9 — Memória, encerramento e desempenho

Um recibo publicado e uma confirmação corrente por documento; começar contexto novo limpa ambos. Uma reserva de candidato em execução por documento, contabilizada até referência ser liberada mesmo quando invalidada. Entradas antigas ainda na fila são canceladas por contexto antes de reservar. Reutilizar limite de oito documentos; indisponibilidade de token/reserva recusa antes de efeito.

Orçamento proposto de reservas de recibos+confirmações: **64 MiB globais**, sem teto por campo/Task e sem expiração temporal. Charge determinístico conservador: `2 * bytesUTF8(JSON canônico do before-image) + 4096` para REVERT; DELETE usa referência pequena; base EMPTY soma bytes de referências com envelope e margem de 128 bytes por entrada. Incluir candidatos pendentes e strings/tokens/metadados; reserva incremental de base grande falha antes de publicar token, sem listas parciais. Charge é orçamento lógico, não garantia de heap V8 exato: medir heap/bytes/clones/picos separadamente, liberar todas as referências no cleanup e verificar estabilidade em ciclos longos. Mesmo Task histórica válida que exceda recursos permanece legível/persistida; ação que promete undo recebe RESOURCE_LIMIT antes do commit, sem limitar codec, cortar conteúdo ou executar sem undo silenciosamente.

Reservar depois de determinar que alteração é efetiva e antes de escrever; erro de clone/allocation reverte/recusa. DELETE retida usa tupla, sem duplicar Task. Gerada usa só referência. Publique usando objeto já reservado, sem clone adicional pós-commit; failure inesperada depois de commit não é rollback e implica perder oferta/ressincronizar. Testar falha de reserva/clone, liberação, oito sessões, contexto inválido enquanto candidato aguarda e sessão encerrada antes de resposta.

Fechar janela/reload/crash perde oferta/confirmação; dados tasks/trash confirmados sobrevivem. Shutdown atual fecha admissão, invalida sessões, termina/reverte unidade ativa e fecha conexão; pedido não iniciado é cancelado. Reabrir não recupera undo. Minimize/foco não chama cleanup. Não alterar fechamento provisório para bandeja nesta Change.

Medir 1.000/10.000 tarefas +100 trash, dados >=20 MiB, clones/before-images grandes, base de confirmação e varredura de portadora no runtime empacotado. Orçamentos D10 existentes permanecem: página/mutação p95<=100 ms/preflight<=5 s, UI montagem<=2 s/5 s, filtro/ordem p95<=500 ms, heartbeat<=250 ms. Baseline herdado TFA-005: p95 661,6 ms, heartbeat 636,1 ms, varredura 141,7 ms. Os números alternativos 700/700/250 não estão aprovados; não atualizar gate, truncar, virtualizar ou introduzir worker. Registrar separadamente regressão de trash/undo e pendência herdada; falha material exige revisão, sem afirmar que npm/build ou archive antigo provaram performance.

### D10 — Interface, confirmações e foco

Uma janela principal com acesso Lixeira no header/lista vazia, modo trash com Voltar, título/data local de exclusão pt-BR e ordem D2. Reutilizar estrutura/CSS da origem por recorte, sem novos recursos de busca/ordenação da lixeira. Voltar conserva filtros/ordem da sessão. Inicial/loading/stale/blocked/vazio são distintos, mensagem de retenção/limite acessível, retry não duplica subscription.

Excluir tarefa pede confirmação recuperável: 30 dias, 100 entradas, descartes colaterais e efeito em portadora (“interrompe novas ocorrências; nenhuma próxima será criada”). Definitiva e EMPTY pedem confirmação irreversível, explicitando remoção lógica; não prometer apagar páginas SQLite/backups forensicamente. Confirmar/abandonar/Escape usam mesmo foco/base. Dialog não pode agir em item mais novo porque título/ID coincidem.

Busy usa aria-disabled e handlers que ignoram dupla ação mantendo controle focável. Sucesso/recusa/erro têm status/alert com texto local, sem falso aviso de alarmes agendados. Oferta Desfazer fica na listagem e não expira por timer. Após delete/restauração/definitiva: controle pertinente do vizinho na posição anterior, novo último ou Voltar; erro retorna à origem se existe ou destino seguro se snapshot externo removeu o item. Abandono retorna à origem equivalente. Empty bem-sucedido foca Voltar; empty stale foca alerta de revisão e oferece atualizar/reabrir diálogo.

Undo foca Editar do alvo visível; se filtro o esconde, ação principal pertinente (Criar primeira tarefa/Limpar filtros/Nova tarefa). Não deslocar para gerada nem desfazer filtros. Refs/seletores escapados suportam IDs históricos; foco já movido por status focusout permanece válido conforme contrato atual. Verificar janela mínima 360×420, normal/maximizada, zoom200%, strings longas, contraste 4,5:1 texto/3:1 foco. Prova humana de leitor de tela/DPI é evidência separada; roteiro humano herdado permanece pendente se não executado.

### D11 — Rastreabilidade de aceitação e evidência

Cada ID L01–L12 refina a exploração e aponta aos deltas com cenários e grupos de tasks; todos são futuros neste propose.

| ID | Contrato/casos exigidos | Capability e grupo de tasks |
| --- | --- | --- |
| L01 | 29d/exatos30/30d+1ms/31d/futuro/DST/empates/relógio recuado/100→101/mesmo ID; discard da nova e nenhum undo colateral | trash; 1,2,5 |
| L02 | Campos completos/ISO/ordens/status/timestamps, move+prune+cap e restore atômicos, geração ausente/metadata nova | trash,persistence; 2 |
| L03 | Ausência/idade/identidade/ID_EXISTS/série recusam sem alteração; dados históricos não viram vazio | trash,recurrence; 2,5 |
| L04 | Startup/entrada/move explícitos, snapshots puros, filtro temporal/retry/purge falhado/no-op | trash,persistence; 1,2,5 |
| L05 | Duas sessões: check/edit durante confirm, restore×restore/permanent/empty/purge, ABA mesma data/revisão inicial duplicada; trash muda e tarefa independente não conflita | trash,IPC; 2,4,7 |
| L06 | Ofertas APPLIED apenas, clearing inclusive no-op/falha/dialog/área, tempo/minimize/filtros, tokens alheios/repetidos/contexto tardio/cleanup | undo,IPC,foundation; 3,4,6 |
| L07 | Before-image relida com checks recentes, todos campos/done, updatedAt/revisões novas, check/ABA bloqueia e claim conserva | undo,persistence; 1,3 |
| L08 | DONE/SKIP/END/fim natural/edição terminal/retirada/reabrir, anterior+gerada juntas; edit/check/delete/restore/avanço/série concorrente bloqueia tudo | undo,recurrence; 3,7 |
| L09 | Settlement<=now, AT/OFFSET/terminal/sem prazo/claims/futuros; D8; porta backup APPLIED/UNCHANGED/falha/cancel/lixeira intacta | undo,trash,recurrence; 1,3 |
| L10 | Falhas entre coleções e COMMIT, kill antes/depois/antes-resposta, reopen inteiro/incerto/sem replay/fila recuperável | persistence,undo; 2,3,7 |
| L11 | UI/confirm/Escape/duplo/busy/anúncio/foco externo/IDs/zoom; schemas/versões/bytes/guards/token/contexto nas três fases | trash,undo,management,IPC; 4,5,6,7 |
| L12 | Uma subscription/projeção tasks+trash; 8 documentos/reservas64MiB/charge/heap/liberação/datasets/runtime/D10 retido | undo,IPC,persistence; 3,4,7,8 |

Gates existentes npm run validate (lint/cinco typechecks/testes/build) e OpenSpec estrito. No apply aprovado, package:win --publish never, verify:package e smoke:packaged do produto fictício sem executar Setup. Reaproveitar fault points/crash-child/harness test-only, barreiras determinísticas e perfis exclusivos, nunca matar app/dados reais. Provar isolamento/catalog17, tokens/duas superfícies, retention/reopen/undo de séries e commit sem resposta com runtime/PRAGMAs efetivos. Não usar banco foundation-proof como substituto nem kill como prova de energia. Documentação operacional/paridade/testes acompanha implementação; README factual somente após archive autorizado.

## Risks / Trade-offs

- [Move com metadata antiga permite ABA] → revisão nova na linha de trash, teste explícito de coexistência tasks/trash e mesmo relógio; sem SQL novo.
- [Clone de snapshot stale perde marks/claims] → capturar na unidade, preservar markers da mesma ocorrência e settlement puro.
- [Commit retorna recusa depois de efeitos] → planejar/reservar primeiro; falha posterior à escrita lança rollback; pós-commit perde oferta sem reverter dados.
- [Contexto/backup muda antes de publicação tardia] → ticket+sequência+época internos, reserva contabilizada e guards nas três fases.
- [Reverter restaura duas portadoras] → conferir plano final por coleção e remover gerada atomicamente; não reaproveitar helper incompleto.
- [Relógio recuado elimina nova exclusão pelo limite] → preservar política por data, aviso explícito e retained:false sem falsa oferta.
- [Lembrete restaurado notifica atrasado ou perde claim] → preservar ocorrência processada e liquidar<=now; scheduler fica TFA-008.
- [Memória válida excede orçamento] → RESOURCE_LIMIT antes de commit, dados intactos e medidas de heap/charge; sem limite retroativo de codec.
- [D10 herdado/prova humana confundidos com sucesso novo] → evidência separada, gate retido e relatório honesto no verify futuro.

## Migration Plan

1. Após aprovação e novo apply, atualizar núcleo/contratos/main/preload/renderer juntos, mantendo schema SQL2/codec4/runtime/lockfile. Não migrar payloads ou revisões antigas na abertura; startup faz somente manutenção explícita por idade depois do preflight válido.
2. Evoluir move para nova identidade e ajustar testes/documentação que exigiam metadata conservada. Metadados resultantes continuam válidos para leitor SQL2 anterior; Task/timestamps não mudam no move. Não há SQL3/novo índice/tabela/log de undo.
3. Mutação v3 recusa v2, estado continua v2 e novas operações usam v1 próprio. Novas sessões iniciam contador vazio, sem migrar tokens/receipts. Atualização/encerramento conserva commits e perde undo temporário intencionalmente.
4. Binário antigo SQL2 pode ler dados confirmados, mas não tem novas ações/política; não prometer compatibilidade IPC misturando processos de versões diferentes. Retorno a binário antigo não recupera entradas descartadas pela retenção/cap/permanent e não reconstrói undo. Downgrade para SQL1 mantém recusa já existente.
5. Validar unidade/IPC/UI/pacote/datasets sem Setup. Depois de apply, executar verify e gerar verification.md na própria Change com L01–L12, evidências e pendências; aguardar aprovação explícita antes de archive/consolidação/README/integração.

Não há decisão material delegada ao apply. Empates, relógio recuado, identidade de entrada, contexto, versões, memória e recorte de reminders/backup são escolhas concretas propostas para revisão. Rótulos finais podem ser refinados mantendo sentido/foco; mudança observável ou orçamento diferente exige revisão coerente dos artefatos antes de implementar o ponto.
