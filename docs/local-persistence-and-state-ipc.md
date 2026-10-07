# Persistência local e IPC de estado — TaskFlow App

**TFA-009:** o [catálogo de captura/atalhos](capture-shortcuts-ipc.md) acrescenta nove wrappers v1, facades manager35/Quick Add14 e controle desktop v2 por superfície. SQL2/codec4, comandos de tarefas, fila/coordenador e budgets anteriores permanecem. Preferências próprias ficam fora do backup/SQL. Trechos históricos das Changes anteriores descrevem seus recortes, não a disponibilidade corrente das duas janelas.

**TFA-003 · implementação e evidências · 2026-10-04**

Este documento descreve o que **existe** no aplicativo depois da TFA-003: armazenamento durável de tarefas e lixeira no perfil do usuário, coordenação de leitura/decisão/commit no main e um IPC mínimo de leitura e subscriptions. Não há UI de gerenciamento, comando remoto de criar/editar/status, importação, lembretes, undo funcional ou abertura externa de URLs: esses itens pertencem às TFA-004–012. O shell continua sendo a tela diagnóstica.

> **Atualização da TFA-004 (apply em 2026-10-04):** os quatro comandos `createTask`, `updateTask`, `changeTaskStatus` e `openTaskSource` passaram a existir, com contrato/bytes/erros em [desktop-task-management.md](desktop-task-management.md). O restante deste documento continua sendo a evidência da TFA-003 para leitura, persistência, coordenação e subscriptions.

Artefatos: [proposal](../openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/proposal.md), [design](../openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/design.md), [tasks](../openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/tasks.md) e [relatório de verificação](../openspec/changes/archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/verification.md).

## Seleção portável reutilizada da extensão

Origem consultada somente para leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Licença: MIT nos dois repositórios, mesmo titular (arquivo `LICENSE` de cada um). A cópia foi revisada linha a linha: sintaxe adaptada ao TypeScript estrito do app (`noPropertyAccessFromIndexSignature`, imports com `.js`) e cada arquivo indica sua origem no cabeçalho.

| Origem (extensão) | Destino (app) | O que foi mantido | O que ficou de fora |
| --- | --- | --- | --- |
| `src/domain/task.ts` | `src/domain/task.ts` | Tipos `Task`/`TaskReminder`, enums e guardas de status/prioridade | Tipos `Clock`/`IdGenerator` (sem uso nesta Change) |
| `src/domain/task-recurrence.ts` | `src/domain/task-recurrence.ts` | Tipo `Recurrence`, limites e `isRecurrence` | Cálculo de passos, próxima ocorrência e geração (TFA-005) |
| `src/domain/task-reminders.ts` | `src/domain/task-reminders.ts` | Invariantes da coleção, instante efetivo, `claimReminderOccurrence` | Presets, rascunhos, planejamento de alarmes, tolerâncias e entrega (TFA-008) |
| `src/domain/task-subtasks.ts` | `src/domain/task-subtasks.ts` | Tipo `Subtask` e `MAX_SUBTASKS` | Rascunhos, marcação, progresso e reset (TFA-005) |
| `src/domain/task-trash.ts` | `src/domain/task-trash.ts` | Tipo `TrashItem` | Retenção de 30 dias, limite de 100 e ordenação (TFA-006) |
| `src/infrastructure/storage/stored-task-collection.ts` e `stored-trash.ts` | `src/application/storage/stored-task-codec.ts` | Decoders v1–v4 e invariantes da coleção | Chaves/envelopes do armazenamento da extensão e mensagens de UI |
| `src/application/task-repository.ts` e `task-trash-repository.ts` | `src/application/storage/unit-of-work.ts` (reescrito) | Semântica de `saveMany`, `replaceAll`, claim, atualização/reversão condicionais, move/restore e `ID_EXISTS` | Portas assíncronas por callback, classe de erro com mensagem e `subscribe` — substituídos pela unidade de trabalho síncrona e pelas razões portáveis |
| `tests/infrastructure/stored-trash.test.ts`, casos de migração e de dados incompatíveis de `chrome-task-repository.test.ts`, `tests/support/task-fixtures.ts` | `tests/application/stored-task-codec.test.ts` | Casos portáveis de v1–v4 e de recusa | Fakes de `chrome.storage` e testes do adapter Chrome |

**Não copiados:** adapters Chrome, `TaskService`, `ReminderService`/scheduler, `task-draft`/`task-integrity` (validação de formulário e de backup), `task-undo`, backup, captura, atalhos, IA e qualquer dado real. Verificado por busca: nenhum arquivo de `src/domain`, `src/application` ou `src/contracts` referencia `chrome.`, `browser.`, WXT ou provedores de IA.

**Acréscimos desktop (não existem na origem):** codec por item com validação também na escrita (`encodeTaskPayload`), revisões (`revisions.ts`), razões de erro por discriminante (`task-storage-error.ts`), primitives sobre porta de linhas (`task-storage-unit.ts`) e `preserveProcessedMarkers` em `task-reminders.ts`.

**Invariantes do núcleo portável:** `src/contracts`, `src/domain` e `src/application` não importam Vue, Pinia, Electron, módulos do Node (inclusive `node:sqlite`), globais do Node, `main`/`preload`/`renderer`, APIs Chrome nem rede. O teste [layer-boundaries](../tests/architecture/layer-boundaries.test.ts) verifica isso com fixtures positivas e negativas do detector; `node:sqlite` só é importado por `src/main/storage/product-database.ts` e pela prova da fundação.

## Banco de produto

### Caminhos

