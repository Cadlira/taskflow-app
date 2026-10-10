# Gerenciamento de tarefas e interface — TFA-004

**Estado:** Change **arquivada em 2026-10-04** (`openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface`, specs consolidadas) com verificação aprovada por decisão humana. Este documento descreve o que a TFA-004 entrega, o que permanece nas Changes seguintes e as pendências pós-archive — em especial o orçamento D10 de 10.000 tarefas mantido reprovado no smoke, que exige revisão formal do orçamento de reordenação completa ou uma Change de janela de renderização.

## Seleção portável reutilizada da origem

Origem consultada somente para leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Licença MIT nos dois repositórios, mesmo titular (`LICENSE` da extensão: SHA-256 `becdb13a5faa7c74b0cbbb868a39a8ebade3283672ebc0f6fc44c130502ec1af`). A cópia é revisada linha a linha, com sintaxe adaptada ao TypeScript estrito do app (imports com `.js`, `noPropertyAccessFromIndexSignature`) e cabeçalho indicando a origem.

| Origem (extensão) | SHA-256 de origem | Destino (app) | O que é reutilizado | O que fica de fora |
| --- | --- | --- | --- | --- |
| `src/domain/task-status.ts` | `5ac36f71e072a2a602447e3dda3fe54aeb5c84e7f7b9d289c0928e7d3a506bb0` | `src/domain/task-status.ts` | `applyStatus`, `completeTask`, `cancelTask`, `reopenTask` | Nada; arquivo integral. |
| `src/domain/task-queries.ts` | `48aea9a95a9d09b37234e5530f5a64c01c268ef6451b14a00c75146941946c45` | `src/domain/task-queries.ts` | Busca substring/trim/caixa (inclui títulos de subtarefas), filtros AND, três comparadores/desempates, `getDueSituation` | Nada; limites e ordenação preservados. |
| `src/domain/task-draft.ts` | `9c3e7919ec50e0146fc05cd4b23373596cddb9867dccb0cc7a5af9bedd2af764` | `src/domain/task-draft.ts` (novo, básico) | `TASK_LIMITS`, normalização de textos/tags, `isHttpUrl`, defaults TODO/MEDIUM, criação básica e aplicação de patch | Regras de lembretes, recorrência, subtarefas, IA e `updateTask` integral (que limpa reminders/recurrence omitidos). |
| `src/components/tasks/date-time.ts` | `c7ab2c71ee438b9d9dbeb5ad250b554ccee2dddfe91f1fdd6784c0644f00030d` | `src/renderer/src/components/tasks/date-time.ts` | `toLocalDateTimeInput`, `fromLocalDateTimeInput`, `formatDateTime` e casos de borda | Reescrito com preservação de ISO intacto, detecção de mudança de fuso e porta de relógio local injetável. |
| `src/components/tasks/TaskForm.vue` | `b7647767f0bcc7bc38be293257eeabf818637e56f5caf1ad8d24a8fa53ed7f9c` | `src/renderer/src/components/tasks/TaskForm.vue` (novo, básico) | Campos básicos, rótulos, `aria-*`, foco inicial/primeiro erro, estilos essenciais | Fieldsets, imports e handlers de subtarefas editáveis, recorrência, lembretes, IA, captura e confirmações de série. |
| `src/components/tasks/TaskList.vue` | `8f50f0cddaedab6729da9f45970783e047997a3196ec8e7b5a82b937092385f1` | `src/renderer/src/components/tasks/TaskList.vue` (novo) | Cartão, badges de prazo, seletor de status com teclado (`Enter`/`focusout`/`Escape`, `aria-disabled`), ações Concluir/Cancelar/Reabrir, subtarefas **somente leitura** | Botão Excluir, marcação/reordenação de subtarefas, `delete`, recorrência mutável e confirmações de série. |
| `src/components/tasks/TaskFilters.vue` | `1779e776d782ea33e0dfc31a19f20b4fb1f33804391128b2c123a87b2a4db569` | `src/renderer/src/components/tasks/TaskFilters.vue` (novo) | Pesquisa/filtros/ordenação e Limpar filtros, quase integral | Nada funcional; apenas imports/caminhos adaptados. |
| `src/components/tasks/TaskManager.vue` | `d8bea74fcfb0aa53210a41d4abb2ea979a595b184c36cf4c168e4d7383be17d1` | `src/renderer/src/components/tasks/TaskManager.vue` (novo, básico) | Fluxo lista/criar/editar, estados, foco pós-ação/vizinho/Limpar filtros, live regions | Captura, lixeira, backup, IA, undo, recorrência, subtarefas editáveis e diálogos de série. |
| `src/components/tasks/task-labels.ts` | `6bfcccabed2af21fbb0c94761e9e7afd60ff31a53b40af27ff4c91520e707845` | `src/renderer/src/components/tasks/task-labels.ts` (subconjunto) | `STATUS_LABELS`, `PRIORITY_LABELS`, `DUE_SITUATION_LABELS`, `SORT_LABELS`, progresso de subtarefas | Rótulos de recorrência, lembretes, IA e unidades. |
| `src/components/tasks/task-status-origin.ts` | `0954c11255720338abacc20bd632e4ccc736a893ed069f539252b7564809beea` | `src/renderer/src/components/tasks/task-status-origin.ts` | `TaskStatusAction`, `StatusChangeOrigin`, `subtaskKey` | Nada; arquivo pequeno integral. |
| `src/stores/task-store.ts` | `e9d345a791eb0db333317125d45306d978d04f0f85d1c7a0e1b3446adf4c9f90` | `src/renderer/src/stores/tasks.ts` (novo) | Getters/filtros/seleção, relógio de 60 s, transição para fonte versionada | `TaskService`/`UndoPlan`/scheduler/lixeira/backup/IA, `instanceof`, `upsert` local e escrita no renderer. |
| `src/styles/base.css` | `3643e345fdb308860993a6a154ba67493de61cd9dcb7abdf75988da4fd76456f` | `src/renderer/src/style.css` (revisado) | Tokens de cor, contraste, `focus-visible`, controles e textos auxiliares | Escopos que conflitam com o shell atual; ajustes de wrapping/scroll para a janela. |
| `tests/domain/task-status.test.ts` | `e1701bcef373e87930f0f66fc68ed54cade7c8fd78d2a2db1c11421d0ad6e203` | `tests/domain/task-status.test.ts` | Transições de status e auditoria | Nada; casos básicos. |
| `tests/domain/task-queries.test.ts` | `61e5cab47ec597e9fa1a16e78a0722ba632ff59ac80442469d031f12c9d04edf` | `tests/domain/task-queries.test.ts` | Campos da busca, AND, ordenação/desempates e fronteiras de prazo | Casos que dependam de séries/subtarefas mutáveis. |
| `tests/domain/task-draft.test.ts` | `c6ee6b0bd24d57da61148c1cea1c17d06c7036607c1d7334200b4eff1b1b6d21` | `tests/domain/task-draft.test.ts` (básico) | Casos de campos/limites/tags/URL/defaults e patch | Casos de lembretes, recorrência e subtarefas rascunháveis. |
| `tests/components/tasks/date-time.test.ts` | `ca3d43f365766888e117306f561969620b62e7877e7acfb65b8c3b59795c8d31` | `tests/renderer/date-time.test.ts` | UTC↔local, vazio, data impossível, leap day | Nada; casos revisados e ampliados para ISO intacto e fuso. |
| `tests/components/tasks/TaskList.test.ts` | `0fc05c6340d59e6ffd8ab5ad2fa15be98414309e5fc6b1496c829f97b2532b63` | `tests/renderer/task-list.test.ts` | Teclado/foco do seletor e ações de status | Casos de exclusão e marcação de subtarefas. |
| `tests/components/tasks/TaskManager.test.ts` | `8191e8870e113a56dc7f235e5a857f0f520add9ebcae87efe87d3fcaadea6a69` | `tests/renderer/task-manager.test.ts` | Estados, foco pós-ação/erro, Limpar filtros | Casos de captura, lixeira, backup, IA e undo. |
| `tests/components/tasks/TaskForm.test.ts` | `318962cbe0ba353e494f7068b87f959d339e2b91ae435ac5d9e16f9222849e88` | `tests/renderer/task-form.test.ts` (básico) | Campos/erros/foco, limpar opcionais, cancelar | Subtarefas/recorrência/lembretes/IA. |
| `tests/stores/task-store.test.ts` | `0c5f5212d13385cd5b378f3499b7978e5d550848b69ab0286c17be55790c6caf` | `tests/renderer/tasks-store.test.ts` | Filtros/ordenação/seleção/relógio | Inscrição via `TaskService`, undo e lixeira; substituídos por porta desktop/rastreamento de revisões. |

