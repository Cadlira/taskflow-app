# Spec Delta

## MODIFIED Requirements

### Requirement: Migrações e recuperação preservam origem

Migrações explicitamente suportadas SHALL validar origem e destino e confirmar dados/schema/metadados numa unidade reversível. Falha SHALL preservar o estado anterior. Schema SQL 2 SHALL acrescentar revisão de edição, migrando SQL 1 sem alterar payloads/codecs/backups. Recuperação normal do motor e reopen validado SHALL ocorrer sem apagar journal, converter versão desconhecida ou migrar a prova/extensão para o produto.

#### Scenario: Migração falha ou é interrompida
- **WHEN** migração concreta 1→2 ou registrada no harness isolado falha entre alterações ou o processo é interrompido antes do commit
- **THEN** reopen encontra o estado anterior consistente, sem schema/dados parcialmente migrados
- **AND** a fixture de migração não anuncia uma versão de produto fictícia como implantada

#### Scenario: Migração confirma e downgrade desconhece destino
- **WHEN** migração 1→2 confirma integralmente e leitor antigo não reconhece schema 2
- **THEN** leitor recusa abertura, sem downgrade ou exclusão silenciosa dos dados
- **AND** payloads/IDs/ordem/deletedAt/contentRevision permanecem iguais, editRevision inicia em contentRevision e global avança uma vez pela migração

#### Scenario: Journal de transação interrompida
- **WHEN** reopen encontra evidência de transação interrompida recuperável pelo motor
- **THEN** a recuperação do motor conserva atomicidade e o app valida antes de disponibilizar estado
- **AND** a aplicação não apaga auxiliares ou executa reset para forçar abertura

#### Scenario: Bootstrap novo e repetido
- **WHEN** perfil novo inicializa ou banco SQL2 válido reabre
- **THEN** novo perfil cria SQL2 com global0 sem itens e reopen não repete migração nem altera revisões
- **AND** metadado ausente/inválido no SQL2 bloqueia sem fabricar revisão de edição em leitura

### Requirement: Unidades de trabalho atômicas

Mutações relacionadas SHALL confirmar tarefas, lixeira e revisões numa única unidade. Read/decide/validate/commit SHALL usar estado atual sob o mesmo coordenador, inclusive saveMany, substituição, fechamento/geração e operações condicionais. Identidades/portadora e revisão esperada SHALL ser conferidas antes de escrever o plano final. Nenhum produtor interno SHALL escrever por uma fila ou conexão paralela.

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

### Requirement: Revisões persistidas distinguem conteúdo e processamento

Cada commit observável SHALL incrementar revisão global monotônica uma vez. Conteúdo de usuário SHALL ter contentRevision completa e editRevision monotônica estrutural: campos/status/regra/estrutura alteram ambas, done altera só conteúdo e claim conserva ambas. Recusa/no-op/rollback SHALL conservá-las. Revisões SHALL ter representação exata, evitar wrap/reutilização após recriação e permanecer separadas do payload/backup.

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

### Requirement: Conflitos condicionais não perdem edição

Edição/status/marcação SHALL verificar editRevision e pré-condições na unidade atual; reversão interna SHALL continuar verificando contentRevision completa de anterior/gerada. Base stale SHALL retornar conflito sem sobrescrever. Save após checks SHALL reconstruir done atual sem merge geral. Marcadores atuais de ocorrência inalterada SHALL ser preservados; integração funcional de undo/lixeira SHALL continuar na Change própria.

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
- **AND** não há token/serviço/UI de undo ou restore funcional antecipados
