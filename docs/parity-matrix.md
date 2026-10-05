# Matriz de paridade — extensão TaskFlow para desktop

**TFA-001 · inventário documental · 2026-10-03**

Esta matriz descreve comportamento observado na extensão e o destino planejado no TaskFlow App. Nenhum item declara funcionalidade desktop disponível ou paridade já executada. Os testes listados existem na origem e são candidatos a **cópia seletiva e revisão futura**; não foram copiados nem executados nesta Change.

## Base da inspeção e legenda

- Origem estritamente somente leitura: `C:\QSI\Workspaces\taskflow-extension`.
- HEAD consultado: `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, igual ao hash analisado na proposta. Nenhuma diferença de HEAD foi observada durante este apply.
- `P` = preservar regra/semântica; `A` = adaptar à plataforma desktop; `R` = revisar uma diferença ou prova específica. Um item pode ter mais de uma marca.
- Referências são às specs, ao código e aos testes da origem; a execução desktop pertence à TFA indicada.
- A matriz de arquitetura e responsabilidades está em [architecture.md](architecture.md); o plano de evidências futuras está em [test-strategy.md](test-strategy.md).

## D5 — Inventário de paridade P01–P14

| ID / spec primária observada | Regra e evidência da origem | Destino no desktop e Change responsável | Código/testes de referência na origem |
| --- | --- | --- | --- |
| **P01 — Gerenciamento** · [task-management spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-management/spec.md) | UUID; título obrigatório após trim, até 200; descrição até 4.000; pessoas até 120; até 10 tags de 30, distintas sem diferença de caixa; URL HTTP/HTTPS. Status TODO, IN_PROGRESS, DONE e CANCELLED; prioridade; `completedAt` apenas em DONE. Pesquisa em título/descrição/pessoas/tags/subtarefas, filtros AND, ordenação com desempate, tarefa atrasada ativa e próxima até 24h; UTC persistido e local na UI. | **P/A · TFA-003/004.** Preservar campos, validação, pesquisa/filtros/ordenação, prazos e feedback. Conflito entre edições completas será diferença explícita a revisar, com preservação do draft. | [task-draft.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-draft.test.ts), [task-queries.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-queries.test.ts), [TaskManager.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts). |
| **P02 — Recorrência** · [task-recurrence spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-recurrence/spec.md) | Recorrência diária/semanal/mensal, intervalos e limite inclusivo; âncora e hora civil local/DST; fim de mês retorna ao dia original quando possível; saltar passado sem backlog. Fechar/pular cria ocorrência TODO com IDs novos; cancelar oferece pular/encerrar; reabrir não cria ocorrência; uma ocorrência portadora de regra por série, sem impedir reabrir outra antiga. | **P · TFA-005.** Fechamento e próxima ocorrência são atômicos; repetição/concorrência não duplicam. Integração de lembrete e undo é refinada nas próprias Changes. | [task-recurrence.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-recurrence.test.ts), [task-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/task-service.test.ts). |
| **P03 — Subtarefas** · [task-subtasks spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-subtasks/spec.md) | Até 20; título até 200; IDs únicos por tarefa; um nível; ordem manual e progresso derivado. Estado independente do pai. Edição conserva marcações recentes das subtarefas existentes. | **P · TFA-005.** Preservar regras e ordem; verificar foco ao reordenar, toggles concorrentes e edição sem perda. | [task-subtasks.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-subtasks.test.ts), [TaskForm.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskForm.test.ts). |
| **P04 — Lixeira** · [task-trash spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-trash/spec.md) | Retenção de 30 dias; máximo 100, descartando mais antigas; exatamente no limite ainda retida e `deletedAt` futuro preservado. Move/restore atômicos; restore conserva ID, recusa colisão e trata lembretes vencidos; incompatibilidade bloqueia escrita; limpeza nos eventos previstos, sem cron novo. Excluir item que carrega regra pausa a série até restore, sem ocorrência imediata. | **P/A · TFA-003/006.** Persistência desktop e move/restore coordenados. Backup não transporta nem altera lixeira. | [task-trash.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-trash.test.ts), [trash integration test](C:/QSI/Workspaces/taskflow-extension/tests/integration/trash.test.ts). |
| **P05 — Desfazer** · [task-undo spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-undo/spec.md) | Última edição/status/exclusão bem-sucedida, temporária por superfície e sem timer de expiração. Pré-condições recusam concorrência, inclusive ocorrência gerada alterada. Abrir formulário/backup/lixeira, próxima ação ou fechamento invalida conforme origem. Sem undo de criação/toggle/restore/importação. Processar lembrete não bloqueia undo por si só. | **P/A · TFA-006.** Main guarda plano e token escopado; fechar para bandeja exige decidir o fim da sessão. Não criar histórico persistente. | [task-undo.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-undo.test.ts), [TaskManager.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskManager.test.ts). |
| **P06 — Backup** · [task-backup spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-backup/spec.md) | Formato `taskflow-backup` v4; aceitar/migrar v1–v4. Schema de armazenamento separado. UTF-8, timestamp UTC, nome com hora local, limite de 20 MiB antes de ler. Validação integral, IDs únicos, datas canônicas, prévia/confirmar e substituição total, inclusive arquivo vazio. Versão futura/inválida não altera dados locais. Exporta tarefas, não lixeira, credenciais ou undo. | **P/A/R · TFA-007.** Dialogs e leitura ficam no main; verificar todos os campos no restore. Corrigir no app a lacuna de comparação pós-restore, sem alterar a extensão. | [v4 fixture](C:/QSI/Workspaces/taskflow-extension/tests/fixtures/backups/taskflow-backup-v4.json), [backup-file.test](C:/QSI/Workspaces/taskflow-extension/tests/application/backup-file.test.ts), [backup-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/backup-service.test.ts). |
| **P07 — Lembretes** · [task-reminders spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/task-reminders/spec.md) | Até 10; `dueAt` obrigatório; offsets inteiros não negativos ou AT até prazo; novos efetivos futuros e únicos; recorrência só com offsets. Ocorrência usa `processedFor`; consumir condicionalmente antes de notificar; no máximo uma tentativa, sem garantia de entrega. Reconcile de abertura descarta passados; tolerância de entrega 5 min, distinta do alarme obsoleto de 1 min. | **P/A/R · TFA-008.** Scheduler reconstruído de estado durável; provar suspend/resume/restart e mudanças concorrentes no app instalado. Abrir tarefa no clique de notificação é adaptação nova a revisar, não semântica Chrome comprovada. | [task-reminders.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/task-reminders.test.ts), [reminder-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/reminder-service.test.ts). |
| **P08 — Quick Add** · [quick-add spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/quick-add/spec.md) | Entrada compacta para título/prazo/pessoas/prioridade; foco inicial; sucesso limpa draft, falha o conserva; abrir gerenciamento não perde estado. Sem IA, lixeira ou backup nessa superfície. | **P/A · TFA-004/009.** Adaptar popup para janela pequena própria; não impor largura fixa Chrome à janela principal. | [QuickAdd.test](C:/QSI/Workspaces/taskflow-extension/tests/components/quick-add/QuickAdd.test.ts). |
| **P09 — Captura** · [page-capture spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/page-capture/spec.md) | Origem tem botão de página e menu de seleção, título/URL da aba e normalização/truncamento seguro. Captura pendente identificada, TTL de 10 min e substituição pela nova; durante edição não sobrepõe draft. | **A/R · TFA-009.** Adaptação confirmada pelo usuário: links e textos copiados, lidos pontualmente após botão/atalho explícito. Sem ler aba, buscar título/metadados ou monitorar clipboard. Para URL apenas, `sourceUrl` e título vazio são proposta sujeita à revisão; texto usa normalização/limites existentes. | [page-capture.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/page-capture.test.ts), [use-pending-capture.test](C:/QSI/Workspaces/taskflow-extension/tests/components/capture/use-pending-capture.test.ts). |
| **P10 — Atalhos** · [keyboard-shortcuts spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/keyboard-shortcuts/spec.md) | Chrome sugere Ctrl+Shift+K/L para Quick Add/gerenciamento. UI informa combinação efetiva/indisponibilidade e não finge registro. | **A/R · TFA-009.** Registro global personalizável, feedback de conflitos com SO/apps e captura com combinação própria a revisar; não presumir que ambos os atalhos sugeridos estarão livres. | [ShortcutsHint.test](C:/QSI/Workspaces/taskflow-extension/tests/components/shortcuts/ShortcutsHint.test.ts). |
| **P11 — Providers de IA** · [ai-providers spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/ai-providers/spec.md) | Um provider ativo OpenAI/Anthropic/CUSTOM compatível com OpenAI. HTTPS remoto, HTTP só loopback; base sem credenciais/query/fragment. Modelo/segredo conforme provider. Probe de 15 s e ping mínimo somente explícitos; redirect bloqueado; sem rede automática. | **P/A/R · TFA-010.** Consentimento por origem substitui host permission Chrome; proteger segredo no main. Avaliar safeStorage/DPAPI; plaintext não é fallback automático. | [ai-provider.test](C:/QSI/Workspaces/taskflow-extension/tests/domain/ai-provider.test.ts), [ai-adapters.test](C:/QSI/Workspaces/taskflow-extension/tests/infrastructure/ai-adapters.test.ts). |
| **P12 — Assistência de tarefas por IA** · [ai-task-assistance spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/ai-task-assistance/spec.md) | Formulário com título/vagas; prévia exata, descrição enviada até 1.000 e instruções fixas; até 20 subtarefas com títulos validados/deduplicados. Uma requisição, saída limitada, timeout 30 s; cancelar/fechar descarta. Selecionar/editar sugestão altera draft, nunca salva automaticamente. | **P/A · TFA-010.** Snapshot/preparação e requestId no main. Não transmitir segredo em leitura nem conteúdo em logs; mocks sem chamadas pagas. | [ai-subtask-suggestion-service.test](C:/QSI/Workspaces/taskflow-extension/tests/application/ai-subtask-suggestion-service.test.ts), [TaskFormAiSuggestion.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskFormAiSuggestion.test.ts). |
| **P13 — Acessibilidade** · [interface-accessibility spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/interface-accessibility/spec.md) | Hierarquia, labels/ARIA/feedback; contraste de texto 4,5:1 e foco 3:1. Dialog: foco inicial cancelar, trap, Escape e restauração. Mudança de status por teclado permite escolher/confirmar/reverter, incluindo regra especial de cancelamento recorrente; foco após ação e erro inicial. | **P · TFA-004–012.** Preservar identidade, acessibilidade, foco, erros e teclado; validar DPI/zoom/tabulação/leitor de tela Windows. Troca de controles exige equivalência. | [contrast.test](C:/QSI/Workspaces/taskflow-extension/tests/styles/contrast.test.ts), [ConfirmDialog.test](C:/QSI/Workspaces/taskflow-extension/tests/components/ConfirmDialog.test.ts), [TaskList.test](C:/QSI/Workspaces/taskflow-extension/tests/components/tasks/TaskList.test.ts). |
| **P14 — Ícones e identidade** · [extension-icons spec](C:/QSI/Workspaces/taskflow-extension/openspec/specs/extension-icons/spec.md) | Marca check branco, fundo `#5368e8`, forma arredondada, sem calendário/IA; master SVG e variantes Chrome. | **P/A/R · TFA-002/011/012.** Derivar assets Windows/tray/instalador e revisar; não presumir que PNG Chrome serve para todo uso desktop. Divergência da permissão fica registrada abaixo. | [extension-icons.test](C:/QSI/Workspaces/taskflow-extension/tests/brand/extension-icons.test.ts). |

