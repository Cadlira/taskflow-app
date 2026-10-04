## Why

A fundação TFA-002 comprova um banco fictício e uma bridge diagnóstica, mas ainda não armazena tarefas/lixeira nem oferece leitura coordenada do estado de produto. TFA-003 precisa estabelecer durabilidade, concorrência e autorização antes de a TFA-004 introduzir gerenciamento, evitando transportar para desktop as filas por instância e decisões stale observadas na extensão.

## What Changes

- Acrescentar persistência local de tarefas e lixeira em SQLite via `node:sqlite` embarcado no Electron 44.5.1/Node 24.21.0, sem dependência externa, addon/rebuild ou fallback silencioso. A aceitação da API RC e a prova de empacotamento pertencem à TFA-002; schema, PRAGMAs e durabilidade de produto continuam sujeitos a esta revisão.
- Propor um banco próprio em `<userData>/data/taskflow.sqlite`, separado de `foundation-proof` e `sessionData`, mantendo identidade, perfis dev/test/prod e instalação per-user existentes. Schema SQL 1, codec de payload v4 e formatos de backup são versões distintas.
- Preservar todos os campos conhecidos e codecs v1–v4, com validação, operações internas atômicas sobre tarefas/lixeira e `saveMany`, colisão `ID_EXISTS` no restore, revisão global persistida e revisão de conteúdo independente de processamento de lembrete.
- Coordenar read/decide/commit no main por uma conexão e uma fila proprietárias, usando `BEGIN IMMEDIATE`, SQL parametrizado, `journal_mode=DELETE` e `synchronous=EXTRA`; definir abertura segura, migração transacional, erros e recovery sem reset, descarte ou DDL antes de identificar dados existentes.
- Expor somente `getStateSnapshot`, `subscribeState` e `unsubscribeState` para estado, além de `verifyFoundation` separado. Snapshots paginados e eventos versionados de invalidação usam revisão e sessão, sem leitura com expurgo ou exposição de repositories, SQL, paths, callbacks, comandos genéricos ou planos de undo.
- Evoluir coerentemente o catálogo, autorização e ownership de `desktop-foundation`, preservando isolamento, protocolo local, CSP, sandbox e permissões negadas. Validar remetente, main frame, origem real, URL, documento e sessão também antes de respostas/eventos tardios.
- Planejar testes P01–P12 para codecs, transações, interrupção de processo, I/O, incompatibilidade, concorrência, subscriptions, IPC negativo, limites e produto no Electron empacotado. Provas de rollback/reopen e kill de processo não equivalem a falha de energia.

O pedido humano de 2026-10-04 fecha o recorte de planejamento: criar/editar/status via IPC ficam na **TFA-004**. Esta Change fornece primitives internas e fixtures de teste, sem UI de tarefas, migração integral de `TaskService`, scheduler, importação ou comandos funcionais futuros. A aprovação destes artefatos e a autorização de apply ainda não ocorreram.

## Capabilities

### New Capabilities

- `local-task-persistence`: armazenamento de produto validado, compatibilidade, transações, revisões, claims internos, erros, coordenação e limites de execução.
- `desktop-state-ipc`: contrato mínimo de leitura/subscriptions, snapshots coerentes, eventos após commit, ressincronização, sessões e limites de transporte.

### Modified Capabilities

- `desktop-foundation`: substituir o catálogo exclusivamente diagnóstico pelo catálogo fechado de quatro operações; reforçar autorização de documento/sessão e estender ownership/encerramento ao banco de produto, mantendo o diagnóstico isolado.

## Impact

Dependências concluídas: TFA-001 e TFA-002, artefatos arquivados e specs consolidadas. Base da branch `codex/tfa-003-implementar-persistencia-local-e-fronteira-ipc`: `main c123261` (PR #2 integrado em 2026-10-04). Origem consultada somente para leitura: extensão no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`.

No apply futuro aprovado, os pontos previstos são núcleo portável/codecs/portas revisados, armazenamento e coordenação no main, contratos/preload/IPC, composição/encerramento e testes desktop. Vue/Pinia, Node/Electron, empacotamento, contrato per-user e diagnóstico existentes permanecem baseline. O delta de catálogo substitui uma restrição anterior da spec; não libera IPC genérico ou mutações remotas.

Excluídos: funcionalidades/UI das TFA-004–012, geração de recorrências, undo funcional, expurgo disparado por leitura, backup/import/export/recuperação por backup, notificações/bandeja/login, captura/atalhos, IA/credenciais, backend, sincronização, releases e instaladores. Nesta proposta não há implementação, instalação de dependências, testes de produto executados, commit ou publicação.
