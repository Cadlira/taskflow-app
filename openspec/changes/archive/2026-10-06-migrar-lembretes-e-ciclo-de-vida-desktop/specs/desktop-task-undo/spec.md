# Spec Delta

## MODIFIED Requirements

### Requirement: Restore e revert liquidam somente ocorrências vencidas

Restore/revert SHALL preservar processedFor atual de ocorrência inalterada e liquidar gatilhos pendentes representáveis <=now, sem aviso retroativo. Futuros SHALL permanecer pendentes. Agenda real SHALL ser reconciliada somente depois de sucesso; restore/revert SHALL não usar graça para reavisar vencidos nem gerar outra tarefa.

#### Scenario: Igualdade AT OFFSET e markers atuais
- **WHEN** restore/revert inclui AT/OFFSET vencido/exato/futuro e claim de mesma ocorrência confirmado após a ação
- **THEN** vencidos/exatos recebem marker do gatilho, futuro permanece pendente e claim atual não é apagado
- **AND** restore conserva updatedAt, revert o renova e nenhum aviso retroativo é emitido; futuros são reconciliados sobre estado confirmado sem promessa de entrega visual

#### Scenario: Terminal sem prazo e gatilho extremo
- **WHEN** tarefa é terminal, não tem dueAt ou possui gatilho histórico não representável
- **THEN** terminal segue liquidação pura sem guarda de status ativo, ausência de prazo conserva reminders e gatilho impossível não recebe marker inventado
- **AND** nenhum marker é inventado para gatilho impossível e falha externa de agenda não reverte a restauração


### Requirement: Encerramento e backup invalidam estado temporário

Encerramento SHALL descartar tokens próprios sem perder commits. Backup confirmado APPLIED/UNCHANGED SHALL invalidar recibos/confirmações/candidatos e ofertas visuais globais por época antes de próxima ação/publicação, sem revisão SQL fictícia. Cancelamento/rollback SHALL não invalidar outras sessões; recuperação incerta SHALL limpar estado temporário sem atestar sucesso.

#### Scenario: Encerrar durante ação e reabrir
- **WHEN** documento encerra com pedido pendente ou commit já confirmado e depois reabre
- **THEN** pedido não iniciado perde admissão, unidade ativa termina/reverte com segurança e tasks/trash confirmados sobrevivem sem recibo antigo
- **AND** minimizar/foco não executa essa limpeza; close para bandeja invalida a sessão/oferta e conserva só draft/filtros em memória

#### Scenario: Porta futura de backup e candidato tardio
- **WHEN** usuário confirma backup APPLIED/UNCHANGED ou cancela/falha com rollback
- **THEN** sucesso invalida ofertas internas/visuais e candidato/ack de época antiga não publica; cancel/falha não invalida outras sessões
- **AND** trash permanece, backup não oferece undo e arquivo não contém histórico/credenciais/lixeira

#### Scenario: UNCHANGED sem evento SQL
- **WHEN** backup idêntico confirma sem incrementar globalRevision
- **THEN** época aumenta, todas as ofertas somem e evento/ressync da mesma inscrição transporta invalidação
- **AND** evento perdido é recuperado no foco/em até30s mesmo com revisão SQL igual

#### Scenario: Preparação expira e commit incerto
- **WHEN** prévia de backup expira em5min ou armazenamento exige recuperação incerta
- **THEN** expiração não expira oferta temporal de undo alheia; recuperação aplica barreira conservadora depois de reopen
- **AND** rollback confirmado e mero cancelamento não são sucesso nem barreira global