**Verificação negativa da seleção:** busca por `chrome.`, `browser.`, `WXT` e `wxt` nos arquivos selecionados não encontrou nenhuma referência. Não entram no app `.git`, dados, segredos, `node_modules`, builds, adapters Chrome, `TaskService` inteiro, scheduler, backup, captura, atalhos, IA, `task-undo` nem testes de lixeira/recorrência/lembretes. Nenhuma ferramenta de escrita foi executada na origem; a leitura usou somente `git rev-parse`, `status`, `grep` e `sha256sum`.

## Contratos públicos dos comandos v1

A bridge exposta ao renderer mantém as **quatro operações existentes** (`verifyFoundation`, `getStateSnapshot`, `subscribeState`, `unsubscribeState`) e acrescenta exatamente **quatro comandos** com canal dedicado:

| Comando | Canal | Request (schema exato) | Sucesso |
| --- | --- | --- | --- |
| `createTask` | `task:create:v1` | `{ version: 1, draft }` | `{ version: 1, status: 'ok', taskId, revision, contentRevision }` |
| `updateTask` | `task:update:v1` | `{ version: 1, taskId, expectedContentRevision, patch }` | `{ version: 1, status: 'ok', revision, contentRevision }` |
| `changeTaskStatus` | `task:status:v1` | `{ version: 1, taskId, expectedContentRevision, status }` | igual ao update, inclusive no-op |
| `openTaskSource` | `task:source:open:v1` | `{ version: 1, taskId, expectedContentRevision }` | `{ version: 1, status: 'ok' }` |