| Dado | Caminho | Observação |
| --- | --- | --- |
| Banco de produto | `<userData>/data/taskflow.sqlite` | `userData` = `%LOCALAPPDATA%\TaskFlowApp\profiles\{dev,test,prod}\user-data` |
| Prova diagnóstica | `<userData>/foundation-proof/proof.sqlite` | Inalterada; não é lida nem migrada pelo produto |
| Sessão/cache | `…\profiles\{perfil}\session-data` | Separado dos dois bancos |

O resolvedor de perfil da TFA-002 é reutilizado sem novo override; identidade, instalador e ACL não mudaram. O perfil `prod` empacotado não aceita perfil nem caminho arbitrário.

### Três versões que não se equivalem

| Versão | Valor atual | Onde vive |
| --- | --- | --- |
| Schema SQL do produto | **2** (a TFA-005 acrescentou a migração 1→2) | `PRAGMA user_version` e `taskflow_metadata.schema_version`, que precisam concordar |
| Codec de payload | **v4** (lê v1–v4) | Coluna `payload_version` de cada linha |
| Formato de backup | v1–v4 (TFA-007) | Arquivo de backup; **não** é lido nesta Change |

### Schema SQL 1

- `taskflow_metadata` (uma linha): assinatura `taskflow.app/product-store`, versão do schema e **revisão global** inteira.
- `tasks`: `id` (PK), `payload_version`, `payload_json` (um item, sem envelope de coleção) e `content_revision`.
- `trash`: PK **própria**, os mesmos campos e `deleted_at`.

As duas tabelas não compartilham unicidade de ID: o mesmo ID pode existir em tarefas e na lixeira, e a restauração responde `ID_EXISTS` preservando ambos. Metadados de persistência ficam fora do conteúdo do domínio.

### Configuração da conexão

`node:sqlite` (`DatabaseSync`) embarcado no Electron, uma conexão por processo dono do perfil: `journal_mode=DELETE`, `synchronous=EXTRA`, `foreign_keys=ON`, espera de lock de 100 ms, extensões desabilitadas e SQL fixo e parametrizado. Os PRAGMAs efetivos são lidos de volta; qualquer divergência bloqueia a abertura (`STORAGE_UNAVAILABLE`), sem degradar. Não há WAL, addon nativo, rebuild nem fallback para JSON.

### Abertura: ausência versus dados existentes

A classificação acontece **antes** de qualquer DDL e de qualquer PRAGMA persistente.

| Situação do destino | Resultado | O que acontece com os arquivos |
| --- | --- | --- |
| Arquivo inexistente (e sem journal órfão) | Cria schema, metadata e revisão 0 numa única transação; valida e só então disponibiliza estado vazio | Banco novo criado |
| Arquivo existente de zero bytes, inclusive após criação interrompida | `INCOMPATIBLE_DATA` | Preservado; nada é completado ou removido |
| Arquivo que não é SQLite, SQLite de outro produto, sem schema, com outra assinatura, em modo WAL, ou journal órfão sem banco | `INCOMPATIBLE_DATA` | Preservado; nenhum auxiliar é criado |
| Schema SQL futuro, payload de versão futura, JSON inválido, ID da linha diferente do payload, enum/data/lembrete/recorrência/subtarefa inválidos, `deleted_at` inválido, revisão de conteúdo incoerente, tabela sem PK | `INCOMPATIBLE_DATA` | Preservado; nenhuma linha é descartada |
| Arquivo truncado ou `quick_check` diferente de `ok` | `CORRUPTED_DATA` | Preservado; sem reset |
| Diretório/permissão/I/O/lock/configuração indisponível | `STORAGE_UNAVAILABLE` | Preservado; a próxima unidade tenta reabrir |

Depois de identificado, o banco tem **todos** os payloads validados antes de aceitar a primeira unidade. Incompatibilidade e corrupção ficam bloqueadas até o app reiniciar; indisponibilidade é reavaliada na próxima unidade.

### Journal e recuperação

- Um journal quente deixado por uma transação interrompida é revertido **pelo motor SQLite** na abertura; o app valida o resultado antes de disponibilizar estado. O app não apaga, move nem interpreta journal.
- Um journal sem páginas gravadas (transação interrompida antes de o motor escrever no arquivo) não é quente: o motor o reaproveita na próxima transação de escrita. Isso foi observado no pacote e está registrado nas evidências.
- **Fora do escopo:** recuperação por backup, escolha de arquivo, UI de reparo e qualquer reset automático. Nenhum caminho de código reinicializa, regrava ou descarta um banco existente.

### Migrações

O produto implantado é schema SQL 1 e **não registra migração alguma**. Existe um executor para migrações explicitamente registradas: valida origem (estrutura, assinatura e payloads), aplica dados + schema + metadata numa transação, valida o destino e só então confirma, incrementando a revisão global. Falha reverte tudo. Versão desconhecida, caminho de migração ausente e schema futuro são recusados sem adivinhar. O executor é exercitado somente por uma fixture de teste (schema 2 fictício em definição própria do teste), que não vira versão de produto. Não há migração da prova diagnóstica nem da extensão.

## Unidade de trabalho e revisões

### Como um produtor interno usa o armazenamento

Há **um** coordenador (`StorageCoordinator`) com uma fila e uma conexão. Todo produtor futuro — comandos de UI, restauração/undo, importação, recorrência e lembretes — entra por ele; não existe conexão ou adapter escritor paralelo.