Regras complementares a transportar: migrar backup v1 `processedAt` para `processedFor`, v2 para estrutura de recorrência, v3 para subtarefas sem perder IDs/datas válidos; `appVersion` exportada é informativa do desktop. Restore ajusta lembretes passados e reconcilia scheduler. Falha de scheduler após commit informa pendência, sem alegar rollback de dados já gravados.

## Substituições de APIs exclusivas do Chrome

| Origem observada | Destino planejado |
| --- | --- |
| WXT, Manifest V3, service worker, popup e Side Panel | Shell/composição desktop e janelas locais; não reutilizar scaffold WXT. |
| `browser.storage.local` e `storage.onChanged` | Repository no main, persistência versionada e eventos com revisão. |
| `browser.alarms` e notifications | Scheduler refeito do estado durável e notificações Windows. |
| `activeTab`, `tabs` e `contextMenus` | Remover; captura apenas de clipboard por ação explícita, sem inspeção de abas/menu Chrome. |
| `browser.commands` e página `chrome://extensions/shortcuts` | Configuração de atalhos globais no app e verificação da combinação realmente registrada. |
| `browser.windows`, Side Panel e mensagens de captura | Identidade de superfície, foco/roteamento no main e inbox temporária. |
| `runtime.getManifest`, mensagens e optional host permissions | Metadata de app, IPC e consentimento por origem para IA. |