- **Draft de criação:** somente as nove chaves básicas; `title` obrigatório; ausência usa TODO/MEDIUM e demais opcionais ausentes. `null` em opcional equivale a ausência; `title`/`status`/`priority` não aceitam `null`.
- **Patch de edição:** todas as chaves opcionais; **ausente = conservar**; `null` limpa descrição, solicitante, responsável, prazo e origem; `[]` limpa tags. Título/status/prioridade não aceitam `null`. Campos de auditoria (`id`, `createdAt`, `updatedAt`, `completedAt`), avançados (`recurrence`, `seriesId`, `subtasks`, `reminders`, `processedFor`) e de sistema (`path`, opções do shell) são **recusados por chave extra** antes de qualquer leitura.
- **Revisão de conteúdo:** string decimal canônica (0 a `9223372036854775807`). Não é timestamp nem revisão global; `taskId` é string não vazia compatível com o codec histórico (não exige UUID).
- **Orçamentos:** request de comando **64 KiB** UTF-8 JSON serializado (envelope e escaping incluídos); resposta **8 KiB**. Request acima do orçamento é `INVALID_REQUEST`; resposta que excederia o orçamento nunca é truncada (viraria `RESOURCE_LIMIT` no main). Leitura/diagnóstico/eventos continuam 1 KiB, páginas 256 KiB, fila/sessões intactas.
- **Erros:** união fechada por operação. Base: `INVALID_REQUEST`, `UNAUTHORIZED`, `BUSY`, `SESSION_CLOSED`, `RESOURCE_LIMIT`, `INCOMPATIBLE_DATA`, `CORRUPTED_DATA`, `STORAGE_UNAVAILABLE`. Mutação acrescenta `VALIDATION_FAILED` (com `fields` das nove chaves para `REQUIRED`/`TOO_LONG`/`TOO_MANY`/`INVALID_VALUE`/`INVALID_DATE`/`INVALID_URL`), `CONFLICT` (pode trazer `currentContentRevision`) e `NOT_FOUND`; na v1 documentada, `recurrence`/`reminders` bloqueados devolviam `ADVANCED_TASK_RESTRICTED`. A TFA-008 removeu essa restrição de reminders (create v4/update v5; ver [guia desktop](desktop-reminders-and-lifecycle.md)). `openTaskSource` acrescenta `CONFLICT`, `NOT_FOUND`, `SOURCE_NOT_AVAILABLE`, `SOURCE_NOT_ALLOWED`, `SOURCE_TOO_LONG` e `EXTERNAL_OPEN_FAILED`. Nenhum erro transporta stack, `cause`, SQL, path, payload, URL ou dados sensíveis.
- **Validação em runtime:** `src/contracts/tasks.ts` valida protótipo, chaves exatas, tipos, enums, limites e bytes antes de qualquer leitura; o preload valida a resposta antes de entregá-la ao renderer. Saída malformada não é aceita como sucesso.
- **Campos históricos:** um valor intacto acima do limite de formulário permanece válido; se alterado, a nova entrada precisa cumprir o limite. Não há novo limite de codec.

Exemplos conferidos contra os esquemas (`src/contracts/tasks.ts`):

```ts
await window.taskflowDesktop.createTask({ version: 1, draft: { title: 'Comprar leite' } })
// → { version: 1, status: 'ok', taskId: '…', revision: '7', contentRevision: '7' }

await window.taskflowDesktop.updateTask({
  version: 1,
  taskId: 'tarefa-1',
  expectedContentRevision: '7',
  patch: { dueAt: null, tags: [] }, // limpa prazo e tags; demais campos conservados
})
// → { version: 1, status: 'ok', revision: '8', contentRevision: '8' }

await window.taskflowDesktop.createTask({ version: 1, draft: { title: 'x', recurrence: { frequency: 'DAILY' } } })
// → { version: 1, status: 'error', code: 'INVALID_REQUEST' } (chave extra, zero leitura)

await window.taskflowDesktop.updateTask({ version: 1, taskId: 'a', expectedContentRevision: '7', patch: { title: '' } })
// → { version: 1, status: 'error', code: 'VALIDATION_FAILED', fields: { title: 'REQUIRED' } }
```

## Casos de uso, bytes e erros

**Onde vive cada camada:** regras básicas em `src/domain/task-draft.ts` e `src/domain/task-status.ts`; consultas em `src/domain/task-queries.ts`; casos de uso em `src/application/tasks/task-commands.ts`; validação da origem em `src/application/tasks/source-url.ts`; cliente do preload em `src/application/tasks/task-client.ts`; handlers em `src/main/ipc/tasks.ts`; composição em `src/main/index.ts`. Nada disso atravessa o núcleo portável com dependência de Electron/Node/Vue.

**Criação** (`createTaskInUnit`): valida o draft; gera ID pelo gerador injetado; recusa colisão em tarefas **e** na lixeira com até três tentativas; falha final é `RESOURCE_LIMIT` sem commit e sem evento; nenhum ID existente é substituído. O ack traz `taskId`, revisão global e revisão de conteúdo; o estado completo continua vindo do snapshot.

**Edição e status** (`updateTaskInUnit`/`changeTaskStatusInUnit`): releem a tarefa na unidade, conferem revisão de conteúdo (CAS), aplicam os guards e planejam o patch sobre o estado atual; base stale devolve `CONFLICT` com a revisão atual; tarefa ausente devolve `NOT_FOUND` e nunca é recriada; no-op não grava, não incrementa revisão nem emite evento. Mudar outra tarefa ou um claim de lembrete (que conserva a revisão de conteúdo) não gera falso conflito.

**Concorrência de duas sessões:** a primeira unidade aplicável confirma; a segunda chega com base antiga e recebe `CONFLICT`. A ordem é determinística pela fila do coordenador, sem `sleep` nem timestamp.

**Guards avançados aplicados no main (não só ocultos na UI) — estado v1–v3, superado em parte pela TFA-008:**
- `recurrence` presente → `ADVANCED_TASK_RESTRICTED` para qualquer mutação.
- `reminders` presentes → na v1–v3, mudança **efetiva** de `dueAt` ou `status` recusada; edição independente permitida com lembretes e `processedFor` preservados. A TFA-008 removeu a restrição: prazo/status/fechamento liquidam pendentes vencidas (`<= now`, sem graça) e reconciliam a geração na mesma unidade; `ADVANCED_TASK_RESTRICTED` deixou de existir no catálogo corrente.