```ts
// Escrita: BEGIN IMMEDIATE → ler, decidir, validar e confirmar sobre o estado atual.
const result = await coordinator.run((unit) => {
  const stored = unit.getTask(id)
  if (stored === undefined) return 'missing'
  return unit.updateTaskConditionally(id, stored.contentRevision, (task) => ({ ...task, title }))
})
if (result.ok && result.committed) {
  // Efeitos externos (notificação, rede, diálogo) só aqui: depois do commit, fora da transação.
}

// Leitura coordenada: nunca grava, expurga ou altera revisões.
const tasks = await coordinator.read((reader) => reader.listTasks())
```

Regras verificadas por teste:

- O callback é **síncrono** e sem efeitos externos; devolver uma `Promise` é recusado (`INVALID_UNIT`) e revertido.
- Uma unidade não reenfileira nem aninha outra: `run`/`read` chamados de dentro de uma unidade são recusados.
- As portas da unidade expiram quando ela termina; guardá-las para uso posterior falha.
- Unidade sem alteração observável (no-op, recusa, conflito) não confirma, não incrementa revisão e não emite evento.
- O resultado é uma união de dados: `{ ok: true, value, committed, revision }` ou `{ ok: false, reason }`.

### Primitives internas

`listTasks`/`getTask`/`listTrash`/`getTrashItem`/`iterate*`; `saveTask`, `saveTasks`, `replaceAllTasks`, `deleteTask`; `moveToTrash`, `restoreFromTrash`, `deleteFromTrash`, `emptyTrash`, `purgeTrash`; `updateTaskConditionally`, `revertConditionally`; `claimReminderOccurrence`. São suporte de armazenamento: **nenhuma delas atravessa o IPC** e nenhuma entrega a funcionalidade correspondente.

| Primitive | Limite de uso |
| --- | --- |
| `saveTask`/`saveTasks` | Gravação direta sob coordenação, **sem** comparação de revisão. Não é protocolo de edição: casos de uso futuros devem decidir dentro da unidade ou usar a edição condicional. `saveTasks` é um único commit; nunca é dividido para cumprir orçamento |
| `replaceAllTasks` | Exige a revisão **global** esperada; base diferente devolve `CONFLICT`. Substitui só a coleção de tarefas; a lixeira é preservada |
| `moveToTrash` | Move o payload como está, substituindo item anterior de mesmo ID na lixeira. **Não** aplica retenção nem limite: a política da lixeira é da TFA-006 |
| `purgeTrash(predicate)` | Expurgo explícito; leituras e snapshots nunca expurgam |
| `restoreFromTrash` | `ID_EXISTS` se o ID já está ativo; `prepare` interno precisa devolver tarefa válida com o mesmo ID |
| `revertConditionally` | Verifica revisões de conteúdo da tarefa e da tarefa gerada; não é `UndoPlan` nem token de undo |

### Revisões

- **Revisão global**: inteiro persistido em `taskflow_metadata`, incrementado exatamente uma vez por commit com alteração observável. Não deriva de timestamp.
- **Revisão de conteúdo** (por item): recebe a revisão global do commit que alterou o conteúdo do usuário. Criar de novo um ID removido, restaurar e substituir reintroduzindo um ID sempre alocam revisão nova — a revisão guardada na lixeira não autoriza edição posterior (sem ABA).
- **Precisão**: inteiros de 64 bits, `bigint` em memória e string decimal canônica no transporte. No limite persistível a escrita falha (`REVISION_EXHAUSTED`); não há wrap nem reinício.

### `processedFor`, claim e undo futuro

- O claim revalida tarefa ativa, lembrete, prazo e ocorrência no estado atual e grava `processedFor` **antes** de qualquer efeito. Dois claims da mesma ocorrência: só um confirma.
- O claim altera a revisão **global** e conserva `updatedAt` e a revisão de **conteúdo**. Uma edição concorrente não é invalidada só porque um lembrete foi processado.
- Edição e reversão condicionais conservam o marcador atual das ocorrências que não mudaram (mesmo lembrete, mesmo instante efetivo), mesmo quando a decisão partiu de uma leitura anterior ao claim. Ocorrência alterada não herda marcador antigo.
- Não existe scheduler, notifier nem entrega: no máximo uma tentativa por ocorrência, **sem** promessa de exactly-once. A semântica de undo (comparar conteúdo/pré-condições, conservar o processamento) fica para a TFA-006.
  **Atualizado na TFA-008:** o scheduler/notifier foram compostos no main com agenda única, claim na unidade e uma tentativa por pendência; a semântica de undo conserva markers e liquida `<= now`. Evidência instalada pendente.

## Falhas, recuperação e encerramento

### Matriz de falhas

