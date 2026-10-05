# Proposal

## Why

O desktop conserva recorrências e subtarefas no banco, mas impede editar regras, gerar ocorrências e marcar passos. A TFA-004 já integrada fornece a interface e a autoridade transacional necessárias para habilitar esses comportamentos sem perder regras, dados ou marcações concorrentes.

## What Changes

- Preservar DAILY, WEEKLY e MONTHLY, limites, calendário local, âncora, pular/encerrar e reabertura; concluir/pular transfere a regra para no máximo uma próxima TODO no mesmo commit.
- Habilitar até 20 subtarefas ordenadas, edição de títulos, marcação independente e progresso derivado. Salvar após outras marcações conserva os valores `done` atuais; alterações estruturais concorrentes continuam conflitantes, conforme preferência humana confirmada.
- **BREAKING:** propor schema SQL 2 com revisão monotônica de edição separada da revisão completa de conteúdo; migração transacional 1→2, sem mudar codec v4 ou backup. Leitor antigo recusa schema 2 sem downgrade.
- **BREAKING:** versionar estado e mutações de tarefas em v2 e ampliar o catálogo fechado com `setSubtaskDone`; diagnóstico e abertura da origem salva conservam v1. Requisições antigas de estado/mutação são recusadas, sem compatibilidade permissiva.
- Adaptar formulário/cartões/diálogo de cancelamento e teclado existentes; main decide relógio, IDs, âncora, série, conflitos e commit. Limitar cálculo e recusar overflow, duplicidade de portadoras ou colisões sem alterar dados.
- Manter bloqueio temporário de mudanças efetivas de prazo/status e fechamento/geração com lembretes até TFA-008; permitir edição independente, retirada isolada da regra e marcações. Definir contratos de regressão com TFA-006/008, sem entregar desfazer, lixeira funcional ou notificações.

## Capabilities

### New Capabilities

- `desktop-task-recurrence`: regras, cálculo local, identidade da série, fechamento atômico, pular/encerrar, reabertura e limites seguros.
- `desktop-task-subtasks`: lista de um nível, edição ordenada, marcações atuais, progresso e interação acessível.

### Modified Capabilities

- `desktop-task-management`: habilitar controles e edição avançada autorizada, exceção de cancelamento recorrente por saída de foco, preservação de precisão e delimitação dos lembretes.
- `desktop-state-ipc`: catálogo de nove operações, DTOs v2, erros finitos, revisão de edição e confirmação convergente com snapshot.
- `desktop-foundation`: ampliar apenas a bridge autorizada mantendo isolamento e recursos futuros indisponíveis.
- `local-task-persistence`: schema 2, migração e revisões de edição/conteúdo; condições atômicas que preservam marcações e contratos internos futuros.

## Impact

Afeta domínio/drafts/status, aplicação de comandos/unidades, SQLite/preflight, contratos/preload/main, store e componentes Vue, testes portáveis e harness empacotado do app. Dependências: TFA-004 e TFA-003 arquivadas; base `64fe7adc42b7eb0f4435c02970363f7d6b060e3f`. Origem de consulta somente leitura: extensão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`; cópia futura seletiva e revisada, sem TaskService completo, adapters Chrome ou scheduler fictício.

Sem novos pacotes, tipos de recorrência, redesign, backup/importação, IA, captura, lifecycle/bandeja, distribuição ou correção automática do gate D10 herdado. Esta entrega contém apenas planejamento para revisão; mecanismos novos, schema/IPC e limites precisam de aprovação explícita antes de apply.