**Bytes e erros:** request de comando até 64 KiB UTF-8 serializado (medido no envelope completo, incluindo escaping) e resposta até 8 KiB. Excesso de request é `INVALID_REQUEST`; resposta que excederia o orçamento vira `RESOURCE_LIMIT` sem truncar. `VALIDATION_FAILED` só leva o mapa finito das nove chaves; `CONFLICT` pode levar `currentContentRevision`; nenhum erro leva stack/`cause`/SQL/path/payload/URL. O preload valida o request antes de enviar e a resposta antes de devolver; transporte perdido/saída inválida vira falha local (`TaskCommandTransportError`) que o renderer trata como resultado incerto, sem repetição automática.

**Testes desta camada:** `tests/contracts/task-command-contract.test.ts` (schemas/bytes/respostas), `tests/application/task-commands.test.ts` (colisão, CAS, ABA, no-op, claim isolado, guards, histórico extenso, rollback por fault injection), `tests/main/ipc-tasks.test.ts` (autorização, zero leitura antes do guard, acks, conflito/ausente/restrito, origem e sessão) e `tests/preload/bridge-catalog.test.ts` (catálogo de oito operações, canais fixos e falha local sem repetição).

## Origem externa controlada

**Ação:** na edição/leitura, um botão **Abrir origem salva** aparece junto ao campo de URL quando a tarefa tem `sourceUrl`. A ação usa o ID e a revisão da tarefa; o renderer nunca envia a URL nem opções do shell. Se o usuário alterou o campo, a ação continua se referindo ao **valor salvo** (o texto de ajuda deixa isso claro); não existe "abrir o que está no rascunho".

**Validação no main:** antes de qualquer parse, a string é recusada se contiver controles (`U+0000`–`U+001F`, `U+007F`). Depois, o parse precisa ser HTTP/HTTPS com host, sem usuário/senha; `file:`, `javascript:`, `data:`, `mailto:`, `taskflow:`, caminhos UNC e strings não-URL são recusados (`SOURCE_NOT_ALLOWED`). O `href` serializado é limitado a **2081 caracteres** (limite documentado do Windows); acima disso, `SOURCE_TOO_LONG`, sem truncar nem regravar. Tarefa sem origem devolve `SOURCE_NOT_AVAILABLE`; ausente devolve `NOT_FOUND`; base stale devolve `CONFLICT`.

**Semântica de sucesso:** significa que o sistema **aceitou a solicitação** de abrir no navegador padrão — não que a página carregou, que o site é seguro ou que a origem continua acessível. A URL histórica permanece intacta no banco em qualquer recusa; falha do shell vira `EXTERNAL_OPEN_FAILED` e não autoriza repetição automática.

**Isolamento:** o shell é chamado **fora da transação**, por uma porta exclusiva do main, apenas com o `href` validado (sem `workingDirectory` ou opções arbitrárias). A sessão é revalidada imediatamente antes do efeito e antes de entregar a resposta; se o documento navegar durante a espera, o efeito único já solicitado não é repetido e a resposta não chega ao documento antigo. Nenhuma navegação remota, webview ou janela é aberta dentro do app.

**Evidência:** a suíte usa um **opener falso** (nenhum site é aberto durante os testes): `tests/application/source-url.test.ts` cobre protocolos/credenciais/controles/limite 2081–2082/Unicode e `tests/main/ipc-tasks.test.ts` cobre ausência, recusas sem alterar/revisar a tarefa, conflito, sessão encerrada durante a espera e falha do opener com efeito único. A prova Windows real com URL fictícia controlada fica na prova manual do pacote (sem dados privados), separada destes testes.

## Store, estados e sincronização

**Fonte de verdade:** a store Pinia (`src/renderer/src/stores/tasks.ts`) guarda apenas estado de apresentação (registros do snapshot, filtros, ordenação, seleção, `now`, estados de escrita); persistência continua no main. Ela **não** faz upsert otimista: a lista só muda quando chega snapshot completo validado do cliente de estado existente.

**Montagem e inscrição:** `connect()` é idempotente e usa `subscribeState` do cliente já entregue — uma única inscrição, um único listener e um único relógio por superfície. `disconnect()` cancela a inscrição e limpa timer/foco. O relógio de badges roda no renderer a cada 60 s e imediatamente ao retomar o foco; não é scheduler de lembretes.

**Estados explícitos:** `loading` (sem snapshot), `ready`, `empty` (snapshot válido sem tarefas), `noResults` (há tarefas, filtros não correspondem), `stale` (snapshot anterior conservado), `blocked` (erro inicial/corrupção/incompatibilidade sem snapshot) e os estados de escrita `submitting`, `awaitingConfirmation`, `updatePending`, `conflict`, `notFound`, `outcomeUnknown`. Erro nunca vira coleção vazia; snapshot regressivo é ignorado; `Retry` apenas ressincroniza sob a autorização corrente, sem reset.

**Ack, snapshot e resposta fora de ordem:** o comando devolve ack curto com revisão global e de conteúdo. Só depois do ack o sucesso é anunciado; a interface aguarda snapshot de revisão ≥ ack para encerrar o formulário/retornar foco. Se uma resposta antiga chegar depois de snapshot mais novo, a lista conserva o snapshot. Se o ressync falhar depois do ack (`stale`/`BUSY`), a interface informa **salvo, atualização pendente**, conserva os inputs e não anuncia rollback nem reenvia.