| Falha | Tratamento | Estado após | Nível de evidência |
| --- | --- | --- | --- |
| Erro lançado na unidade, dado inválido | Rollback confirmado; razão devolvida; fila segue | Anterior inteiro | Teste automatizado, banco real |
| Lock de outra conexão em `BEGIN IMMEDIATE` | `LOCKED` após a espera limitada; sem retry | Anterior inteiro; fila disponível | **Lock real** com conexão de teste concorrente |
| Leitor externo bloqueando o `COMMIT` | Rollback confirmado; `LOCKED` | Anterior inteiro | **Lock real** |
| Disco cheio (`SQLITE_FULL`) | O motor reverte; razão `UNAVAILABLE`; conexão segue válida | Anterior inteiro | **Erro real do motor** por limite de páginas (`max_page_count`) — não é disco físico cheio |
| Arquivo somente leitura | `UNAVAILABLE`; conexão invalidada; reopen validado quando a causa passa | Anterior inteiro | **Permissão real** (atributo somente leitura em arquivo temporário) |
| Destino que não é arquivo / abertura impossível | `UNAVAILABLE`; nunca vira coleção vazia | Sem banco aberto | **Filesystem real** |
| Falha entre remover da origem e inserir no destino (move/restore) | Rollback das duas coleções | Anterior inteiro | **Erro real do motor** via gatilho temporário da conexão de teste |
| Falha no `COMMIT` com resultado incerto | Conexão invalidada, inscritos avisados, reopen com validação completa antes da próxima unidade; nenhum sucesso anunciado | O que o motor confirmou, validado | **Fault injection identificado** (erro com a forma do `node:sqlite` no ponto `unit:commit`) |
| Falha no `ROLLBACK` | Idem (resultado incerto) | Validado no reopen | **Fault injection identificado** (`unit:rollback`) |
| Falha de I/O durante migração | Origem preservada; `UNAVAILABLE` | Schema e dados anteriores | **Fault injection identificado** (`migrate:before-commit`) |
| Dado que deixa de ser válido com o app aberto | Estado bloqueado (`INCOMPATIBLE_DATA`/`CORRUPTED_DATA`); nada é descartado | Arquivo preservado | Teste automatizado com alteração externa |
| Falha de listener/efeito depois do commit | Ignorada para o resultado; o commit permanece | Novo estado | Teste automatizado |
| Resposta perdida depois do commit | O cliente ressincroniza por snapshot; nenhuma escrita é repetida | Novo estado | Teste automatizado e kill no pacote |

Diagnósticos internos carregam somente fase e razão. Nenhum resultado, evento ou diagnóstico leva caminho, SQL, stack, `cause`, ID de tarefa ou payload.

### Interrupção de processo (não é falha de energia)

Um processo **exclusivamente de teste** abre um banco fictício, para numa barreira identificada e é encerrado à força depois de o PID ser validado. Em todas as barreiras o reopen encontra o estado anterior ou o novo, sempre inteiro e com revisão coerente.

| Barreira | Resultado no reopen | Onde foi exercitada |
| --- | --- | --- |
| Antes do `BEGIN`, durante a transação, antes do `COMMIT` | Estado anterior | Node 24.21.0 (Vitest) e Electron empacotado |
| Depois do `COMMIT`, antes da resposta/evento | Novo estado | Node 24.21.0 e Electron empacotado |
| Claim confirmado antes do efeito | `processedFor` conservado; segundo claim recusado | Node 24.21.0 e Electron empacotado |
| Migração: durante e antes do commit / depois do commit | Origem inteira / destino inteiro | Node 24.21.0 (fixture isolada) |

**Limite da evidência:** matar um processo prova atomicidade diante de interrupção de processo. O sistema operacional continua vivo e seus buffers chegam ao disco; isso **não** é prova de perda de energia nem do comportamento do dispositivo. `synchronous=EXTRA` pede os flushes; a durabilidade final depende de o filesystem e o dispositivo os cumprirem. Nenhum teste de corte de energia foi executado.

### Ownership e encerramento

- O lock de instância única é obtido antes de qualquer banco. A segunda instância do mesmo perfil encerra sem abrir a prova nem o produto e sem criar janela.
- Na saída: os handlers de IPC são removidos (admissão fechada), as sessões são invalidadas, as entradas de sessão ainda não iniciadas são canceladas com `SESSION_CLOSED`, as unidades internas já admitidas são drenadas e só então a conexão fecha. Depois disso nenhuma unidade é aceita.
- As unidades são síncronas: uma unidade em commit termina antes de o código de encerramento rodar. Não há saída forçada durante commit, bandeja, serviço nem processo residual.

## Catálogo fechado da bridge

`window.taskflowDesktop` é um objeto congelado com exatamente quatro operações:

| Operação | Request | Sucesso | Observação |
| --- | --- | --- | --- |
| `verifyFoundation` | `{ version: 1 }` | Resultado da prova (inalterado) | Banco e gate `BUSY` próprios, independentes da fila do produto |
| `getStateSnapshot` | `{ version: 1 }` | `{ version: 1, status: 'ok', snapshot }` | Snapshot completo de uma única revisão |
| `subscribeState` | `{ version: 1 }` e callback local opcional | `{ version: 1, status: 'ok', subscriptionId, snapshot }` | Idempotente por documento |
| `unsubscribeState` | `{ version: 1, subscriptionId }` | `{ version: 1, status: 'ok' }` | Idempotente no próprio documento |

Erro é sempre `{ version: 1, status: 'error', code }`, com `code` em: `INVALID_REQUEST`, `UNAUTHORIZED`, `BUSY`, `SESSION_CLOSED`, `SNAPSHOT_STALE`, `RESOURCE_LIMIT`, `INCOMPATIBLE_DATA`, `CORRUPTED_DATA`, `STORAGE_UNAVAILABLE`. `CONFLICT` e `ID_EXISTS` são resultados internos e não têm canal remoto.

Não existem na bridge: criar/editar/status, lixeira ou undo funcionais, SQL, caminhos, repositories, `Task` livre vinda do renderer, `UndoPlan`, callbacks remotos, canal genérico, `ipcRenderer`, abertura externa, clipboard, IA ou qualquer hook de escrita/teste.

> **Atualizado na TFA-004:** o catálogo passou a oito operações com `createTask`, `updateTask`, `changeTaskStatus` e `openTaskSource`; `CONFLICT`, `NOT_FOUND`, `VALIDATION_FAILED` e os códigos de origem agora são resultados remotos desses comandos. Lixeira, undo, backup, lembretes, captura, atalhos e IA continuam fora da bridge. Ver [desktop-task-management.md](desktop-task-management.md).

Exemplos conferidos contra os schemas:

