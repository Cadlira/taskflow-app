# Spec Delta

## MODIFIED Requirements

### Requirement: Portadora e identidades têm proteção contra duplicação

Cada série SHALL ter no máximo uma portadora com regra em tasks+trash, qualquer status; históricas sem regra SHALL poder estar ativas. Duplicidade histórica SHALL conservar leitura/dados e recusar decisão afetada. Restore/revert SHALL validar plano final removendo corretamente gerada/entrada de origem; colisão gerada SHALL não sobrescrever e tentativas SHALL ser limitadas.

#### Scenario: Duplicidade histórica
- **WHEN** duas portadoras da mesma série existem, inclusive uma na lixeira, e o usuário tenta fechar ou mudar regra/prazo
- **THEN** recebe SERIES_CONFLICT sem reparação/reset/encerramento silencioso; leitura e edição independente/marcação continuam possíveis

#### Scenario: Colisão de tarefa série e itens
- **WHEN** gerador retorna ID de tarefa/lixeira, série existente ou ID local antigo/duplicado na lista nova
- **THEN** até três tentativas por identidade podem buscar valor livre e falha final retorna IDENTITY_CONFLICT sem commit parcial

#### Scenario: Restaurar ou reverter portadora
- **WHEN** restore/undo reintroduz regra, removendo sua entrada de trash ou eventual gerada no mesmo plano
- **THEN** checagem considera coleções distintas e estado final, sem contar registro que será removido nem ignorar homônimo indevido
- **AND** outra portadora conflitante recebe SERIES_CONFLICT sem restauração parcial, geração nova ou reparação automática

### Requirement: Lembretes e desfazer mantêm contratos separados

Prazo/status/fechamento-geração com lembretes SHALL permanecer guardados até integração própria. Undo SHALL restaurar anterior/remover gerada por conteúdo completo; restore/revert SHALL apenas preservar markers e liquidar vencidos de forma pura. Scheduler/notifier SHALL permanecer indisponíveis, e falha externa futura SHALL não reverter commit.

#### Scenario: Regra com OFFSET preservada
- **WHEN** tarefa com lembretes tenta DONE/SKIP/END ou alteração que fecharia/geraria
- **THEN** ADVANCED_TASK_RESTRICTED conserva regra/dados/marcadores; helpers puros de próxima copiam OFFSET com IDs novos sem processedFor

#### Scenario: Contrato de reversão futura
- **WHEN** fixture tenta reverter anterior e remover gerada após edição/toggle desta, ou só após claim
- **THEN** revisão completa alterada bloqueia reversão inteira e claim isolado não bloqueia, com undo remoto limitado ao token próprio e sem disponibilizar scheduler/notificação

#### Scenario: Captura real e restauração sem próxima
- **WHEN** fechamento efetivo produz anterior/gerada ou usuário restaura portadora excluída
- **THEN** before-image e referência/revisão gerada vêm do próprio plano atual; restore/undo não calcula nova ocorrência
- **AND** move conserva regra interrompendo atividade em tasks, e liquidação<=now não anuncia alarmes agendados
