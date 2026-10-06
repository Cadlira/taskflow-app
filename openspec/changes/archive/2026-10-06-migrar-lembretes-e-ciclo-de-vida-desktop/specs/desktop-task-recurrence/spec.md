# Spec Delta

## MODIFIED Requirements

### Requirement: Nova ocorrência conserva campos e renova passos

Nova ocorrência SHALL ter ID novo, mesma série, status TODO, prazo calculado, auditoria nova e campos básicos copiados. Frequência/parâmetros/until SHALL ser conservados sem âncora antiga. Subtarefas SHALL conservar títulos/ordem, recebendo IDs novos e done=false. OFFSET SHALL conservar deslocamentos com IDs novos/sem marker herdado e settlement pertinente. completedAt SHALL estar ausente.

#### Scenario: Cópia completa
- **WHEN** portadora com descrição/pessoas/tags/origem/prioridade e subtarefas marcadas gera próxima
- **THEN** a nova conserva os campos e a regra/limite, renova todos os IDs de subtarefas e desmarca todos, sem completedAt ou anchorAt herdados
- **AND** marks/status da fechada permanecem conforme a ação do usuário


### Requirement: Criação terminal no-op e reabertura não duplicam

Criação inicial em DONE/CANCELLED com regra SHALL não gerar imediatamente. Mesmo status e edição efetivamente vazia SHALL ser no-op. Edição efetiva que resulte em terminal com regra SHALL seguir fechamento e escolha pertinentes. Reabrir histórica fechada SHALL ir a TODO conservando série, sem recuperar regra ou gerar ocorrência.

#### Scenario: Terminal criada e depois editada
- **WHEN** tarefa terminal com regra é criada e depois recebe mesmo status, toggle ou edição efetiva de título
- **THEN** criação/mesmo status/toggle não geram; edição efetiva pode fechar/transferir a regra e CANCELLED exige escolha, com liquidação/agenda de lembretes pertinentes

#### Scenario: Reabrir histórica
- **WHEN** ocorrência que perdeu a regra ao fechar é reaberta após outra já existir
- **THEN** fica TODO com série histórica sem regra e não duplica a portadora atual


### Requirement: Lembretes e desfazer mantêm contratos separados

Prazo/status/fechamento-geração com lembretes SHALL seguir validação e liquidação no mesmo commit, sem guard D8. Undo SHALL restaurar anterior/remover gerada por conteúdo completo; restore/revert SHALL apenas preservar markers e liquidar vencidos de forma pura. Agenda/notifier SHALL atuar somente após confirmação; falha externa SHALL não reverter commit.

#### Scenario: Regra com OFFSET preservada
- **WHEN** tarefa com lembretes tenta DONE/SKIP/END ou alteração que fecharia/geraria
- **THEN** ação válida confirma plano atual inteiro; próxima copia OFFSET com IDs novos sem processedFor herdado e ambas recebem settlement pertinente

#### Scenario: Contrato de reversão futura
- **WHEN** fixture tenta reverter anterior e remover gerada após edição/toggle desta, ou só após claim
- **THEN** revisão completa alterada bloqueia reversão inteira e claim isolado não bloqueia, com undo remoto limitado ao token próprio e sem reavisar vencidos, com reconciliação posterior de futuros

#### Scenario: Captura real e restauração sem próxima
- **WHEN** fechamento efetivo produz anterior/gerada ou usuário restaura portadora excluída
- **THEN** before-image e referência/revisão gerada vêm do próprio plano atual; restore/undo não calcula nova ocorrência
- **AND** move conserva regra interrompendo atividade em tasks, e liquidação<=now não reavisa e futuros somente entram na agenda após confirmação

#### Scenario: Falha entre settlement fechamento e geração
- **WHEN** falha ocorre entre gravações da fechada/gerada ou reconcile/notifier falha depois de commit confirmado
- **THEN** pré-commit reverte todo plano/markers; pós-commit conserva ambas integralmente e informa indisponibilidade de efeito externo
