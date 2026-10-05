# Spec Delta

## MODIFIED Requirements

### Requirement: Unidades de trabalho atômicas

Mutações relacionadas SHALL confirmar tarefas/lixeira/revisões em read/decide/validate/commit atual. Move/restore/reversão e backup SHALL conferir base/plano final antes de escrever; backup SHALL substituir somente tasks por CAS global e verificar conteúdo. Nenhum produtor SHALL usar conexão/fila paralela ou confirmar recusa após escrita parcial sem rollback.

#### Scenario: SaveMany interrompido entre registros
- **WHEN** falha ocorre entre gravações de saveMany, fechada/gerada ou substituição interna validada
- **THEN** todas as alterações são revertidas, com estado e revisão anteriores
- **AND** não se divide a operação em commits para contornar limites de execução

#### Scenario: Move e restore atômicos
- **WHEN** uma tarefa é movida/restaurada e há falha entre remover da origem e inserir no destino
- **THEN** ambas as coleções mantêm o estado anterior inteiro, sem perda ou duplicação parcial

#### Scenario: Produtores compartilham decisão
- **WHEN** dois produtores internos têm operações sobrepostas coordenadas por barreiras determinísticas
- **THEN** cada decisão usa o estado atual de sua unidade e nenhum resultado stale sobrescreve o commit anterior
- **AND** fechamento concorrente confirma somente uma transferência de regra/geração

#### Scenario: Retenção limite e reversão integrais
- **WHEN** move elimina vencidos/colaterais ou undo restaura anterior e remove gerada e falha entre efeitos
- **THEN** rollback/reopen encontra somente anterior ou novo estado inteiro e uma revisão global coerente
- **AND** falha depois de começar a aplicar plano reverte a unidade, sem confirmar recusa com alterações parciais

#### Scenario: Backup substitui tasks e verifica antes de commit
- **WHEN** arquivo válido e base global atual são confirmados, inclusive tasks:[]
- **THEN** tasks finais e revisão são confirmadas numa unidade e trash permanece integral, sem mandar removidas à lixeira
- **AND** mismatch pré-commit ou falha entre registros reverte tudo; operação não é dividida em commits

### Requirement: Revisões persistidas distinguem conteúdo e processamento

Cada commit observável SHALL avançar global uma vez. Campos/status/regra/estrutura SHALL alterar content/edit, done só content e claim nenhuma delas. Move/restore/revert e linhas novas/alteradas por backup SHALL receber revisões locais coerentes. Idênticas/no-op/recusa/rollback SHALL conservar revisões; epoch transitória SHALL não ser revisão SQL ou metadata no backup.

#### Scenario: Revisão sobrevive a reopen
- **WHEN** alterações são confirmadas e banco reabre
- **THEN** global/content/edit conservam os valores persistidos e não dependem de timestamp
- **AND** metadados satisfazem 1 <= edit <= content <= global para cada registro

#### Scenario: No-op e ABA
- **WHEN** unidade não altera conteúdo, ID é removido/recriado/restaurado ou estrutura muda A→B→A
- **THEN** no-op não incrementa revisão/eventa; recriação/restauração e mudança estrutural recebem edit/content novas e bases antigas não autorizam escrita

#### Scenario: Limite de representação
- **WHEN** revisões ultrapassam precisão inteira JS ou alcançam limite persistível
- **THEN** transporte mantém valor exato e novas escritas/migração impossíveis falham com código seguro, sem wrap/reset

#### Scenario: Check e claim distintos
- **WHEN** há alteração efetiva de done ou processamento interno de lembrete
- **THEN** done modifica updatedAt/conteúdo completo mas conserva edit; claim conserva updatedAt/conteúdo/edit, com global alterada em ambos

#### Scenario: Move cria identidade nova sem mudar Task
- **WHEN** tarefa vai à lixeira, inclusive substituindo linha homônima com metadata antiga igual
- **THEN** nova entrada recebe contentRevision=editRevision da revisão global do commit e payload/timestamps conhecidos são preservados
- **AND** SQL2/codec4 permanecem, linhas sobreviventes não são regravadas e referência antiga não autoriza substituição com deletedAt igual

