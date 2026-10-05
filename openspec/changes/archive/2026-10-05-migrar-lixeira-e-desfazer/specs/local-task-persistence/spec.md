# Spec Delta

## MODIFIED Requirements

### Requirement: Unidades de trabalho atômicas

Mutações relacionadas SHALL confirmar tarefas, lixeira e revisões numa unidade atual de read/decide/validate/commit. Move com retenção/limite, restore e reversão anterior/gerada SHALL conferir condições e plano final antes de escrever. Nenhum produtor SHALL usar conexão/fila paralela; recusa SHALL não ocorrer após escrita parcial sem rollback.

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

### Requirement: Colisão no restore preserva as coleções

IDs SHALL permanecer únicos por coleção, permitindo homônimos entre tasks/trash. Restore SHALL conferir entrada/idade e preparação interna validada antes de escrever e retornar ID_EXISTS se ID está ativo. Recusa SHALL preservar coleções/revisões; sucesso SHALL dar novas revisões sem geração.

#### Scenario: Colisão preservada
- **WHEN** o ID da entrada de lixeira já existe em tarefas
- **THEN** restore retorna `ID_EXISTS` e ambos os payloads/metadados permanecem integralmente iguais

#### Scenario: Ausência ou preparação inválida
- **WHEN** o item não está na lixeira ou a preparação interna produz dados inválidos
- **THEN** a unidade retorna ausência ou erro seguro e não altera tarefas, lixeira ou revisão

#### Scenario: Entrada vencida ou substituída
- **WHEN** restore/undo encontra referência antiga ou retenção excedida sem abertura prévia da área
- **THEN** ENTRY_CHANGED/ENTRY_EXPIRED não restaura, expurga ou altera metadados; limpeza depende de unidade explícita distinta

### Requirement: Revisões persistidas distinguem conteúdo e processamento

Cada commit observável SHALL avançar global uma vez. Campos/status/regra/estrutura SHALL alterar content/edit, done só content e claim nenhuma delas. Novo move SHALL criar identidade de entrada com content/edit novas, preservando payload/timestamps; restore/revert SHALL receber revisões novas. Recusa/no-op/rollback SHALL conservar revisões exatas, sem wrap/ABA ou metadata no payload/backup.

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

### Requirement: Conflitos condicionais não perdem edição

Edição/status/marcação SHALL verificar editRevision atual e conservar done relido. Exclusão confirmada e reversão SHALL verificar conteúdo completo; entrada de trash SHALL conferir identidade. Recusas SHALL preservar dados; reversão SHALL validar portadora final e markers atuais. Timestamp/global/edit SHALL não substituir conteúdo completo para undo.

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

### Requirement: Leituras são livres de mutações de manutenção

List/get/snapshot SHALL representar dados validados sem expurgar lixeira, regravar codecs ou atualizar revisões. Expurgo SHALL ocorrer somente em unidade explícita de startup/entrada/move; filtro temporal da apresentação SHALL não gravar. No-op/recusa SHALL não publicar alteração.

#### Scenario: Lixeira antiga é lida
- **WHEN** uma leitura inclui entradas antigas ou coleção acima do limite futuro de retenção
- **THEN** a leitura não remove itens, não modifica revisões e não emite evento de alteração

#### Scenario: Manutenção própria e leitura concorrente
- **WHEN** startup/entrada/move expurga vencidos e outro documento lê snapshot
- **THEN** leitor vê uma revisão inteira antiga/nova; somente manutenção efetiva cria commit/evento e falha não é apresentada como vazio