**Captura confirmada:** botão e atalho leem links/textos copiados pontualmente e sob ação do usuário. Não adicionar navegador embutido, extensão auxiliar, leitura automática da aba, fetch de título, polling ou monitoramento contínuo da área de transferência. São excluídas da migração inicial conta/backend obrigatório, sincronização, dashboard, histórico persistente, mesclagem de backups, auto-update remoto e versão mobile.

**Backup:** transporta tarefas nos formatos v1–v4. Não promete migrar lixeira, credenciais de IA ou estado temporário de undo. A migração é manual pelo recurso atual da extensão; o app não lê perfil Chrome automaticamente.

## Divergências específicas da inspeção

1. **Comparação pós-restore incompleta na origem:** `sameTask` em [backup-service.ts, linha 102](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:102) compara campos/tags/lembretes, mas não subtarefas, recurrence ou `seriesId`, embora o formato de backup os transporte. É uma lacuna de verificação do app a cobrir na **TFA-007**; não transforma a omissão em comportamento a preservar e não será corrigida na extensão.
2. **Spec antiga de permissões de ícones:** a [spec extension-icons](C:/QSI/Workspaces/taskflow-extension/openspec/specs/extension-icons/spec.md) afirma exatamente `sidePanel`, `storage`, `alarms`, `notifications` e ausência de `host_permissions`/`optional_host_permissions`. No mesmo HEAD, [wxt.config.ts](C:/QSI/Workspaces/taskflow-extension/wxt.config.ts) declara também `activeTab`, `contextMenus` e `optional_host_permissions` HTTPS/loopback. Para a migração, inventariar permissões do código atual, não copiar a regra desatualizada; registrar a divergência na validação futura de identidade/capacidades **TFA-002/011/012**. Não alterar a origem.