#### Scenario: Backup efetivo ou idêntico
- **WHEN** substituição insere/altera/remove ou mantém tasks idênticas
- **THEN** novas/alteradas recebem content/edit=g, sobreviventes idênticas mantêm metadata e global só avança na alteração
- **AND** UNCHANGED invalida somente estado temporário sem inventar revisão/evento de alteração; timestamps do arquivo permanecem

### Requirement: Conflitos condicionais não perdem edição

Edição/status/check SHALL verificar editRevision e marks atuais; exclusão/undo SHALL verificar conteúdo/entrada/plano final. Backup SHALL verificar base global exata e portadoras em tasks importadas+trash. Recusas SHALL conservar dados; global SHALL não substituir conteúdo completo para undo, e timestamp SHALL não substituir revisão.

#### Scenario: Duas edições da mesma base
- **WHEN** dois produtores tentam alterar estrutura/campos/status da mesma tarefa com editRevision esperada igual
- **THEN** somente primeira alteração aplicável confirma; segunda recebe conflito com dados/revisões preservados

#### Scenario: Tarefas distintas
- **WHEN** produtores alteram tarefas distintas com suas revisões atuais
- **THEN** ambos podem confirmar sequencialmente sem falso conflito baseado apenas na revisão global

#### Scenario: Save depois de marcação
- **WHEN** done mudou sem mudança estrutural desde abertura do formulário
- **THEN** save ainda autorizado conserva done atual por ID, enquanto a revisão completa anterior não autoriza reversão futura

#### Scenario: Gerada alterada ou só processada
- **WHEN** reversão interna verificável remove gerada que sofreu edição/check ou só claim
- **THEN** edição/check bloqueia toda reversão, claim isolado não bloqueia e reversão válida mantém portadora única e novas revisões
- **AND** undo/restore funcionais usam recibos próprios, sem estado anterior ou plano livre do renderer

#### Scenario: Check ABA e claim em undo real
- **WHEN** alvo/gerada muda conteúdo ou check A→B→A com timestamp igual, ou apenas claim ocorre
- **THEN** conteúdo/check bloqueia reversão inteira, claim isolado conserva aplicabilidade/marker e reversão recebe updatedAt e revisões novas

#### Scenario: Base de backup mudou em qualquer coleção
- **WHEN** tasks/trash/claim altera revisão global depois da prévia, mesmo com counts iguais
- **THEN** BACKUP_BASE_CHANGED recusa integralmente e exige nova prévia, sem elevar base/consentimento
- **AND** essa condição global própria do backup não altera CAS por tarefa de edições independentes

### Requirement: Falhas e efeitos externos respeitam commit

Sucesso/evento durável SHALL exigir commit confirmado. Conclusão de backup SHALL verificar estado confirmado e aplicar barreira transitória antes da próxima unidade/publicação. Falha incerta SHALL bloquear conexão até reopen; falha pós-commit SHALL exigir reconciliação sem replay/rollback falso.

#### Scenario: I/O ou commit falha
- **WHEN** abertura, escrita, flush, commit, permissão ou disco cheio causa falha
- **THEN** não se anuncia sucesso/evento de alteração sem commit e o erro não revela stack, cause, paths, SQL ou payload
- **AND** resultado incerto impede novas unidades até reopen validado

#### Scenario: Fila recuperável
- **WHEN** uma unidade falha com rollback confirmado e a causa transitória desaparece
- **THEN** a próxima unidade válida pode executar, sem fila permanentemente rejeitada ou reset dos dados

#### Scenario: Resposta perdida
- **WHEN** commit confirma e o processo/transporte interrompe antes de responder
- **THEN** o novo snapshot mostra o commit integral e o cliente ressincroniza sem replay automático de escrita

#### Scenario: Conferência pós-commit e próxima ação
- **WHEN** commit de backup confirma e releitura/publicação/resposta posterior falha ou outro produtor está enfileirado
- **THEN** commit permanece; barreira e contenção ocorrem antes do próximo produtor, e resultado distingue verificação PENDING de rollback
- **AND** releitura não sofre interleaving que compare expectativa com edição posterior legítima

#### Scenario: Resultado incerto recupera sem replay
- **WHEN** COMMIT/rollback é incerto e banco reabre validado
- **THEN** reopen encontra antigo/novo integral e barreira conservadora limpa estado temporário sem declarar sucesso da importação
- **AND** token não é reconstruído/repetido e schema/corrupção bloqueado não é contornado substituindo SQLite