**Conflito, ausente e resultado incerto:** `CONFLICT` conserva draft e revisão-base; a interface oferece conferir a versão atual em leitura (sem alterar o draft), continuar revisando/editando e **recarregar** somente com confirmação explícita de descarte. `NOT_FOUND` conserva o draft e oferece conferir a lista; nada é recriado. Falha de transporte/saída inválida é **resultado incerto**: a escrita é bloqueada até **Conferir lista** por ressync e uma nova decisão explícita; título igual não prova criação. Não há rebase automático, retry automático, clipboard próprio ou merge.

**Limites do draft/filtros:** draft, filtros, seleção e o estado de conflito/incerto são **transitórios** — fechar a janela, recarregar, navegar ou um crash os perde; nada disso é persistido ou prometido como recuperável. O que sobrevive é o que foi confirmado no banco. A política de drafts persistidos, se necessária, pertence a uma Change futura (TFA-008/009).

**Testes:** `tests/renderer/tasks-store.test.ts` cobre handshake único/desconexão, loading/ready/empty/noResults/blocked/stale, relógio 60 s + foco, snapshot regressivo, ack→snapshot, ressync falhado, duplo envio, conflito (gate/inspeção/recarga), NOT_FOUND, resultado incerto com ressync obrigatório, validação/restrição e mapeamento do opener. A convergência entre duas superfícies e evento perdido no runtime real são da task 7.2.

## Interface, datas e acessibilidade

**Componentes:** `TaskManager.vue` (lista/criar/editar, estados, conflito/incerto, foco pós-ação), `TaskList.vue` (cartão, badges, ações rápidas, seletor de status, subtarefas somente leitura), `TaskForm.vue` (nove campos básicos, erros, revisão de fuso, abrir origem salva, recorrência em somente leitura), `TaskFilters.vue` (pesquisa/filtros/ordenação) e `stores/tasks.ts`. O diagnóstico da fundação foi movido para um `<details>` secundário acessível por teclado; o rodapé de “dados fictícios” foi removido. Não há redesign, Quasar, dashboard, novas colunas, controle de recorrência/subtarefa editável, backup, lixeira/undo, lembretes, captura, atalhos ou IA montados.

**Interação preservada:** hierarquia h1/h2/h3, `label`/`for`, `aria-invalid`/`aria-describedby`, live region para feedback, `role="alert"` para erros, nomes acessíveis das ações com o título da tarefa, foco inicial no título, foco no primeiro erro, retorno a **Nova tarefa** ao fechar e recuperação de controle equivalente/vizinho/limpar filtros quando o cartão sai do filtro. O seletor de status mantém setas/Home/End/PageUp/PageDown apenas escolhendo, `Enter` e saída de foco confirmando, `Escape` descartando e ponteiro confirmando; controles ocupados usam `aria-disabled` com gate de evento, sem perder foco.

**Datas:** o helper local preserva o ISO original quando o prazo não é editado (campo e patch ausentes), converte entrada local com comparação das partes (data impossível, gap e hora repetida) e exibe pt-BR. Mudança de fuso durante a edição com prazo alterado bloqueia o save até **Confirmar no fuso atual** ou **Restaurar prazo salvo**; sem alteração de prazo, o ISO salvo é conservado. Testes cobrem gap e hora repetida em subprocesso com `TZ` fixado, sem alterar o fuso do PC, além da porta de conversão injetada.

**Acessibilidade verificável nesta camada:** `tests/renderer/contrast.test.ts` calcula WCAG a partir dos tokens reais (texto ≥4,5:1 e foco/bordas ≥3:1); os testes de componente verificam rótulos, `aria-invalid`/`describedby`, live regions, foco inicial/primeiro erro, retorno de foco, teclado do seletor e ausência de controles futuros. **Limitação registrada:** dimensões mínima/normal/maximizada, zoom 200%, escala Windows, strings longas e leitor de tela **não** são comprovados por DOM/mocks; a prova manual no pacote Electron é a task 7.4 (G15/G20) e não é anunciada como executada aqui.

## Integração, volume e evidências

**Fluxo do pacote (2026-10-04):** `npm run validate` (34 arquivos/474 testes + 1 skipped, lint e cinco typechecks), `npm run package:win` (build + NSIS `--publish never`), `npm run verify:package` (ASAR de 12 arquivos na allowlist, sem addon/updater/segredos, `asInvoker/uiAccess=false`) e `npm run smoke:packaged`. O Setup **não** foi executado. Runtime do pacote: Electron 44.5.1, Node 24.21.0, Chromium 152, SQLite 3.53.4; hardware Intel Core i5-13420H (12 lógicos), 15,7 GiB, Windows 11 x64 build 26200.