## TFA-002 — prova de fundação (2026-10-04)

A fundação implementada **não migra nenhum comportamento** desta matriz: P01–P13 continuam com destino nas Changes funcionais. O que a prova registra:

- **P14 (parcial):** o master SVG revisado foi derivado para um ICO Windows multirresolução (16/24/32/48/256 px) usado no pacote; identidade `taskflow.app`/`TaskFlowApp.exe` estável. Ícones de bandeja e acabamento de distribuição ficam para TFA-008/011; o pacote é provisório e não assinado.
- **Infraestrutura de plataforma:** shell isolado, contrato diagnóstico, perfis separados, ownership de instância e prova `node:sqlite` no pacote foram implementados e verificados; detalhes e limites em [architecture.md](architecture.md) e [desktop-foundation-validation.md](desktop-foundation-validation.md).
- **Não conclusões explícitas:** a prova não confirma paridade de tarefas, pesquisa, filtros, recorrência, subtarefas, lixeira, undo, backup, lembretes, captura, atalhos ou IA; não confirma durabilidade, recovery, migrações ou concorrência de dados (TFA-003) e não valida o produto completo em conta padrão além dos cenários executados.
- A divergência de permissões de ícones da origem permanece registrada para TFA-011/012; a origem não foi alterada.

## TFA-003 — persistência e fronteira IPC (2026-10-04)

