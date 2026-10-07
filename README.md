# TaskFlow App

Aplicativo desktop **autocontido e local-first** para captura rápida e gerenciamento de tarefas pessoais e profissionais. É derivado da extensão TaskFlow para Google Chrome e tem como destino o Windows, distribuído por um instalador **por usuário** — sem exigir administrador e sem instalar serviços de sistema.

> **O que o aplicativo faz hoje:** abre uma janela principal de tarefas com criação/edição dos campos básicos, **recorrências diárias/semanais/mensais com limite e encerramento de série**, **até 20 subtarefas ordenadas com progresso e marcação independente**, conclusão/cancelamento/reabertura, **lixeira com retenção de 30 dias, restaurar, excluir definitivamente e esvaziar**, **desfazer temporário da última edição/status/exclusão**, **backup versionado (formatos 1 a 4) com prévia, confirmação irreversível e substituição total preservando a lixeira**, **até 10 lembretes por tarefa (deslocamentos e horários absolutos) com notificação nativa do Windows, agenda recuperável e clique que localiza a tarefa**, pesquisa, filtros combináveis, três ordenações, prazos no fuso local e abertura da origem salva no navegador padrão, sobre um banco local de tarefas e lixeira com estado versionado (schema SQL 2, migração automática da versão anterior). **Fechar mantém o aplicativo na bandeja com os lembretes ativos; Sair encerra**, e há **inicialização opcional com o usuário** (desligada por padrão). Há **Quick Add em janela independente, captura explícita de texto/URL copiado para rascunho revisável e atalhos globais personalizáveis**, e **assistência de IA opcional no gerenciamento**: provedores OpenAI, Anthropic e CUSTOM com credencial própria cifrada pelo Windows (safeStorage/DPAPI), teste de conexão por gesto e **sugestão de subtarefas com prévia literal, consentimento e revisão** — a IA nunca é acionada automaticamente e o Quick Add não oferece IA.

## Propósito

Levar as atividades oferecidas hoje pela extensão TaskFlow para um aplicativo Windows nativo, sem depender do navegador, mantendo os dados no próprio computador do usuário.

A migração deve preservar os comportamentos e regras já verificados na extensão de origem:

- criação e edição de tarefas com descrição, tags, prioridade, prazo, solicitante, responsável, status e URL de origem;
- conclusão, cancelamento, reabertura, alteração de status e exclusão com confirmação;
- pesquisa sem diferenciar maiúsculas, filtros combináveis e ordenação, com sinalização de tarefas atrasadas e que vencem em até 24 horas;
- recorrências diárias, semanais e mensais, com limite opcional e opção de encerrar a série;
- até 20 subtarefas por tarefa, em ordem manual, com progresso calculado e marcação independente;
- lixeira com retenção de 30 dias, restaurar, excluir definitivamente e esvaziar;
- desfazer a última exclusão, alteração de status ou edição;
- backup manual versionado (formatos 1 a 4) com prévia e restauração por substituição total;
- até 10 lembretes por tarefa, combinando deslocamentos antes do prazo e horários absolutos, com tolerância de 5 minutos;
- Quick Add, captura por link/texto copiado e atalhos de teclado;
- provedores de IA opcionais (OpenAI, Anthropic e CUSTOM) com teste de conexão e sugestão de subtarefas revisável.

O roadmap registra o tratamento planejado e a Change responsável por cada item.

## Princípios do produto

- **Autocontido e local-first:** o funcionamento principal não depende de backend próprio, conta, autenticação central, nuvem ou rede. Integrações externas e IA são opcionais.
- **Windows por usuário:** instalação no perfil do usuário, sem elevação, serviços de sistema ou publicação automática de releases.
- **Paridade observável:** identidade visual, acessibilidade, estados de erro e comportamento de teclado devem ser preservados.
- **IA opcional:** acionada pelo usuário, conectada diretamente ao provedor escolhido, com prévia, consentimento, cancelamento, timeout e revisão; nenhuma sugestão é aplicada automaticamente.
- **Segurança:** renderer sem acesso livre a Node ou filesystem, preload mínimo, IPC tipado e validado, isolamento de contexto, sandbox, CSP e credenciais protegidas por mecanismo do sistema.

## Fundação técnica

