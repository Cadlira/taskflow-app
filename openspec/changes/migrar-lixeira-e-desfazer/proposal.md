# Proposal

## Why

O desktop já conserva tarefas e lixeira e coordena mutações, mas ainda não permite excluir, recuperar ou desfazer pela interface. A TFA-005 integrada permite migrar essas ações com proteção contra concorrência, preservando séries e dados confirmados sem transportar a autoridade do desfazer para o renderer.

## What Changes

- Habilitar exclusão recuperável, área da lixeira, restauração, exclusão definitiva e esvaziamento confirmado. Preservar retenção de 30×24 h, até 100 entradas e ordem por exclusão; explicitar empates, relógio recuado e descartes irreversíveis.
- Coordenar retenção/limite/move num commit; conferir idade em todo restore e undo de exclusão. Expurgar explicitamente no startup, entrada da área e exclusão; snapshots continuam puros.
- Proteger confirmação por revisão completa/identidade da entrada. Por escolha humana nesta conversa, mudança na composição da lixeira invalida o esvaziamento confirmado; edição de tarefa independente não o invalida.
- Oferecer uma última edição/status/exclusão efetiva por documento, sem prazo e somente em memória no main. Capturar o estado anterior real na unidade, publicar recibo após commit e consumir token opaco uma vez; ações/áreas e encerramento limpam a oferta.
- Reverter anterior e remover ocorrência gerada no mesmo commit por contentRevision completa; check/edição/ABA impedem reversão, claim isolado não. Conferir portadora única no plano final em tarefas+lixeira e nunca gerar ao restaurar.
- **BREAKING:** versionar as quatro mutações de tarefas em v3 para contexto ordenado e resultado explícito APPLIED/UNCHANGED com oferta opcional. Estado permanece v2; diagnóstico/origem v1. Acrescentar oito wrappers fechados de lixeira/contexto/undo, sem Task/UndoPlan livre.
- Dar revisão nova à entrada em cada move, reutilizando metadados SQL 2 para impedir ABA; conservar payload, codec 4 e timestamps da tarefa. Adicionar somente liquidação pura de lembretes vencidos em restore/revert e contrato interno de invalidação global após futuro backup bem-sucedido.
- Preservar confirmações, avisos de série, teclado, feedback e foco; validar duas sessões, falhas/kill/reopen, IPC e recursos no pacote fictício, mantendo D10 herdado e prova humana separados.

## Capabilities

### New Capabilities

- `desktop-task-trash`: política, ações condicionais, manutenção explícita, apresentação e confirmações da lixeira.
- `desktop-task-undo`: recibos temporários próprios, ciclo de oferta, reversão integral e integração delimitada de lembretes/backup.

### Modified Capabilities

- `desktop-foundation`: catálogo autorizado e cleanup de recibos, sem ampliar privilégios.
- `desktop-state-ipc`: versões, intenções, tokens/contextos, acks, erros, orçamento e projeção autoritativa.
- `desktop-task-management`: controles de excluir/lixeira/desfazer e foco/feedback sem expor recursos futuros.
- `local-task-persistence`: condições completas, identidade de move, restore e manutenção explícita dentro da unidade.
- `desktop-task-recurrence`: capturar reversão de fechamento e validar portadora no plano final da restauração.

## Impact

Domínio/aplicação, primitivas internas, contratos/preload/main, store e componentes Vue, testes desktop e harness existentes. Base `ab3ed688f025064c16ce155ff5220fe62f9dbc59` (PR #5); dependências TFA-003/004/005 arquivadas. Origem `taskflow-extension@a763e7a0d646c664ecd4f979528bc2c3589fa8c4` somente leitura; futura reutilização seletiva revisada, sem serviço Chrome completo.

Sem SQL 3, codec/backup novo, dependências, histórico persistente/pilha/redo, undo de criação/check/restore/expurgo/definitiva, backup funcional, scheduler/notificações/bandeja, captura/IA, novas janelas de produto, redesign, Setup ou distribuição. Esta entrega é planejamento para revisão; apply depende de aprovação explícita dos artefatos e novo pedido.