A TFA-003 **não entrega nenhuma funcionalidade visível** desta matriz: não há tela de tarefas, lixeira, undo, backup ou lembretes. O que passou a existir é a base de armazenamento e leitura sobre a qual as Changes funcionais serão construídas.

- **P01 (parcial, só armazenamento):** todos os campos conhecidos da tarefa são preservados em round-trip e reopen — `id`, `title`, `description`, `requester`, `assignee`, `status`, `priority`, `dueAt`, lembretes AT/OFFSET com `processedFor`, `seriesId`, `recurrence`, subtarefas ordenadas, `tags`, `sourceUrl`, `createdAt`, `updatedAt`, `completedAt`. Validação de formulário, pesquisa, filtros, ordenação e comandos de criar/editar/status continuam em TFA-004. Os limites de formulário **não** são aplicados pelo armazenamento, para não recusar dado historicamente válido.
- **P02/P03 (só dados):** série, regra de recorrência e subtarefas são conservadas sem gerar ocorrência nem alterar marcações. As regras ficam em TFA-005.
- **P04 (parcial, só armazenamento):** lixeira com chave própria, `deletedAt`, move/restore no mesmo commit e recusa `ID_EXISTS`. **Diferença em relação à origem:** mover para a lixeira não aplica a retenção de 30 dias nem o limite de 100 itens, e ler a lixeira nunca expurga; o expurgo é uma unidade explícita. Retenção, limite, ordenação e a UX ficam em TFA-006.
- **P05 (base):** edição e reversão condicionais por revisão de conteúdo, que o processamento de lembrete não altera. **Diferença em relação à origem:** a condição usa revisão persistida em vez de `updatedAt`. Plano, token e semântica de undo ficam em TFA-006.
- **P06:** os codecs v1–v4 são reconhecidos para os payloads armazenados; isso **não** é importação de backup. Arquivo de backup, prévia e substituição ficam em TFA-007.
- **P07 (base):** claim condicional de ocorrência persistido antes de qualquer efeito, no máximo um por ocorrência. Scheduler, notificação e entrega ficam em TFA-008.
- **Substituição de API Chrome:** `chrome.storage` e `storage.onChanged` deram lugar ao banco SQLite local, a um coordenador único no main e a eventos de invalidação com revisão. A fila por instância e a leitura sem revisão da origem não foram transportadas.
- **Não conclusões explícitas:** nenhuma paridade observável de interface foi verificada; o backup da extensão ainda não pode ser importado; nenhum dado é migrado automaticamente.

Detalhes e evidências em [local-persistence-and-state-ipc.md](local-persistence-and-state-ipc.md).

## TFA-004 — regras básicas portadas e restrições temporárias

A TFA-004 (apply concluído e Change arquivada em 2026-10-04) transporta por cópia revisada as regras puras de P01 para o núcleo portável e as cobre com testes de domínio. A evidência de comandos, interface e pacote está consolidada em [desktop-task-management.md](desktop-task-management.md); nada de UI ou IPC é declarado disponível sem essa evidência.

