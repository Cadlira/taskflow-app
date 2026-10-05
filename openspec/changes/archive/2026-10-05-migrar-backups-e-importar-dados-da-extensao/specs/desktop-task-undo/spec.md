# Spec Delta

## MODIFIED Requirements

### Requirement: Encerramento e backup invalidam estado temporário

Encerramento SHALL descartar tokens próprios sem perder commits. Backup confirmado APPLIED/UNCHANGED SHALL invalidar recibos/confirmações/candidatos e ofertas visuais globais por época antes de próxima ação/publicação, sem revisão SQL fictícia. Cancelamento/rollback SHALL não invalidar outras sessões; recuperação incerta SHALL limpar estado temporário sem atestar sucesso.

#### Scenario: Encerrar durante ação e reabrir
- **WHEN** documento encerra com pedido pendente ou commit já confirmado e depois reabre
- **THEN** pedido não iniciado perde admissão, unidade ativa termina/reverte com segurança e tasks/trash confirmados sobrevivem sem recibo antigo
- **AND** minimizar/foco não executa essa limpeza; lifecycle provisório permanece sem bandeja

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

### Requirement: Oferta e resultado preservam anúncio e foco

Oferta SHALL aparecer apenas após ack confirmado, snapshot válido, contexto e época atuais, sem roubar foco. Undo SHALL anunciar fase verdadeira e conservar busy/foco pertinentes. Filtros SHALL não ser desfeitos; snapshot SHALL não reconstruir oferta perdida.

#### Scenario: Alvo visível oculto ou falha
- **WHEN** undo conclui/recusa e alvo está visível, oculto por filtro ou lista fica vazia
- **THEN** foco segue Editar ou Limpar filtros/Nova tarefa/Criar primeira tarefa conforme estado, sem cair no body
- **AND** busy impede repetição e anúncio não oferece redo nem promessa de agendamento

#### Scenario: Ack confirmado e snapshot falha
- **WHEN** ack de ação confirma mas ressync não conclui, ou resposta antiga chega em contexto novo
- **THEN** UI informa gravação confirmada/atualização pendente ou descarta oferta antiga, sem upsert, replay ou anúncio falso de rollback
- **AND** snapshot sozinho não cria oferta ou transfere recibo entre documentos

#### Scenario: Ack com época anterior ou maior
- **WHEN** resposta elegível chega depois de backup ou antes do snapshot da sua época
- **THEN** época anterior nunca reinstala oferta; época maior exige reconciliação e só oferta no contexto atual com snapshot>=ack
- **AND** invalidação não apaga oferta nova por evento antigo e não altera filtros/draft arbitrariamente