**Cenários novos do harness (perfil `test` fictício, sem canal/hook na bridge normal):**
- `tasks` — 24/24 verificações: criar/editar/status/reabrir/abrir origem **pela UI real** (opener falso), duas superfícies convergindo, catálogo de oito operações congelado sem nomes futuros, quatro negativas de schema (`INVALID_REQUEST`/`VALIDATION_FAILED`), reconciliação por foco (leitura coordenada disparada), reload com resposta possivelmente perdida (nenhuma duplicação; `lateCount 0`), crash controlado do renderer com nova superfície recuperando o estado confirmado, limpeza de sessão/documentos e fechamento da janela principal com saída 0.
- `a11y` — 13/13: geometria inicial derivada da `workArea` do display da janela (borda direita, topo e base; largura = terço arredondado com piso 360 e teto na área útil — observado 1280,0,640×1032 sobre `workArea` 1920×1032), mínimo 360×420 mantido, janela redimensionável, foco inicial no título, nomes acessíveis, ações alcançáveis com zoom 200% no novo default de 640, string longa Unicode integral e abertura de `https://example.invalid/tarefa-a11y` pelo **shell real do Windows** aceita (`status ok`), sem alterar a tarefa. **Limitações:** evidência roteirizada no exe empacotado; não substitui leitor de tela, escala DPI ou inspeção humana, e não certifica instalação.
- `ui-bench` — alvos D10 com 1.000/10.000 tarefas fictícias:
  - 1.000: montagem **381 ms** (≤2 s), p95 de 20 interações de ordenação **41 ms** (≤500 ms), heartbeat **48 ms** (≤250 ms), 1.000 cartões, 38.902 elementos.
  - 10.000: montagem **2.191 ms** (≤5 s), 10.000 cartões (sem truncamento), 388.402 elementos, flush do Vue 144 ms e 9.999 movimentos de DOM; p95 **521 ms** e heartbeat **579 ms** — **os dois gates de 10.000 reprovaram** (alvos 500 ms e 250 ms).
  - **Revisão concreta já aplicada (sem truncar, virtualizar ou remover o gate):** cartões como componentes persistentes (props inalteradas não re-renderizam; só movem), registro raso no store, comparadores com chaves pré-calculadas, `content-visibility` por cartão e remoção de uma camada de `<li>`. O custo bruto medido do Chrome para reordenar os mesmos 10.000 nós é de ~165-340 ms (mover + estabilizar) sem framework; o alvo de 500 ms fica no limite dessa base. **Pendência de revisão:** para cumprir D10 em 10.000 com garantia, é necessária uma decisão explícita de produto/arquitetura (por exemplo, janela de renderização aprovada) ou a revisão formal do orçamento para o caso de reordenação completa; o gate permanece medido e reprovado. Na **máquina de referência** (sem flags), `smoke:packaged` termina reprovado por esse gate; no **runner hospedado**, a CI usa `smoke:packaged -- --ci-runner`, em que o orçamento pendente é reportado como WARN (medido, registrado e não bloqueante) e a abertura usa opener falso — o shell real e o gate D10 continuam sendo critérios da máquina de referência, sem truncamento ou virtualização.

**Diferenciação de níveis:** os testes de DOM/mocks provam regras, foco e estados; o harness prova UI+preload+main+banco no pacote; `verify:package` prova conteúdo/manifestos do ASAR; nada aqui prova instalação, Setup, notificações, bandeja, atalhos globais, performance em conta padrão ou CI remota (a CI não foi consultada nesta sessão).

## TFA-005 — catálogo v2

**Estado:** Change `preservar-recorrencias-e-subtarefas` em **apply** (ainda não arquivada). Esta seção documenta a fronteira IPC v2 desta etapa (grupo 4 — contratos e fronteira IPC); os grupos 5–7 (store/formulário, cartões e produto empacotado) e o `verification.md` permanecem pendentes e não são anunciados como concluídos.

### Nove wrappers de produção

O preload expõe um único objeto congelado com exatamente nove operações; nenhum canal livre, `send`, SQL, caminho, Task completa, UndoPlan, callback remoto ou hook de teste. As versões mudam em bloco: **estado e mutações de tarefas em v2**, `verifyFoundation` e `openTaskSource` conservados em v1.

| Wrapper | Canal | Request exato | Sucesso |
| --- | --- | --- | --- |
| `verifyFoundation` | `foundation:verify:v1` | v1 inalterado | `FoundationResult` v1 |
| `getStateSnapshot` | `state:snapshot:v2` | `{ version: 2 }` (ou `cursor` opaco) | `{ version: 2, status: 'ok', page }` |
| `subscribeState` | `state:subscribe:v2` | `{ version: 2 }` + callback local | `{ version: 2, status: 'ok', subscriptionId, page }` |
| `unsubscribeState` | `state:unsubscribe:v2` | `{ version: 2, subscriptionId }` | `{ version: 2, status: 'ok' }` |
| `createTask` | `task:create:v2` | `{ version: 2, draft }` | `{ version: 2, status: 'ok', taskId, revision, contentRevision, editRevision }` |
| `updateTask` | `task:update:v2` | `{ version: 2, taskId, expectedEditRevision, patch, cancellation? }` | igual ao create, sem `taskId` |
| `changeTaskStatus` | `task:status:v2` | `{ version: 2, taskId, expectedEditRevision, status, cancellation? }` | igual ao create, sem `taskId` |
| `setSubtaskDone` | `task:subtask-done:v2` | `{ version: 2, taskId, expectedEditRevision, subtaskId, done }` | igual ao create, sem `taskId` |
| `openTaskSource` | `task:source:open:v1` | `{ version: 1, taskId, expectedContentRevision }` | `{ version: 1, status: 'ok' }` |

### Shapes exatos dos comandos

