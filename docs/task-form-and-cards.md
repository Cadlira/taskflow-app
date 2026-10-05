# Formulário e cartões: recorrência, subtarefas e concorrência

**Estado:** implementado no apply da TFA-005 (2026-10-04); verificação formal e medição de pacote
pertencem ao grupo 7/8 da Change. Este documento descreve o comportamento do renderer
(`src/renderer/src/stores/tasks.ts` e `src/renderer/src/components/tasks/`). As regras puras estão
em [domain-recurrence-and-subtasks.md](domain-recurrence-and-subtasks.md); catálogo IPC, schema e
migração ficam em [local-persistence-and-state-ipc.md](local-persistence-and-state-ipc.md).

Nada aqui anuncia recursos futuros: não há excluir, lixeira funcional, desfazer, backup, lembretes
editáveis, notificações, captura, atalhos globais ou IA.

## Store e concorrência entre edição e marcações

O store fala o estado/mutações v2 e usa **a revisão de edição** (`editRevision`) como base:

- Abrir a edição captura `{ task, contentRevision, editRevision }` do snapshot. `updateTask`,
  `changeTaskStatus` e `setSubtaskDone` enviam essa `expectedEditRevision`; `openTaskSource`
  continua v1 com `expectedContentRevision`.
- O ack v2 registra `contentRevision` **e** `editRevision`, e a confirmação só é anunciada quando o
  snapshot de revisão global `>=` ack chega (no-op resolve imediatamente com as revisões atuais).
- **Save após checks:** marcar subtarefas conserva `editRevision` no main; o formulário continua
  aplicável com a revisão capturada ao abrir e a lista é enviada apenas por `id`/título, sem `done`.
  O proprietário lê os `done` atuais na unidade e preserva as marcações recentes.
- **Estrutura alterada conflita:** campo, título, ordem, lista, regra ou status mudados por outra
  superfície alteram `editRevision`; a base antiga recebe `CONFLICT` com
  `currentContentRevision`/`currentEditRevision` e o formulário conserva draft e base. Não há
  rebase/merge automático: recarregar a versão atual é uma decisão explícita que descarta o draft.
- Marcação de item usa `done` desejado e o `subtaskId`; a intenção já satisfeita é no-op, item
  ausente com base atual devolve `SUBTASK_NOT_FOUND`, e a última intenção aplicável vence no mesmo
  item sem inversão por snapshot antigo.
- Resultado incerto de transporte conserva tudo e exige “Conferir lista” (ressync) antes de uma nova
  decisão — nenhum comando é repetido automaticamente. `BUSY`/`SNAPSHOT_STALE`/`SESSION_CLOSED`
  permanecem bloqueios explícitos.

| Resposta do main | Efeito na interface |
| --- | --- |
| `CONFLICT` | Painel de conflito com revisões atuais; draft/base preservados; recarga só com confirmação. |
| `NOT_FOUND` | Aviso de tarefa ausente; nada é recriado. |
| `SUBTASK_NOT_FOUND` | Aviso no cartão; nenhuma marcação é confirmada e o foco volta ao cartão. |
| `ADVANCED_TASK_RESTRICTED` | Motivo D8 (abaixo) no formulário ou na lista. |
| `RECURRENCE_CHOICE_REQUIRED` | Diálogo SKIP/END; nada gravado até a escolha. |
| `SERIES_CONFLICT` / `IDENTITY_CONFLICT` / `RECURRENCE_OUT_OF_RANGE` / `RESOURCE_LIMIT` | Mensagens finitas; banco/regra/draft preservados. |

## Formulário

### Recorrência

- Freqüência com parâmetro exato: DAILY 1–365 dias, WEEKLY 1–7 dias distintos (0 domingo–6 sábado),
  MONTHLY 1–31; `until` opcional em `datetime-local`.
- A regra só entra no patch quando **difere** da atual (frequência, parâmetro ou limite editado);
  regra e lista intactas não são reenviadas. `until` não tocado é omitido (o main conserva o ISO,
  inclusive segundos/milissegundos); limpá-lo envia `null`; digitá-lo envia o ISO convertido.
- A retirada é explícita pelo botão “Remover recorrência” e envia `recurrence: null` **sem** alterar
  status nem prazo. O aviso informa que o status, o prazo e os lembretes da ocorrência permanecem e
  que as próximas gerações deixam de acontecer; é possível desfazer a retirada antes de salvar.
- Revisão de fuso: se o fuso do sistema mudou durante a edição, alterar prazo **ou** limite bloqueia
  o save até confirmar a interpretação no fuso corrente ou restaurar os valores salvos
  (`date-time.ts`). Datas intactas nunca são reconvertidas pelo input de minutos.
- Adicionar/alterar regra combina com o prazo atual do formulário; sem prazo o main responde
  `DUE_REQUIRED`, e `until` anterior ao prazo responde `UNTIL_BEFORE_DUE`. Lembrete absoluto
  existente responde `ABSOLUTE_REMINDER_INCOMPATIBLE` sem apagá-lo.

### Subtarefas

- Lista ordenada com até **20** itens (contador sempre visível), título trim 1–200
  (`maxlength=200` no controle). Itens novos não têm ID e começam desmarcados; itens existentes são
  enviados com `{id, title}` na ordem exibida, nunca com `done`.
- Adicionar, remover, mover para cima e mover para baixo são `<button>` alcançáveis por teclado; as
  extremidades usam `aria-disabled` e não executam ação. O foco acompanha o item adicionado/movido.