- **Stack:** Vue 3 + Pinia com Electron, builds separados de main/preload/renderer via `electron-vite`, TypeScript estrito em todos os projetos. O núcleo portável (contratos, domínio e aplicação) não importa Vue, Pinia, Electron, Node nem rede.
- **Isolamento:** `contextIsolation`, `sandbox` e `webSecurity` ativos; renderer servido apenas por assets locais (`taskflow://app`) com CSP restritiva; navegação externa, janelas, webviews e permissões negadas por padrão.
- **Bridge fechada:** **43 operações no gerenciamento e 14 no Quick Add** expostas ao renderer — `verifyFoundation`, `getStateSnapshot`, `subscribeState`, `unsubscribeState`, `createTask`, `updateTask`, `changeTaskStatus`, `setSubtaskDone`, `openTaskSource`, `clearUndoOffer`, `prepareTrashConfirmation`, `moveTaskToTrash`, `restoreTrashItem`, `deleteTrashItem`, `emptyTrash`, `prepareTrashView`, `undoLastTaskAction`, `exportBackup`, `prepareBackupRestore`, `confirmBackupRestore`, `cancelBackupRestore`, `getDesktopStatus`, `setStartAtLogin`, `requestQuit`, `subscribeDesktopEvents` e `resolveReminderActivation`, mais os nove wrappers de entrada rápida: `openQuickAdd`, `openTaskManager`, `captureClipboard`, `getPendingCapture`, `acknowledgeCapture`, `discardCapture`, `getShortcutSettings`, `setShortcut` e `setShortcutEditing`, e as oito operações de IA exclusivas do gerenciamento: `getAiProviderStatus`, `saveAiProviderConfig`, `removeAiProviderConfig`, `authorizeAiUse`, `testAiConnection`, `prepareAiSuggestion`, `suggestAiSubtasks` e `cancelAiSuggestion`. O Quick Add tem facade própria e não recebe operações de edição, lixeira, backup, configuração de atalhos ou IA do gerenciamento. Estado/eventos são **v3** (com época transitória do undo, evento `undo-invalidated` e ressincronização), o diagnóstico/origem conserva v1, `createTask` é **v4** e `updateTask` é **v5** (intenção de lembretes sem IDs de cliente/processedFor), `changeTaskStatus` é **v4**, `setSubtaskDone` é **v3**, `moveTaskToTrash` é **v2**, os demais wrappers de lixeira/contexto são v1, os quatro de backup são v1 ; status/inscrição/eventos desktop são **v2**, startup/quit/resolução de ativação são **v1** e os nove wrappers de entrada rápida são **v1**, com payloads fechados, e as oito operações de IA são **v1**, exclusivas do gerenciamento, com consentimentos registrados no main e nada de IA em eventos. Requests novos têm 1 KiB, respostas 8 KiB (pendência de captura até 64 KiB, configuração de IA até 8 KiB e prévia/sugestão de IA até 16 KiB, medidos em UTF-8 antes do efeito), eventos 1 KiB com referências sem clipboard bruto e nenhum conteúdo de IA em evento. Tudo é validado por schema exato: 1 KiB para estado/eventos, 64 KiB de request e 8 KiB de resposta para comandos (prévia de backup ≤ 8 KiB), `webContents` registrado, main frame, origem e URL reais e sessão do documento, com códigos de erro fechados (incluindo `RECURRENCE_CHOICE_REQUIRED`, `SERIES_CONFLICT`, `IDENTITY_CONFLICT`, `SUBTASK_NOT_FOUND`, `STALE_CONTEXT`, `CONFIRMATION_INVALID/CHANGED`, `ENTRY_CHANGED/EXPIRED`, `ID_EXISTS`, `UNDO_NOT_AVAILABLE`, `CHANGED`, `REMOVED`, `GENERATED_CHANGED`, `FILE_TOO_LARGE`, `INVALID_ENCODING`, `LOCAL_DATA_NOT_EXPORTABLE`, `DESTINATION_NOT_ALLOWED/CHANGED`, `BACKUP_PREVIEW_INVALID/EXPIRED`, `BACKUP_BASE_CHANGED`, `BACKUP_VERIFICATION_FAILED`, `BUSY`, `RESOURCE_LIMIT`, `NATIVE_OPERATION_FAILED`, `STATE_UNKNOWN` e `NOT_AVAILABLE`). Erros de lembrete são índices 0–9 com códigos finitos; edição/status/toggle usam **revisão de edição** (CAS); exclusão/restore/desfazer usam a **referência observada da entrada** e a revisão de conteúdo completa; backup usa **CAS global** e nunca recebe path, JSON ou `Task` do renderer; a abertura externa usa apenas a origem salva validada no main; a resolução de ativação aceita só a tag SHA25664. Não há SQL, caminho, canal genérico, `Task` livre, plano de desfazer livre ou URL arbitrária.
- **Janela de tarefas:** formulário, lista de cartões, filtros/ordenação e seletor de status com teclado; identidade, foco, `aria` e contraste preservados. **Recorrências** (frequência, parâmetro e limite) e **subtarefas** (até 20, ordem manual, progresso derivado e marcação por intenção em qualquer status) são editáveis; concluir/pular transfere a regra para uma próxima ocorrência e cancelar uma recorrente pede SKIP/END em diálogo acessível. **Lembretes** (até 10 por tarefa: deslocamentos em minutos com presets 0/15/60/1440 e horários absolutos) aparecem no formulário com erro por item, revisão explícita quando o fuso muda com prazo/AT alterado e liquidação automática de ocorrências vencidas nas mutações. **Excluir** pede confirmação recuperável (30 dias, limite 100 e descartes irreversíveis) e oferece **Desfazer** na listagem enquanto a oferta da janela durar; a **Lixeira** (cabeçalho e estado vazio) permite restaurar, excluir definitivamente e esvaziar com confirmações irreversíveis e foco previsível. A área **Backup** exporta um snapshot de todas as tarefas por diálogo nativo **sem expor path/JSON ao renderer**, lê backups v1–v4 com prévia de versão original/normalizada, contagens, data e aplicativo de origem, avisa quando o arquivo não tem tarefas, oferece exportação preventiva opcional e só substitui após confirmação irreversível; a lixeira atual é preservada e o arquivo não inclui lixeira, credenciais/configuração de IA ou desfazer. A área secundária **Comportamento do aplicativo** mostra os avisos de bandeja/tolerância de 5 minutos/transiência de rascunho, o estado dos lembretes, o toggle **Iniciar com o usuário** (opt-in no registro do próprio usuário) e o botão **Sair**. A área secundária **Assistência de IA (opcional)** configura provedor, base (somente CUSTOM) e modelo, aceita a credencial apenas na gravação — cifrada pelo Windows e nunca exibida de volta —, mostra a origem de destino, exige consentimento explícito antes de enviar a credencial, testa a conexão por listagem de modelos ou envio mínimo (`ping`, 1 token) e remove a configuração revogando consentimentos; estados bloqueados (proteção indisponível, credencial indecifrável, arquivo incompatível) oferecem somente a remoção. No formulário, **Sugerir subtarefas** exibe a prévia literal do que será enviado (título e descrição atuais, com corte sinalizado em 1.000 caracteres), pede consentimento de conteúdo, mostra progresso com cancelamento e devolve uma proposta revisável que só acrescenta linhas ao formulário — a IA não grava nada e salvar segue o fluxo normal com desfazer. Fechar (X/Alt+F4) mantém o aplicativo na bandeja e oculta a janela com rascunho/filtros; ao receber um aviso, o **clique abre a tarefa em consulta** com foco; o diagnóstico da fundação fica em uma área secundária recolhível.
- **Quick Add e captura:** a janela rápida conserva seu rascunho ao fechar/reabrir na mesma execução e limpa apenas após sua criação confirmada. Abrir não lê clipboard. Capturar por botão usa a própria janela; global/bandeja usa Quick Add. URL isolada preenche origem inteira e exige título manual; texto gera título/descrição com avisos de corte. Captura durante edição fica como oferta para Revisar/Descartar, sem sobrescrever ou salvar automaticamente. Sair/crash perde drafts e conteúdo transitório. O Windows pode negar foco/registro; botões e bandeja continuam disponíveis. Preferências de atalhos ficam fora do backup, em arquivo próprio versionado, com consulta/reconciliação explícita quando o resultado for incerto.
- **Estado para a interface:** snapshot completo de tarefas e lixeira por revisão **e época transitória do undo (`undoEpoch`)**, com revisões de conteúdo **e de edição** por registro, paginado em até 256 KiB por mensagem, com eventos de invalidação (incluindo `undo-invalidated`) e ressincronização automática (a cada 30 s e ao retomar o foco); a store aguarda snapshot de revisão igual ou superior ao ack antes de encerrar a sincronização e preserva rascunho/base em conflito, tarefa ausente ou resultado incerto. As ações de tarefa/lixeira estabelecem um **contexto ordenado por documento** (limpa oferta/confirmação anterior) e a oferta de Desfazer só aparece após o commit confirmado, o snapshot correspondente e a **época ainda corrente** (acks de update/status/move carregam a época; uma restauração confirmada, mesmo sem mudanças, invalida ofertas antigas globalmente).
- **Perfis e ownership:** identidade `taskflow.app`/`TaskFlowApp.exe`; dados em `%LOCALAPPDATA%\TaskFlowApp\profiles\<dev|test|prod>\{user-data,session-data}`; instância única por perfil antes de abrir o armazenamento. Lembretes e ciclo de vida usam agenda descartável no main, notificação nativa do Windows (identidade NSIS v1 com AUMID/CLSID próprios, atalho validado e COM por usuário) e inicialização opt-in no `Run` do próprio usuário; dev/test nunca registram identidade de produção.
- **Armazenamento:** SQLite pelo `node:sqlite` embarcado no Electron, sem addon nativo. O banco de tarefas e lixeira fica em `<user-data>\data\taskflow.sqlite`, **schema SQL 2** com migração transacional automática 1→2 (payloads, IDs e codec v4 intactos; leitor antigo recusa o schema novo sem downgrade), gravações transacionais, um único coordenador de leitura/decisão/commit no processo principal e revisões persistidas de conteúdo/edição. Um banco existente vazio, incompatível ou corrompido bloqueia a abertura e é preservado — nunca é redefinido automaticamente. O diagnóstico usa um banco próprio, separado (`foundation-proof\proof.sqlite`). **Backup** não é dump do banco: o arquivo `taskflow-backup` (formatos 1 a 4) é validado/projetado com limites próprios (20 MiB por arquivo, leitura por handle, UTF-8 estrito) e orçamento lógico separado dos 64 MiB do desfazer; schema SQL, codec de payload e formato de arquivo têm versões independentes.
- **Instalador:** NSIS offline one-click **exclusivo por usuário** (`asInvoker`, sem elevate helper, updater ou serviços), com validação de argumentos/destino e ACE de leitura do AppContainer restrita ao diretório instalado. O instalador registra a metadata própria v1 (`AUMID`, `CLSID`, executável e atalho) e o desinstalador remove exclusivamente os recursos cuja propriedade confirma (atalho/COM/`Run`/metadados), preservando os dados do usuário.
- **Matriz fixada:** Node 24.21.0 e npm 11.21.0 (build), Electron 44.5.1, electron-builder 26.17.0, electron-vite 5.0.0/Vite 7.3.6, Vue 3.5.43/Pinia 4.0.3, TypeScript 5.9.3/vue-tsc 3.3.12, ESLint 9.39.5, Vitest 4.1.11. Versões exatas no `package-lock.json`.