```ts
await window.taskflowDesktop.getStateSnapshot({ version: 1 })
// → { version: 1, status: 'ok', snapshot: { revision: '42', tasks: [{ task, contentRevision: '40' }], trash: [{ task, deletedAt, contentRevision: '7' }] } }

await window.taskflowDesktop.getStateSnapshot({ version: 1, sql: 'SELECT 1' })
// → { version: 1, status: 'error', code: 'INVALID_REQUEST' }   (recusado sem chegar ao main)

await window.taskflowDesktop.unsubscribeState({ version: 1, subscriptionId: idDeOutraSessao })
// → { version: 1, status: 'error', code: 'UNAUTHORIZED' }
```

### Autorização por documento

O main mantém um registro de superfícies e uma **geração** por documento, criada pelo próprio main (um ID vindo do renderer não confere autoridade). A mesma verificação roda em três momentos — admissão, execução enfileirada e envio de resposta/evento:

1. `webContents` registrado (o próprio objeto, não só o `id`) e vivo;
2. o remetente é o main frame, vivo e não destacado;
3. `WebFrameMain.origin` igual à origem esperada (`taskflow://app` no pacote; a origem loopback declarada só em desenvolvimento);
4. URL real na rota do shell (`/` ou `/index.html`), sem query, fragmento ou credenciais — `about:blank`, `blob:` e URLs parecidas não passam mesmo com origem herdada;
5. geração do documento ainda corrente.

Navegação e reload (inclusive da mesma URL) trocam a geração no início e na conclusão; crash e fechamento também. Tudo o que pertencia ao documento anterior — inscrição, cursor, entradas na fila e respostas pendentes — deixa de valer. Uma unidade já confirmada permanece no banco, mas o resultado não é entregue ao novo documento. O diagnóstico usa os mesmos guards. Protocolo local, CSP, sandbox, `contextIsolation`, permissões negadas e bloqueios de navegação/janelas/webviews não foram alterados.

## Contrato de estado

### Snapshot paginado

O wrapper do preload esconde a paginação: entre preload e main, `state:snapshot:v1` devolve páginas `{ revision, fragments, cursor }` e, na última, `{ revision, fragments, complete: { tasks, trash } }`.

- Cada página é lida pelo coordenador **na revisão base** do cursor. Se a revisão global mudou, a continuação devolve `SNAPSHOT_STALE` e nada parcial é completado. Não há transação de leitura aberta esperando o renderer.
- Ordem estável: tarefas e depois lixeira, por ID. Não há filtro nem consulta livre.
- Um fragmento é um trecho do JSON de um registro. Registro maior que a página é dividido em fronteira de caractere (nunca no meio de um par surrogate) e continua na página seguinte.
- O cliente só publica depois de reunir tudo: todas as páginas com a mesma revisão, cada registro revalidado pelo codec, IDs sem repetição por coleção e contagem final conferida. Resposta malformada vira `STORAGE_UNAVAILABLE`, sem expor detalhes.
- Cursor e `subscriptionId` são tokens opacos gerados pelo main, vinculados à sessão. Cursor desconhecido, de outra sessão, já usado ou expirado devolve `SNAPSHOT_STALE` **antes** de qualquer leitura.
- Ler não expurga a lixeira, não regrava payload histórico, não altera revisão e não emite evento.

### Inscrição e eventos

- O preload instala seus dois listeners fixos (`state:changed:v1`, `state:unavailable:v1`) na carga, antes de qualquer pedido — um por canal por documento. Callbacks do renderer ficam no preload e nunca são argumento de `invoke`.
- No main, inscrição, revisão base e primeira página saem do **mesmo turno coordenado**: nenhum commit cabe entre eles.
- `state:changed:v1` carrega só `{ version, subscriptionId, revision }`: é uma invalidação, não um patch. Sai depois do commit confirmado, coalescida pela maior revisão por inscrição, e somente para o documento corrente da sessão.
- `state:unavailable:v1` carrega um código seguro quando o estado de produto perde validade. O cliente marca o último snapshot como `stale`; nunca o substitui por lista vazia.

### Ressincronização no cliente

- Invalidações que chegam durante o handshake ou a montagem são bufferizadas (só a maior revisão interessa).
- Depois de um snapshot completo na revisão `r`, eventos `<= r` são ignorados; revisão maior, snapshot stale, erro, resposta perdida ou reconexão levam a um novo snapshot. O estado publicado nunca regride.
- No máximo **três** reconstruções imediatas por ciclo. Sob escrita contínua o ciclo devolve `BUSY`, conserva o último snapshot completo marcado `stale` e um novo ciclo começa na próxima invalidação, reconciliação ou solicitação.
- Um evento pode se perder sem aparecer salto: enquanto inscrito, o cliente reconcilia por snapshot **a cada 30 s e ao retomar o foco**.
- As montagens de um documento são serializadas. Nenhuma escrita é repetida automaticamente.
- `unsubscribeState`, navegação, reload, crash e fechamento removem inscrição, cursor, buffers e reconciliação.

### Orçamentos

| Recurso | Limite |
| --- | --- |
| Request de estado e de diagnóstico | 1 KiB UTF-8 serializado, shape exato |
| Evento | 1 KiB |
| Página de snapshot | 256 KiB UTF-8 serializado, incluindo envelope e escaping |
| Total da coleção | **Sem limite**; registros maiores que a página são fragmentados, nunca cortados |
| Por documento | Uma inscrição e um cursor ativo; cursor expira em 30 s sem uso, renovado a cada página |
| Documentos registrados | 8 (limite do registro, exercitado pelo harness; não é feature de múltiplas janelas) |
| Fila do coordenador | 64 entradas no total, 8 por sessão; espera máxima de 2 s antes de iniciar |
| Lock do SQLite | 100 ms |