- **P01 (regras básicas):** campos, defaults TODO/MEDIUM, trim, tags distintas sem diferenciar caixa, limites 200/4000/120/10×30, URL HTTP/HTTPS, pesquisa substring/caixa em título/descrição/pessoas/tags/subtarefas (sem remover acentos e sem pesquisar `sourceUrl`), filtros AND, três ordenações com desempates e classificação de prazo ativo (< agora / [agora, agora+24 h]) foram portados com testes determinísticos. Status simples preserva `completedAt` (`DONE` registra, demais limpam) e o mesmo status é no-op.
- **Edição por patch:** ausente conserva; `null` limpa apenas descrição/solicitante/responsável/prazo/origem; `[]` limpa tags. Valores históricos intactos (inclusive acima do limite de formulário) não são revalidados nem regravados; valores alterados precisam cumprir o limite. Prazo não alterado conserva o ISO original, com segundos/milissegundos.
- **Comandos e concorrência:** os quatro comandos fechados (`createTask`, `updateTask`, `changeTaskStatus`, `openTaskSource`) decidem dentro da unidade coordenada, usam CAS por revisão de conteúdo (nunca timestamp/global), geram IDs/relógio no main com colisão protegida em tarefas/lixeira, devolvem ack curto e nunca aceitam auditoria/avançados/URL livre do renderer. Byte budgets: 64 KiB de request e 8 KiB de resposta, medidos em UTF-8 serializado, sem truncar dados legítimos; leitura/eventos continuam 1 KiB e páginas 256 KiB. A origem salva é validada no main (HTTP/HTTPS, host, sem credenciais/controles, href ≤2081) e aberta fora da transação, revalidando a sessão antes do efeito e da entrega.
- **Diferenças temporárias explícitas (não implementadas nesta Change):**
  - **P02 — recorrência:** presente no snapshot torna a tarefa **somente leitura** para mutação até a TFA-005; leitura, pesquisa e abertura de origem continuam disponíveis. `seriesId` isolado, sem regra, não bloqueia.
  - **P03 — subtarefas:** itens existentes são apresentados/pesquisados **somente leitura**, sem adicionar, marcar ou reordenar, até a TFA-005; os dados são preservados integralmente.
  - **P04 — lixeira/exclusão:** nenhum botão ou comando de excluir/lixeira/desfazer; a primitive existente não é exposta. Política e tela ficam na TFA-006.
  - **P07 — lembretes:** dados e `processedFor` são preservados, mas mudança **efetiva** de prazo ou status com lembretes presentes é recusada (`ADVANCED_TASK_RESTRICTED`) até a TFA-008, porque a origem liquida/reconcilia ocorrências nessas ações. Edição independente continua válida.
- **Nota das substituições:** a pesquisa não inclui `sourceUrl`, não remove acentos e não tokeniza palavras — igual à origem; o armazenamento continua sem aplicar limites de formulário a dados históricos.

## TFA-005 — recorrências, subtarefas e fluxo de edição (apply em andamento)

A TFA-005 habilita, no renderer, os fluxos que a TFA-004 mantinha somente leitura. O comportamento
abaixo está implementado no apply com testes de renderer próprios; verificação formal, pacote e
medição de volume pertencem aos grupos 7/8 e ainda não foram declarados como resultados. O domínio
puro está em [domain-recurrence-and-subtasks.md](domain-recurrence-and-subtasks.md) e a interface em
[task-form-and-cards.md](task-form-and-cards.md).

- **P01 (edição):** o formulário continua conservando campos e valores históricos intactos; marcar
  subtarefas não invalida a edição: save após checks envia `{id, title}` sem `done` e conserva as
  marcações atuais lidas no main, condicionado à revisão de edição. Alteração estrutural/de campo
  concorrente continua conflitando com draft e base preservados, sem merge ou rebase automático.
- **P02 (interface):** regra DAILY/WEEKLY/MONTHLY com parâmetro exato e limite opcional, retirada
  explícita (`recurrence: null`) e resumo no cartão; CANCELLED recorrente por Enter/ponteiro/save
  passa pelo diálogo SKIP/END e por focusout restaura a seleção sem comando (exceção documentada).
  Cálculo, âncora, fechamento atômico e próxima ocorrência continuam no main/domínio.