## Diferenças em relação à extensão

Em vez de ler a aba ativa do Chrome, o aplicativo usa **links e textos copiados**, acionados por botão ou atalho global, sem navegador embutido, extensão auxiliar ou monitoramento contínuo da área de transferência. As demais diferenças previstas:

- persistência em banco SQLite local no perfil do usuário, no lugar do armazenamento do navegador (implementada; a interface de tarefas cobre criação, edição, status, recorrências, subtarefas, lixeira, desfazer e lembretes);
- notificações nativos do Windows com ciclo de vida definido (bandeja ao fechar, Sair explícito, suspensão/energia, inicialização opcional no login) — implementados;
- atalhos globais personalizáveis, com preferência separada do registro observado e tratamento explícito de conflitos; dev/test não registram automaticamente.

O backup da extensão exporta **tarefas**. O aplicativo lê esse arquivo (formatos 1 a 4) e também gera os seus por um diálogo nativo, sem ler o perfil do Chrome automaticamente. Lixeira, credenciais de IA e estado temporário de desfazer não fazem parte do arquivo e não são transportados por ele; a lixeira existente no aplicativo é preservada na substituição.

## Estrutura do repositório

```text
src/contracts/        contratos tipados e validados da bridge
src/domain/           tipos e regras puras de tarefa
src/application/      codecs, unidade de trabalho, cliente de estado e casos de uso de tarefas (portáveis)
src/main/             processo principal: armazenamento, coordenação, IPC e harness de teste
src/preload/          bridge mínima exposta ao renderer
src/renderer/         interface Vue (gerenciamento, Quick Add e diagnóstico secundário)
tests/                testes unitários, de contrato, de armazenamento e de fronteiras
scripts/              geração de ícone, inspeção do pacote e smoke empacotado
build/                recursos do instalador (ícone e include NSIS)
assets/               master SVG da marca
docs/                 arquitetura, paridade, estratégia de testes, validação e roadmap
openspec/             configuração, specs consolidadas e histórico de Changes
package.json          scripts, matriz de versões e configuração do empacotador
tsconfig*.json        projetos TypeScript separados (contratos/main/preload/renderer/testes)
electron.vite.config.ts · eslint.config.mjs · vitest.config.ts
AGENTS.md · README.md · LICENSE
release/              artefatos gerados pelo empacotamento (não versionado)
```