- **`createTask`/draft:** os nove campos básicos (`title` obrigatório; `null` em opcional equivale a ausência) + `recurrence` opcional + `subtasks: [{ title }]`. A regra aceita exatamente `frequency` (`DAILY`/`WEEKLY`/`MONTHLY`) e as chaves fechadas `intervalDays`, `weekdays`, `dayOfMonth`, `until`; parâmetros de frequência alheia são recusados na forma (`INVALID_REQUEST`) antes de qualquer leitura, e a pertinência/limites 1–365/0–6 distintos/1–31 são validados no domínio, que devolve `REQUIRED`/`INVALID_VALUE` em `fields.recurrence`. `anchorAt`, `seriesId`, `id`, auditoria, `reminders`, `processedFor`, filhos, `path`, UndoPlan e opções do shell são recusados por chave exata antes de qualquer leitura.
- **`updateTask`/patch:** ausente conserva; `null` limpa `description`, `requester`, `assignee`, `dueAt` e `sourceUrl`; `[]` limpa `tags` e `subtasks`; `title`/`status`/`priority` não aceitam `null`. `recurrence` omitida conserva a regra (inclusive âncora), `null` a retira conservando status/série; `until` omitido conserva o limite, `null` o retira e string o altera. `subtasks` é uma lista ordenada `{ id?, title }`: `id` presente precisa existir na lista atual; ausente pede identidade nova desmarcada; `done` é proibido no draft.
- **`changeTaskStatus`/`setSubtaskDone`:** status e intenção explícitos; `done` precisa ser `boolean` (formas extrínsecas como string/inversão são `INVALID_REQUEST`). `expectedEditRevision` é a base CAS de edição; o toggle conserva a revisão de edição e nunca fecha/gera.
- **`cancellation`:** somente `'SKIP'`/`'END'`, apenas quando o plano CANCELLED carrega a regra; escolha em plano não pertinente devolve `INVALID_REQUEST` sem gravar, e falta devolve `RECURRENCE_CHOICE_REQUIRED`.
- **`openTaskSource`:** continua enviando `taskId` + `expectedContentRevision`; a URL e as opções do shell nunca vêm do renderer.
- **Snapshot v2:** cada `TaskRecord` carrega `{ task, contentRevision, editRevision }`; cada `TrashRecord` acrescenta `deletedAt`. As duas revisões são decimais canônicos, com `edit <= content`; leitura histórica não regrava payload nem expurga a lixeira.
- **Eventos v2:** `state:changed:v2` carrega `{ version: 2, subscriptionId, revision }` e `state:unavailable:v2` carrega `{ version: 2, subscriptionId, code }`; são invalidações pós-commit, nunca patches de tarefas.

### Códigos de erro fechados

- **Estado/diagnóstico (9):** `INVALID_REQUEST`, `UNAUTHORIZED`, `BUSY`, `SESSION_CLOSED`, `SNAPSHOT_STALE`, `RESOURCE_LIMIT`, `INCOMPATIBLE_DATA`, `CORRUPTED_DATA`, `STORAGE_UNAVAILABLE`.
- **Mutações v2:** a base de estado + `VALIDATION_FAILED`, `CONFLICT`, `NOT_FOUND`, `ADVANCED_TASK_RESTRICTED`, `RECURRENCE_CHOICE_REQUIRED`, `RECURRENCE_OUT_OF_RANGE`, `SERIES_CONFLICT`, `IDENTITY_CONFLICT`, `SUBTASK_NOT_FOUND`. (A TFA-008 retirou `ADVANCED_TASK_RESTRICTED` do catálogo corrente ao integrar reminders.)
- **`openTaskSource` v1:** a base de estado + `CONFLICT`, `NOT_FOUND`, `SOURCE_NOT_AVAILABLE`, `SOURCE_NOT_ALLOWED`, `SOURCE_TOO_LONG`, `EXTERNAL_OPEN_FAILED`.
- `VALIDATION_FAILED` transporta somente `fields` finitos: nove campos básicos com códigos fechados e, em forma posicional, `recurrence.<campo>`, `subtasks.list` e `subtasks.items[{ index: 0–19, title?, id? }]`. `CONFLICT` pode expor `currentContentRevision` e `currentEditRevision`, nunca conteúdo. Nenhum erro transporta stack, `cause`, SQL, caminho, payload ou URL.

### Orçamentos em bytes (UTF-8 serializado, envelope e escaping incluídos)

| Mensagem | Limite | Comportamento no excesso |
| --- | --- | --- |
| Request dos cinco comandos | 64 KiB | `INVALID_REQUEST` medido no envelope completo; nada é truncado ou reescrito |
| Resposta dos cinco comandos | 8 KiB | `RESOURCE_LIMIT` no main; o ack nunca é cortado para caber |
| Estado/diagnóstico e eventos | 1 KiB | request recusado; evento não é enviado |
| Página de snapshot | 256 KiB por página | fragmentação byte a byte, sem omitir registros; a montagem só publica com a mesma revisão e contagem conferida |
| Cursor/inscrição opacos | 16–128 caracteres `[A-Za-z0-9_-]` | token fora do padrão é recusado |

### Migração simultânea e ausência de alias

Main, preload e renderer mudam **no mesmo pacote**: não há negociação de downgrade nem fallback para estado/mutação v1. `{ version: 1 }` nos canais v2 de estado e mutação é recusado (`INVALID_REQUEST`) antes de qualquer leitura, e o preload recusa o request v1 sem sequer invocar o main. `verifyFoundation` e `openTaskSource` conservam v1; a abertura da origem continua exigindo a revisão de conteúdo atual. Não existe alias permissivo (canal v1 aceito no lugar do v2), canal de teste/harness/smoke na bridge de produção, `ipcRenderer.send` nem invoke genérico: o catálogo de canais é fechado em `TASK_COMMAND_CHANNELS` e nas listas de estado, e o preload só invoca esses canais.

**Evidência desta etapa (arquivos e cobertura):** `tests/contracts/task-command-contract.test.ts` (shapes v2, autoridade, budgets 64 KiB/8 KiB, saídas válidas/malformadas), `tests/contracts/state-contract.test.ts` (requests/eventos/registros v2, 1 KiB/256 KiB, fragmentos), `tests/main/ipc-tasks.test.ts` (guardas de admissão/execução/saída nos cinco comandos, ack pós-commit, no-op sem evento, toggle, série/identidade, ack+snapshot de fechamento) e `tests/main/ipc-state.test.ts`, `tests/application/state-client.test.ts`, `tests/application/snapshot-paging.test.ts` e `tests/preload/bridge-catalog.test.ts` (paginação v2, handshake/tokens, eventos pós-commit, dois registros de revisão, nove wrappers e canais exatos). A prova no Electron empacotado e a limpeza de listeners/timers em runtime real continuam na task 7.1.