Excesso de request, de fila ou de espera é recusado **antes** de qualquer efeito (`INVALID_REQUEST`/`BUSY`). Pressão de recursos na leitura devolve `RESOURCE_LIMIT` conservando banco e último estado. Nada é truncado e nenhum registro é omitido.

**Limitações conhecidas:**

- `DatabaseSync` bloqueia o event loop do main. Os orçamentos de fila e espera valem antes de a unidade começar; **não existe timeout capaz de interromper um commit em andamento**.
- A espera de lock é configurada em 100 ms (`busy_timeout`); o tempo observado até a recusa foi de ~170 ms num teste local, porque o motor dorme em passos. A espera é finita e não há retry.
- Uma coleção maior que a memória da máquina é limitação explícita (`RESOURCE_LIMIT`), não autorização para perder dados.
- O cliente guarda o snapshot completo em memória e a bridge o copia entre os mundos do preload e do renderer.

## Evidência no Electron empacotado

Executado em 2026-10-04 por `npm run smoke:packaged`, sobre `release/win-unpacked` copiado para pasta temporária, com `LOCALAPPDATA` apontando para a própria pasta temporária do smoke (perfil inteiramente fictício). O Setup **não** foi executado; nenhum Node/npm externo participa do aplicativo em teste. Esta evidência é do banco de **produto** e da bridge de estado; a prova `foundation-proof` da TFA-002 não a substitui e continua valendo só para o diagnóstico.

### Runtime e configuração efetiva do produto

| Item | Valor medido no pacote |
| --- | --- |
| Electron / Node embarcado / Chromium | 44.5.1 / 24.21.0 / 152.0.7977.130 |
| `sqlite_version()` | **3.53.4** |
| `journal_mode` / `synchronous` / `foreign_keys` / `busy_timeout` | `delete` / `3` (EXTRA) / `1` / `100` |
| Schema SQL | 1 |
| Origem real do documento (`WebFrameMain.origin`) | `taskflow://app` (URL `taskflow://app/`) |

Sobre correções relevantes do motor: a correção de WAL-reset documentada pelo SQLite (3.51.3, com backports 3.44.6/3.50.7) já está contida na 3.53.4, e de todo modo **o produto não usa WAL**. Tabelas `STRICT` exigem 3.37+. Divergência de configuração falha fechada (teste de quatro divergências). Não há fallback, WAL, addon nem rebuild.

### Cenário `bridge` — 27 verificações, todas aprovadas

Catálogo fechado e congelado, sem `require`/`process`/`Buffer`/`ipcRenderer` no renderer; origem real conferida; snapshot inicial; duas superfícies inscritas com IDs distintos; subscribe idempotente; commits internos fictícios (todos os campos, tarefa mínima, Unicode e um registro acima de 256 KiB); colisão `ID_EXISTS` sem alteração; no-op sem revisão; **convergência das duas superfícies** por eventos e snapshots; round-trip integral pela bridge real; lixeira preservada; leituras sem mutação; cinco requests inválidos recusados; cancelamento de inscrição alheia recusado; cancelamento próprio idempotente; `webContents` não registrado recusado **sem nenhuma leitura**; URL errada (`taskflow://app/index.html?probe=1`) recusada; **reload da mesma URL** invalida a sessão e nada vaza ao novo documento, que se reinscreve; limite de 8 documentos e liberação; diagnóstico e produto não alteram o banco um do outro.

### Demais cenários do pacote

| Cenário | Resultado |
| --- | --- |
| Segunda instância do mesmo perfil | Encerra com código 0, sem executar e sem alterar o banco de produto |
| Saída normal e reopen | Revisão e digest do conteúdo idênticos; nenhum journal residual |
| Kill em `unit:in-transaction` e `unit:before-commit` | Estado anterior inteiro |
| Kill em `unit:after-commit` e `unit:before-publish` | Novo estado inteiro |
| Kill após claim confirmado | Novo estado inteiro |
| Saída com 20 unidades internas e 4 leituras de sessão admitidas | 20 confirmadas, 4 canceladas, admissão recusada depois; drain ≈ 53 ms |
| Fechamento pela janela (cenário S8, com o banco de produto aberto) | Processo encerra com código 0, sem residual |

### Gate de limites

Hardware de referência: Intel Core i5-13420H (12 núcleos lógicos), 15,7 GiB, Windows 11 x64 (10.0.26200), no próprio Electron empacotado.

| Medida | 1.000 tarefas + 100 na lixeira | 10.000 tarefas + 100 na lixeira | Alvo |
| --- | --- | --- | --- |
| Payload serializado | 2,6 MiB | **23,9 MiB** | ≥ 20 MiB no conjunto maior |
| Arquivo do banco | 4,9 MiB | 45,1 MiB | — |
| Mutação representativa (200 commits): p95 / máximo | 5,17 ms / 6,97 ms | **3,24 ms / 8,01 ms** | p95 ≤ 100 ms |
| Página de snapshot pela bridge: quantidade, p95 / máximo | 12, 4,88 ms / 4,88 ms | 109, **4,11 ms / 7,29 ms** | p95 ≤ 100 ms |
| Snapshot completo ponta a ponta | 114 ms | 865 ms | — |
| Preflight completo (integridade, estrutura e todos os payloads) | 28 ms | **235 ms** | ≤ 5 s |
| `saveMany` da coleção inteira num único commit | 65 ms | **429 ms** | Medido como pior caso; não é dividido |
| Drain de 32 unidades internas | — | **87 ms** | Alvo 5 s |
| Maior intervalo do heartbeat do main (10 ms) | — | **593 ms** | Registrado |