## Como executar

Requisitos de desenvolvimento: **Node.js 24.21.0** e **npm 11.21.0** (fixados em `package.json` e `.nvmrc`). O aplicativo instalado não requer Node/npm.

```powershell
npm ci                  # instala exatamente o lockfile
npm run dev             # desenvolvimento (main/preload/renderer)
npm run lint            # ESLint sem warnings
npm run typecheck       # tsc (contratos/main/preload/testes) + vue-tsc (renderer)
npm run test            # Vitest
npm run build           # main, dois preloads e renderer
npm run validate        # lint + typecheck + testes + volume + build
npm run package:win     # instalador NSIS x64 (--publish never)
npm run verify:package  # inventário/manifests/hashes do pacote
npm run smoke:packaged  # executa o exe empacotado em cópia de teste (fundação, banco, migração 1→2 com kill, bridge com catálogos 43/14, duas janelas/captura, IA com transporte fictício, lixeira/desfazer, recorrência/subtarefas, backup, lembretes/ciclo de vida e volume)
```

O detalhamento de versões, hashes, limitações e das provas executadas (incluindo a instalação por usuário) está em [Validação da fundação](docs/desktop-foundation-validation.md); o contrato de armazenamento e de estado, seus limites e evidências estão em [Persistência local e IPC de estado](docs/local-persistence-and-state-ipc.md), e o formato/orçamento do backup e o percurso de migração em [Formato de backup](docs/backup-format.md) e [Backup e migração](docs/backup-migration-guide.md). Os comandos `/opsx:*` são comandos de chat do assistente; os comandos `openspec` são de terminal.

