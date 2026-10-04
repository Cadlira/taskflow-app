# Proposal

## Why

A TFA-003 já conserva tarefas locais e publica snapshots coerentes, mas a janela ainda oferece somente diagnóstico. A TFA-004 conecta essa fundação ao gerenciamento básico observado na extensão, preservando interface, teclado e dados sem antecipar os recursos avançados.

## What Changes

**TFA-004 — artefatos aprovados explicitamente em 2026-10-04, início em 2026-10-04.** A evidência humana está registrada no [roadmap](../../../docs/roadmap.md). O pedido atual autoriza registrar a aprovação, commit e push; a implementação depende de novo pedido de apply.

- Disponibilizar na janela principal criar/editar campos básicos, concluir/cancelar/reabrir tarefas simples, pesquisa, filtros combináveis, ordenação, prazos locais, estados e feedback acessíveis. Manter o diagnóstico acessível em área secundária.
- Reutilizar seletivamente regras, componentes Vue/CSS e testes portáveis; substituir composição Chrome e a conexão do store por uma porta desktop e snapshots versionados. Preservar identidade visual, sem Quasar, redesign ou dashboard.
- Acrescentar comandos fechados e versionados de criação, edição condicional, status e abertura de origem salva. Main valida e coordena as escritas; renderer não recebe Task livre como comando ou autoridade sobre armazenamento.
- Preservar draft em conflito/falha/resultado incerto, campos históricos não editados e dados avançados. Conservar precisão do prazo não alterado e exigir revisão se o fuso mudar durante sua edição.
- Manter o recorte conservador aprovado: exclusão/lixeira/desfazer na TFA-006; recorrentes somente leitura até TFA-005; subtarefas existentes somente leitura; prazo/status com lembretes bloqueados até TFA-008. Esses recortes e os orçamentos concretos do design foram aprovados; alteração material exige nova revisão.
- Planejar evidências G01–G20 de paridade, IPC, duas sessões, acessibilidade, volume e integração no pacote, sem executar Setup ou prometer paridade do produto completo.

## Capabilities

### New Capabilities

- `desktop-task-management`: regras básicas, consultas, prazos, interface, foco, falhas, conflito, limites temporários dos avançados e evidências de uso local.

### Modified Capabilities

- `desktop-foundation`: evoluir a janela diagnóstica para gerenciamento com diagnóstico secundário e ampliar explicitamente o catálogo fechado; manter isolamento, identidade, ownership e navegação restrita.
- `desktop-state-ipc`: acrescentar os quatro comandos, seus schemas/orçamentos/erros, autoridade no main, CAS, abertura controlada e prova da UI inscrita; conservar contratos e limites de leitura/subscriptions.

## Impact

Dependência TFA-003 arquivada e integrada pelo PR #3; fundações TFA-001/002 integradas. Branch existente `codex/tfa-004-migrar-gerenciamento-de-tarefas-e-interface`, base `d74e02df7aa38e13fd631a6a83ab2d07b96d8e42`. Origem somente leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`.

No apply futuro aprovado: regras básicas em domínio/aplicação, contratos e preload, handlers/composição main, renderer/components/store/styles, testes/harness e documentação correspondente. Persistência, schema SQL 1/codec 4, stack/runtime/lockfile e instalador existentes permanecem baseline; não se propõe nova dependência ou migração de banco. Deltas alteram as restrições anteriores de catálogo, sem consolidar as specs agora.

Excluídos: exclusão, lixeira/undo, ações de recorrência/subtarefas, backups/importação, scheduler/notificações/bandeja/login, Quick Add/captura/atalhos, IA/credenciais, rede automática, backend/conta/nuvem, segunda janela de produto, distribuição/instalação/auto-update e outras Changes. Nesta proposta só há artefatos e roadmap; apply, verificação de implementação e archive dependem de seus pedidos e aprovações próprios.