- Erros do main são associados ao índice (`subtasks.items[index]`): `aria-invalid`, mensagem
  vinculada por `aria-describedby` e foco no **primeiro** controle inválido em ordem de documento
  (básicos, regra e lista). Título histórico intacto não sofre limite retroativo; renomear aplica o
  limite.
- Lista ausente conserva; `[]` limpa. Reordenar/mover de volta ao estado original omite a lista.

### Foco, limite e cancelamento

- Abrir o formulário foca o título; salvar com erro foca o primeiro inválido ou o alerta de
  mensagem. Cancelar não grava e devolve o foco a “Nova tarefa”; reabrir mostra os dados confirmados.
- Enquanto o save está em andamento os botões usam `aria-disabled` e o store bloqueia duplo envio.

## Cartões

- O cartão mostra o resumo da regra (ex.: “A cada 3 dias”, “Semanalmente: seg, qua”,
  “Mensalmente: dia 15”) com o limite formatado, além do progresso derivado `done/total` do
  snapshot. Nenhum contador de progresso é persistido.
- A expansão das subtarefas é **transitória por cartão** (não grava preferência e não sobrevive ao
  remount). Com a lista expandida, cada item tem um checkbox que envia a intenção `done` desejada em
  **qualquer status** (TODO/IN_PROGRESS/DONE/CANCELLED), sem alterar status, prazo, regra ou
  lembretes.
- O checkbox nunca faz marcação otimista: o clique é cancelado no DOM e o valor exibido continua
  vindo do snapshot. Em busy ele permanece focável com `aria-disabled` e ignora novo gesto; falha
  conserva o valor antigo e devolve/recupera o foco sem anunciar sucesso falso.
- Concluir ou reabrir a tarefa não limpa checks; só a próxima ocorrência os reinicia (no main).
- Quando o cartão deixa o filtro (status/pesquisa) ou uma ocorrência gerada entra, o foco vai para o
  controle equivalente da tarefa, para o vizinho de posição ou para a ação de lista vazia, como
  antes. IDs históricos hostis não interpolam seletores: o cartão usa `encodeURIComponent` e a lista
  compara `data-task-id`/`data-subtask-id` iterando os nós.

## Cancelamento de ocorrência recorrente (SKIP/END)

- CANCELLED de tarefa recorrente por Enter, ponteiro ou save abre um diálogo acessível com “Pular
  esta ocorrência” (SKIP) e “Encerrar a série” (END), além de abandonar/Escape. Nada é gravado antes
  da escolha.
- A segunda chamada reutiliza a **mesma** `expectedEditRevision` e o mesmo patch/status capturados;
  a base da edição não é trocada durante o diálogo. Se a versão mudar nesse intervalo, o `CONFLICT`
  aparece e a recarga continua exigindo confirmação explícita.
- Abandonar conserva dados/draft e devolve o foco ao controle que abriu o diálogo. DONE não exige
  diálogo.
- **Exceção documentada:** CANCELLED recorrente por **saída de foco** restaura a seleção exibida, não
  abre diálogo, não emite comando e não rouba o foco válido que o usuário já moveu. Setas,
  Home/End, PageUp/PageDown, Enter e Escape continuam valendo para o status simples.

## Guarda de lembretes (D8)

Com lembretes presentes, o main recusa — e o renderer explica — mudança efetiva de prazo ou status e
qualquer fechamento/geração (DONE/SKIP/END), inclusive retirar a regra combinada com mudar
prazo/status:

> Esta tarefa tem lembretes. Alterar prazo ou status e gerar outra ocorrência depende da integração
> de lembretes.

A retirada isolada da regra é permitida e tem mensagem própria (“Remover a recorrência mantém o
status, o prazo e os lembretes desta tarefa.”). Título, descrição, tags, pessoas, prioridade,
origem, estrutura/marcações de subtarefas e edição de regra que não mude prazo/status nem feche a
ocorrência continuam permitidos. Nenhum scheduler, notificação ou reconciliação é entregue.

## Limitações transitórias

- Expansão de cartão, draft do formulário e escolha de diálogo são estados de interface **não
  persistidos**; fechar a janela/crash os descarta (o estado confirmado vem sempre do snapshot).
- A guarda D8 permanece até a Change de lembretes; os limites de 32.768 passos e de recurso
  (`RESOURCE_LIMIT`) são erros finitos sem alteração parcial.
- Persistem fora desta entrega: undo, lixeira funcional, backup/restauração, notificações, edição de
  lembretes, captura/Quick Add/atalhos e IA.

## Testes de renderer

| Arquivo | Cobertura principal |
| --- | --- |
| `tests/renderer/tasks-store.test.ts` | Inscrição v2, ack/snapshot e revisões, expectedEditRevision, conflito com edit atual, marcação por intenção, novos códigos, incerto/ressync. |
| `tests/renderer/task-form.test.ts` | Criação/edição de regra e lista, retirada explícita, omissão de campos intactos, id/título sem `done`, erros por índice, 20/200, mover por teclado, revisão de fuso de prazo e until, cancelar sem gravar. |
| `tests/renderer/task-list.test.ts` | Seletor de status/teclado (incluindo focusout CANCELLED recorrente), resumo/limite, checkbox por intenção nos quatro status, busy focável, expansão transitória, progresso, IDs hostis. |
| `tests/renderer/task-manager.test.ts` | Diálogo SKIP/END (abandono, Escape, escolha, save), CONFLICT pós-abertura, D8, marcação/erro/foco, cancelar sem gravar, foco de vizinho com cartão saindo e gerada entrando. |
| `tests/renderer/date-time.test.ts` / `date-time-tz.test.ts` | Conversão local, gap/repetição, ISO intacto e revisão de fuso do until em São Paulo. |