## Operação: recorrência, subtarefas e guarda de lembretes

| Fluxo | O que está disponível agora | Limitações transitórias |
| --- | --- | --- |
| Criar/editar regra | Frequência e parâmetro exatos, limite `until` com revisão de fuso, retirada explícita da regra (conserva status/série) e âncora preservada ao adiar/retornar. | Sem novos tipos de recorrência, sem fuso por série e sem reescrita de ocorrências antigas. |
| Concluir/pular/encerrar | DONE/SKIP transferem a regra para no máximo uma próxima TODO no mesmo commit; END fecha sem gerar; fim natural remove a regra; reabrir não recupera regra. | Sem desfazer/token/histórico e sem botão de lixeira (TFA-006). |
| Subtarefas | Até 20 itens ordenados, títulos 1–200, adicionar/remover/mover por teclado, progresso derivado e checkbox por intenção em qualquer status. | Sem status/prazo/lembrete/filhos por item; sem vínculo automático com o status da tarefa. |
| Save após marcações | O formulário aberto continua salvando após checks externos, conservando o `done` lido no main por ID; mudanças estruturais/campos/ordem conflitam sem rebase geral. | Alterações concorrentes exigem conferir/descartar explicitamente como antes. |
| Cancelar recorrente | Enter/ponteiro/save abrem o diálogo SKIP/END sem gravar; abandonar/Escape não altera nada; saída de foco restaura a seleção sem diálogo nem comando. | Diálogo apenas para CANCELLED com regra; DONE não exige escolha. |
| Lembretes (guarda D8) | Mensagem acessível explica o bloqueio; edições independentes, regra sem fechamento e retirada isolada continuam permitidas, preservando dados/marcadores. | Prazo/status e fechamento/geração com lembretes só na TFA-008; nenhum scheduler/notificação é entregue. Estado superado: a TFA-008 integrou reminders e retirou a guarda. |
| Responsividade | Cartões preservam identidade/cores/rótulos; sem redesign ou novas colunas; D10 herdado da TFA-004 segue medido e identificado quando reprovado. | Nenhuma virtualização, truncamento de registros ou remoção de gate para “passar”. |

**Fora do escopo desta entrega (por decisão):** desfazer, lixeira funcional, backup/restauração, lembretes/notificações, captura/atalhos, IA, lifecycle/bandeja e distribuição. A UI não monta esses controles.

## TFA-006 — catálogo v3, lixeira e desfazer (2026-10-04)

### Catálogo final: 17 wrappers

| Grupo | Operações | Versão |
| --- | --- | --- |
| Diagnóstico | `verifyFoundation` | v1 |
| Estado/subscription | `getStateSnapshot`, `subscribeState`, `unsubscribeState` | v2 |
| Tarefas | `createTask`, `updateTask`, `changeTaskStatus`, `setSubtaskDone` | **v3** (contexto + `outcome`) |
| Origem | `openTaskSource` | v1 |
| Contexto/confirmação | `clearUndoOffer`, `prepareTrashConfirmation` | v1 |
| Lixeira | `moveTaskToTrash`, `restoreTrashItem`, `deleteTrashItem`, `emptyTrash`, `prepareTrashView` | v1 |
| Desfazer | `undoLastTaskAction` | v1 |

As quatro mutações de tarefas passam a exigir `contextSequence` estabelecido por `clearUndoOffer` e
respondem `outcome: 'APPLIED' | 'UNCHANGED'`; update/status APPLIED podem trazer `undoToken`. As
mutações v1/v2 são recusadas sem alias. Requests mantêm 64 KiB e respostas 8 KiB; estado/diagnóstico
e eventos mantêm 1 KiB e a página 256 KiB.

### Fluxos e limites

| Fluxo | Comportamento | Limites transitórios |
| --- | --- | --- |
| Excluir | Confirmação recuperável com base lida no main (30 dias/limite 100/descartes/portadora); ack informa `retained` e oferece Desfazer quando retida. | Sem exclusão em lote nem restauração de descartes colaterais. |
| Lixeira | Área com título, data pt-BR, Restaurar/Excluir definitivamente/Esvaziar; estados loading/stale/erro/vazio/manutenção distintos e Voltar. | Sem busca/ordenação própria da lixeira nem colunas novas. |
| Restaurar | Sem confirmação adicional, sem geração e sem desfazer; recusas diferenciadas por código seguro. | ID ativo, vencimento e conflito de série conservam tudo. |
| Definitiva/EMPTY | Confirmação irreversível opaca; EMPTY compara composição/identidades e recusa confirmação antiga. | Remoção lógica, sem promessa forense; sem undo dessas ações. |
| Desfazer | Oferta na listagem, sem roubo de foco, consumida uma vez; sucesso devolve foco a Editar/ação principal. | Sem pilha/redo; encerrar/reload perde a oferta; ações futuras limpam. |
| Acessibilidade | Confirmações com Escape/abandono sem efeito parcial, busy focável, anúncios status/alert e foco vizinho/último/Voltar. | Prova humana de leitor de tela/DPI segue pendente (roteiro próprio). |

**Fora do escopo desta entrega (por decisão):** histórico persistente, undo de criação/check/
restauração/definitiva/empty/purge, backup funcional, scheduler/notificações/bandeja, captura/IA,
redesign, novas janelas de produto e outras Changes.
