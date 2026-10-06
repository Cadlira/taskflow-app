# Spec Delta

## MODIFIED Requirements

### Requirement: Claim de ocorrência é condicional e interno

Claim SHALL revalidar status, tarefa, reminder, instante exato e clock atual, persistindo processedFor antes de efeito. Futuro SHALL não ser consumido pela agenda; expirado SHALL consumir sem aviso. Somente confirmação confiável dentro da graça SHALL autorizar tentativa externa fora da transação, sem mutação intercalada até solicitação. Claim inaplicável SHALL ser no-op. Claim válido SHALL alterar revisão global sem mudar revisão de conteúdo ou `updatedAt`.

#### Scenario: Claim duplicado
- **WHEN** dois produtores tentam claim da mesma ocorrência por barreiras determinísticas
- **THEN** apenas um confirma processamento, e o outro retorna inaplicável sem segunda alteração/evento

#### Scenario: Edição e claim competem
- **WHEN** claim compete com mudança de prazo/status/reminder, remoção da tarefa ou edição de outro campo
- **THEN** claim antigo fica inaplicável quando suas pré-condições mudam, e edição de ocorrência inalterada conserva o marcador atual
- **AND** não se perde outro campo nem se invalida conteúdo apenas pelo processamento

#### Scenario: Claim confirmado antes de efeito
- **WHEN** o processo interrompe depois de confirmar claim e antes de um efeito externo fictício
- **THEN** reopen conserva processedFor e não autoriza segundo claim da mesma ocorrência
- **AND** a evidência não promete entrega de notificação Windows ou exactly-once

#### Scenario: Execução tardia e fronteira externa
- **WHEN** candidato espera fila ou concorre com outra mutação antes de claim/submissão
- **THEN** relógio/estado atual determinam elegibilidade e nenhuma outra unidade modifica o candidato entre consumo confirmado e solicitação externa
- **AND** callbacks de manutenção permanecem sem efeitos externos; falha da submissão não reverte commit nem muda conteúdo/edição

#### Scenario: Incerto e consumo interno sem aviso
- **WHEN** COMMIT/rollback não é confiável ou ocorrência já excedeu graça/é terminal vencida
- **THEN** incerto bloqueia efeito até reopen; vencida inapta à entrega recebe somente liquidação interna com global pertinente e content/edit/updatedAt conservados
- **AND** todos os produtores compartilham único escritor e espera/queue continuam limitadas