Todos os gates passaram; **não** foi necessário worker, WAL, outra configuração nem relaxamento de orçamento. O conjunto de 1.000 tarefas tem 2,6 MiB com campos de tamanho realista; o requisito de pelo menos 20 MiB foi aplicado ao conjunto de 10.000.

**Leitura honesta do heartbeat:** o maior bloqueio do event loop (593 ms) acontece durante a substituição da coleção inteira de 10.000 tarefas num único commit — o pior caso que o design manda medir sem dividir. Páginas e mutações representativas ficam abaixo de 10 ms. Uma futura importação/substituição desse porte (TFA-007) bloqueará o main por algumas centenas de milissegundos neste hardware; é o comportamento aprovado, registrado aqui para a revisão daquela Change.

## Comandos reproduzíveis

Requer Node.js 24.21.0 e npm 11.21.0 (fixados em `package.json`).

```text
npm run validate          # lint, cinco typechecks, testes e build
npm run package:win       # pacote NSIS x64 sem publicar (não executa o Setup)
npm run verify:package    # inventário do ASAR e manifests
npm run smoke:packaged    # fundação + produto/bridge no pacote, com benchmark
node scripts/smoke-packaged.mjs --skip-bench   # o mesmo, sem o benchmark
openspec validate --all --strict --no-interactive
```

O smoke grava `release/product-harness-evidence.json` (não versionado) com o resultado bruto dos cenários. O harness de produto vive em `src/main/harness/` e só executa no perfil `test` com `--product-harness=<cenário>`; no perfil `prod` o argumento é ignorado. Ele usa unidades internas do coordenador para confirmar dados fictícios e a bridge pública para ler: **não** acrescenta canal, writer ou hook ao preload.

| Suíte | Cobre |
| --- | --- |
| `tests/application/revisions.test.ts`, `stored-task-codec.test.ts` | Revisões, razões de erro, codecs v1–v4 e validação de escrita |
| `tests/main/product-database.test.ts` | Caminhos, criação, PRAGMAs, preflight e migração (fixture) |
| `tests/main/storage-coordinator.test.ts` | Unidade de trabalho, primitives, lixeira, CAS/ABA, claim, eventos, falhas, lock real, limites e drain |
| `tests/main/storage-crash.test.ts` | Kill de processo de teste em barreiras (unidade, claim e migração) |
| `tests/main/document-sessions.test.ts`, `ipc-state.test.ts`, `ipc-foundation.test.ts` | Autorização por documento, zero leitura antes do guard, paginação, subscriptions e diagnóstico |
| `tests/application/snapshot-paging.test.ts`, `state-client.test.ts`, `tests/contracts/state-contract.test.ts` | Fragmentação/Unicode, montagem validada, ressincronização e schemas |
| `tests/preload/bridge-catalog.test.ts`, `tests/architecture/layer-boundaries.test.ts` | Catálogo fechado e fronteiras de camadas |

## Atualização da TFA-005 — schema SQL 2 e revisões de edição

O banco de produto passou para **schema SQL 2** com uma migração transacional concreta
**1→2**. Codec de payload (**v4**, lê v1–v4) e formato de backup permanecem intactos: os três
números são independentes. Nenhuma ferramenta externa, exportação ou reset participa da migração.

### Schema SQL 2

- `tasks`: acrescenta `edit_revision INTEGER NOT NULL CHECK (edit_revision > 0 AND edit_revision <= content_revision)`.
- `trash`: o mesmo campo, antes de `deleted_at`.
- PKs independentes, `STRICT` e `WITHOUT ROWID` preservados; nenhum índice ou tabela nova.
- `content_revision` completa cobre todo conteúdo de usuário (inclui `done`); `edit_revision`
  monotônica cobre campos/status/regra/IDs-títulos-ordem e é conservada pela marcação tipada de
  subtarefa (`markSubtaskDone`). Claim interno conserva conteúdo, edição e `updatedAt`. Criar,
  gerar, restaurar e recriar identidade recebem `edit = content` na revisão nova.
- Invariante por linha: `1 <= edit <= content <= global`. A leitura de SQL 2 **nunca** fabrica
  `edit_revision`; metadado ausente/inválido bloqueia a abertura.
- As revisões são metadados de armazenamento: não estão no payload (`Task`) nem no backup.

### Migração 1→2

1. Abre a origem com o **leitor 1** (sem a coluna nova), confere integridade, estrutura,
   assinatura, metadata e todos os payloads.
2. Numa única transação, reconstrói `tasks`/`trash` com a coluna nova e copia **byte a byte**
   `id`, `payload_version`, `payload_json`, `content_revision` e `deleted_at`; preenche
   `edit_revision = content_revision`. Nenhum JSON é reescrito.
3. Atualiza `schema_version`/`user_version` e avança `global_revision` **uma vez** pela migração.
4. Valida o destino com o **leitor 2** antes do commit; qualquer falha reverte tudo e conserva a
   origem SQL 1. Perfil novo nasce diretamente em SQL 2, global 0 e sem registros artificiais;
   reopen/boot repetido não repete a migração nem altera revisões.

**Downgrade:** um binário anterior (leitor 1) encontra `user_version = 2` e recusa a abertura com
`INCOMPATIBLE_DATA`, sem excluir, reescrever ou converter dados. Rollback de binário após o commit
não é suportado automaticamente; restaurar um banco de versão anterior exigiria procedimento
próprio com revisão.

**O que não migra:** a prova diagnóstica (`foundation-proof/proof.sqlite`), a sessão/cache, a
extensão de origem e arquivos de backup **não** são lidos, migrados ou tocados pela migração do
produto.

### Evidências