- **P03 (interface):** até 20 subtarefas ordenadas com adicionar/remover/mover por teclado, erros
  por índice, checkbox por intenção `done` em qualquer status, busy focável e progresso derivado do
  snapshot; expansão do cartão é transitória e não persistida.
- **P07 (limite temporário):** a guarda D8 continua: com lembretes, mudar efetivamente prazo/status
  ou fechar/gerar ocorrência é recusado com motivo acessível, enquanto edições independentes e a
  retirada isolada da regra seguem permitidas. Nenhum scheduler/notificação é entregue.
- **P04/P05/P06/P08–P14** permanecem fora desta entrega: não há excluir/lixeira funcional, desfazer,
  backup/restauração, lembretes editáveis, notificações, captura, atalhos ou IA na interface.
- **Ainda não declarado:** meta de volume/p95 do D10 herdado (histórico reprovado), execução no
  Electron empacotado e a matriz de verificação da Change; nada disso é comprovado pelos testes de
  componente descritos acima.

## Riscos e gates futuros

| Risco | Tratamento e destino |
| --- | --- |
| Regras ou referências mudarem na origem | Revalidar o hash/fontes antes de copiar em Change futura; não executar build/teste nem escrever na origem. |
| Diferença conhecida ser convertida em requisito de paridade | Manter as duas divergências explícitas; corrigir cobertura no app apenas na Change responsável. |
| Presumir paridade a partir de aparência/build | Exigir evidência por níveis e app/instalador Windows, conforme [estratégia de testes](test-strategy.md). |
| Reaproveitar código sem revisar acoplamentos/dados | Copiar somente arquivos selecionados e revisados em Change futura; nunca `.git`, `.env`, segredos, dados reais, `node_modules`, builds ou configuração pessoal. |
| Adaptação de plataforma virar escopo novo | Qualquer redesign, dashboard, recurso novo ou mudança material de comportamento requer Change e aprovação próprias. |

A TFA-001 não copia ou executa os testes listados, não cria runtime e não confirma funcionamento do produto. Critérios e gates futuros continuam associados às TFA responsáveis na tabela P01–P14.

## TFA-006 — lixeira e desfazer (2026-10-04)

| Comportamento da origem | Tratamento no desktop | Diferenças explícitas |
| --- | --- | --- |
| Lixeira 30 dias / 100 itens / ordem por exclusão | Preservado no domínio com 30×24 h decorridos, corte no move e ordem `deletedAt`/revisão/ID UTF-16. | Empates históricos usam desempate determinístico adaptado (a lista Chrome não existe no banco); relógio recuado pode descartar a própria exclusão com aviso honesto. |
| Restore direto não conferia idade | Restore/undo conferem idade/entrada/ID/portadora **em todo caminho**, sem expurgo oculto na recusa. | Lacuna da origem corrigida; entrada vencida nunca é restaurada. |
| Undo por `updatedAt` | Recibo no main por conteúdo completo (`contentRevision`), before-image relida e referência exata da gerada. | Claim isolado não bloqueia; edição/check/ABA bloqueiam; token consumido uma vez. |
| Confirmações e foco | Confirmação recuperável/irreversível com base preparada no main, aviso de série e foco vizinho/último/Voltar. | Esvaziamento recusa composição alterada (escolha humana) em vez de apagar itens novos. |
| Expurgo por leitura (startup/list) | `prepareTrashView` explícito no startup válido/entrada e no move; snapshots puros. | Filtro temporal só na apresentação (60 s/foco), sem timer de escrita. |
| Desfazer com expiração/limpeza | Oferta sem prazo por documento; ações/áreas/falha/no-op limpam; filtros/minimizar não. | Histórico temporário não é persistido nem exportado; fechar/reabrir perde a oferta. |
| Backup/lixeira/credenciais no arquivo | Backup continua transportando somente tarefas; contrato interno invalida recibos após sucesso futuro (TFA-007). | Lixeira e undo não entram no backup; nenhum percurso funcional de backup nesta Change. |
