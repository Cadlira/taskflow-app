# Proposal

## Why

O app já conserva tarefas, recorrências, subtarefas e lixeira, mas ainda não oferece um percurso para transportar tarefas da extensão ou gerar backups pelo desktop. A TFA-006 integrada permite acrescentar importação e exportação sem perder campos, substituir dados a partir de uma prévia antiga ou manter um desfazer anterior à restauração.

## What Changes

- Importar arquivos `taskflow-backup` v1–v4 com migrações ordenadas, validação integral e prévia que distingue versão original de normalizada. Exportar v4 de todas as tarefas, independentemente dos filtros.
- Propor limite simétrico de **20 MiB em bytes UTF-8**, inclusive o limite, leitura limitada e gravação por temporário/flush/substituição controlada. Arquivo excessivo ou dado histórico incompatível com o formato recusa a operação inteira, conservando dados, sem corte ou conversão silenciosa.
- Escolher/salvar por diálogos nativos vinculados à janela, com I/O no main e comandos finitos; renderer recebe somente resumo/token/resultado, sem paths ou JSON do arquivo.
- Preparar cópia imutável no main, própria da sessão/contexto, com revisão global, expiração e recursos limitados. Confirmar substituição total somente sobre a base apresentada; mudanças em tasks ou trash exigem nova prévia/confirmação.
- Substituir somente tarefas em uma unidade coordenada, preservando lixeira/configurações e timestamps/IDs. Validar portadora única no estado final e conferir todos os campos por ID, incluindo recurrence/seriesId e subtarefas completas/ordenadas. Removidas não vão à lixeira; importação não oferece undo.
- Liquidar somente lembretes vencidos `<= now`, sem agendamento ou geração. Distinguir rollback, commit confirmado porém não verificado e resultado incerto; ressincronizar sem replay ou reversão automática.
- Integrar invalidação global interna e visual do desfazer após sucesso APPLIED e UNCHANGED. Cercar respostas antigas com época explícita, sem inventar revisão SQL para o no-op.
- **BREAKING:** estado/snapshot/inscrição/eventos passam a v3 com `undoEpoch`; update/status passam a v4 e moveTaskToTrash a v2 para associar ofertas à época. Create/check continuam v3, demais wrappers existentes preservam versões. Quatro wrappers de backup v1 completam o catálogo de **21**; versões anteriores dos contratos alterados são recusadas.
- Preservar identidade, teclado/foco/feedback; documentar migração manual extensão → JSON → prévia → confirmação → conferência. Verificar B01–B14 com fixtures revisadas e provas de I/O/bridge no produto fictício empacotado.

## Capabilities

### New Capabilities

- `desktop-task-backup`: formato, arquivos nativos, prévia condicionada, substituição/verificação, falhas, recursos e migração manual de tarefas.

### Modified Capabilities

- `desktop-foundation`: catálogo21 e cleanup de operações/preparações, mantendo isolamento e ownership.
- `desktop-state-ipc`: contratos de backup, estado v3, épocas/ofertas, guardas, budgets e recuperação de eventos perdidos.
- `desktop-task-management`: área de backup e foco/feedback, sem montar os recursos posteriores.
- `local-task-persistence`: substituição integral por base global, verificação e conclusão serializada, mantendo SQL2/codec4.
- `desktop-task-undo`: integração funcional/visual do backup e proteção contra ofertas tardias.
- `desktop-task-recurrence`: validação da portadora no plano de importação e distinção da validação histórica do backup, sem geração ou alteração de âncoras.

## Impact

Aplicação/domínio portáveis, adapters de arquivos no main, contratos/preload/IPC, coordenador, UndoRegistry, store/componentes Vue, testes/harness e documentação operacional/paridade. Base `9e8a05a2d84874f25d9f429ecc120e81c7ec0acc` (PR #6), branch `codex/tfa-007-migrar-backups-e-importar-dados-da-extensao`. Extensão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4` somente leitura; reutilização futura seletiva revisada.

Sem dependências novas, SQL/codec/formato novos, mesclagem, extração do Chrome, importação SQLite, recuperação de banco inacessível por reset, lixeira/credenciais/configuração de IA/desfazer no arquivo, histórico persistente, criptografia nova, scheduler/notificações/bandeja/captura/IA/redesign, Setup, release ou publicação. Backup contém dados pessoais das próprias tarefas e não é criptografado. D10, acessibilidade humana e campanha de before-images extremas permanecem pendentes.

Esta entrega é planejamento para revisão, sem aprovação implícita ou apply.