- `tests/application/task-storage-revisions.test.ts` — tabela D4: criação/edição/marcação/claim,
  lixeira/mover/restaurar, reversão por conteúdo, precisão bigint e conservação de revisões.
- `tests/main/product-database.test.ts` — schema 2, migração real 1→2 byte a byte, `edit=content`,
  global+1, bootstrap/reopen idempotentes, leitor antigo recusando e metadado inválido bloqueando.
- `tests/main/storage-crash.test.ts` — kill do processo de teste em `migrate:in-transaction`,
  `migrate:before-commit` e `migrate:after-commit`, com origem SQL 1 ou destino SQL 2 inteiros.
- `tests/main/storage-coordinator.test.ts` — CAS por revisão de edição, conflito com as duas
  revisões, claim conservando conteúdo/edição e falhas de armazenamento.

## Limites do que foi provado e pendências

- **Simulações identificadas:** falha de `COMMIT`, de `ROLLBACK` e de I/O em migração são fault injection com erro na forma do `node:sqlite`. Disco cheio é erro real do motor provocado por limite de páginas, não por volume físico cheio.
- **Não executado:** corte de energia, falha de dispositivo, volume de rede/redirecionado, antivírus ou política corporativa interferindo no arquivo, instalação pelo Setup com o banco de produto, upgrade instalado com dados de produto, e execução em conta padrão dedicada (a prova instalada da TFA-002 cobre a fundação, não o banco de produto).
- **CI:** o workflow existente executa `validate`, `package:win`, `verify:package` e `smoke:packaged`; o smoke ampliado ainda não foi executado no runner (nada foi enviado ao remoto nesta Change).
- **Interface:** nenhuma UI consome o estado. A convergência entre superfícies foi verificada pelo harness com a bridge real, não por uma tela de tarefas.
- **Fechamento pela janela depois do harness:** no cenário `bridge`, que cria e destrói superfícies de teste, o pedido de fechamento do sistema não alcançou a janela principal; a saída normal desse cenário é pedida ao próprio harness. O fechamento pela janela é verificado no cenário S8, com o banco de produto aberto. Não há indício de problema no produto, mas o comportamento do harness fica registrado.

## Atualização da TFA-006 — lixeira, identidade de entrada e recibos (2026-10-04)

### Unidades condicionais de lixeira

- `moveToTrashConditionally(taskId, expectedContentRevision, now)` lê o alvo, filtra vencidos,
  substitui o mesmo ID, insere a entrada com `contentRevision = editRevision = g` e corta em 100 no
  mesmo commit; payload/versão/timestamps da Task seguem íntegros. `retained:false` indica que a
  própria exclusão caiu fora do limite (relógio recuado) sem falsificar `deletedAt`.
- `restoreTrashItemConditionally(entry, now)` confere ausência → identidade → idade → ID ativo →
  portadora única no plano final (ignorando a entrada que sai da lixeira), conserva timestamps,
  dá revisões novas e liquida lembretes vencidos `<= now` sem gerar próxima.
- `deleteTrashItemConditionally` e `emptyTrashConditionally` comparam a identidade/composição
  observada; definitiva não reexige idade; esvaziar vazio é no-op sem revisão.
- `purgeExpiredTrash(now)` é a manutenção explícita por idade; leituras continuam puras.
- `revertConditionally` passou a receber `now`, conservar marcadores atuais, liquidar vencidos e
  validar a portadora no plano final (alvo substituído/gerada removida não contam).

### Recibos e contexto no main

- `UndoRegistry` (portável) mantém por documento: sequência de contexto, uma oferta publicada, uma
  confirmação corrente e uma reserva de candidato; tokens opacos de uso único; charge determinístico
  (`2 × bytes do before-image + 4096` para REVERT; 256 bytes para DELETE) sob orçamento global de
  64 MiB; época monotônica para a porta de invalidação pós-backup.
- As mutações v3 reservam o recibo antes da primeira escrita e publicam depois do commit, somente
  com sessão/contexto correntes; resultado incerto/rollback libera a reserva sem oferta.
- O IPC da lixeira (`trash:prepare-confirm:v1`, `trash:move:v1`, `trash:restore:v1`,
  `trash:delete:v1`, `trash:empty:v1`, `trash:prepare-view:v1`, `task:undo:v1` e
  `trash:clear-undo:v1`) aplica guards de remetente/documento/contexto na admissão, execução e
  saída, consome cada token uma vez e devolve códigos fechados (`STALE_CONTEXT`,
  `CONFIRMATION_INVALID`, `CONFIRMATION_CHANGED`, `NOT_IN_TRASH`, `ENTRY_CHANGED`,
  `ENTRY_EXPIRED`, `ID_EXISTS`, `UNDO_NOT_AVAILABLE`, `CHANGED`, `REMOVED`, `GENERATED_CHANGED`,
  `SERIES_CONFLICT`).

### Evidências

- `tests/domain/task-trash.test.ts` e `tests/domain/task-reminders.test.ts` — política/limite/ordem
  e liquidação pura.
- `tests/application/trash-commands.test.ts` — move/restore/definitiva/EMPTY/manutenção/reversão/
  undo, concorrência e falha entre efeitos.
- `tests/application/undo-registry.test.ts` — contexto, tokens, orçamento, época e oito sessões.
- `tests/main/ipc-trash.test.ts` — oito wrappers, recusas exatas, consumo único, sessão e orçamento.
- `tests/preload/bridge-catalog.test.ts` e `tests/contracts/*` — catálogo 17, versões e budgets.
- Harness empacotado `trash` (30 verificações) e crashes `move`/`restore`/`revert` no
  `smoke:packaged`.