## Documentação

- [Instruções para agentes](AGENTS.md)
- [Roadmap, dependências e prompts OPSX](docs/roadmap.md)
- [Arquitetura](docs/architecture.md)
- [Matriz de paridade](docs/parity-matrix.md)
- [Estratégia de testes](docs/test-strategy.md)
- [Validação da fundação desktop](docs/desktop-foundation-validation.md)
- [Persistência local e IPC de estado](docs/local-persistence-and-state-ipc.md)
- [Gerenciamento de tarefas e interface](docs/desktop-task-management.md)
- [Domínio de recorrência e subtarefas](docs/domain-recurrence-and-subtasks.md)
- [Lixeira e desfazer — operação e limites](docs/task-trash-and-undo.md)
- [Lembretes e ciclo de vida desktop](docs/desktop-reminders-and-lifecycle.md)
- [Formato de backup e recursos](docs/backup-format.md)
- [Backup e migração manual das atividades](docs/backup-migration-guide.md)
- [Formulário e cartões](docs/task-form-and-cards.md)
- [Quick Add e atalhos globais](docs/quick-add-and-shortcuts.md)
- [Captura copiada e seus limites](docs/clipboard-capture.md)
- [Contratos de captura e atalhos](docs/capture-shortcuts-ipc.md)
- [Assistência de IA, provedores e credenciais](docs/ai-assistance.md)
- [Evidência de pacote da TFA-005](docs/packaged-evidence-tfa005.md)
- [Evidência de pacote da TFA-006](docs/packaged-evidence-tfa006.md)
- [Evidência de pacote da TFA-007 (backup)](docs/packaged-evidence-tfa007.md)
- [Roteiro manual de acessibilidade (TFA-005)](docs/a11y-manual-checklist-tfa005.md)
- [Roteiro manual de acessibilidade (TFA-006)](docs/a11y-manual-checklist-tfa006.md)
- [Roteiro manual de acessibilidade (TFA-008)](docs/a11y-manual-checklist-tfa008.md)

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
