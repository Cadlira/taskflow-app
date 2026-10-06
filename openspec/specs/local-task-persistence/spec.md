# local-task-persistence Specification

## Purpose
Conservar tarefas e lixeira no perfil local com dados validados, commits duráveis e coordenação de concorrência, fornecendo uma base verificável para os futuros casos de uso desktop.

## Requirements

### Requirement: Banco de produto separado e identificado

O armazenamento SHALL usar dados próprios do perfil autorizado, separados da instalação, extensão, diagnóstico e sessão. Identidade do produto, versão do schema e revisão persistida SHALL ser verificáveis sem confundir schema do banco, versão do payload e formato de backup.

#### Scenario: Produto e diagnóstico independentes
- **WHEN** dados fictícios de tarefas/lixeira são confirmados e o diagnóstico é executado
- **THEN** o diagnóstico não modifica o banco de produto e tarefas/lixeira não modificam o marcador da prova
- **AND** reopen conserva cada estado no seu destino independente

#### Scenario: Perfis separados
- **WHEN** dev, test e prod são exercitados com marcadores fictícios distintos
- **THEN** o armazenamento de um perfil não lê nem altera os demais, a extensão ou o diretório do executável

### Requirement: Fidelidade integral dos campos conhecidos

O armazenamento SHALL preservar todos os campos conhecidos, identidades e ordens do modelo validado em tarefas e lixeira, inclusive recorrências, subtarefas e marcadores de lembretes. Metadados de persistência SHALL permanecer separados do conteúdo do domínio.

#### Scenario: Round-trip completo
- **WHEN** tarefas/lixeira válidas são gravadas, a conexão fecha e o app reabre
- **THEN** id, title, description, requester, assignee, status, priority, dueAt, reminders AT/OFFSET e processedFor, seriesId, recurrence, subtarefas ordenadas, tags, sourceUrl, createdAt, updatedAt, completedAt e deletedAt da lixeira conservam os valores conhecidos
- **AND** campos opcionais ausentes e Unicode são preservados conforme o codec verificado

#### Scenario: Dados avançados sem funcionalidade antecipada
- **WHEN** um payload contém série, recorrência, subtarefas e lembretes válidos
- **THEN** o round-trip preserva seus dados sem gerar ocorrência, executar undo, importar arquivo ou emitir notificação

### Requirement: Compatibilidade e validação de codecs

O armazenamento SHALL reconhecer payloads v1–v4 e validar entrada, saída e metadados. Novas gravações SHALL usar o codec atual. Dados inválidos, versões desconhecidas e IDs inconsistentes SHALL impedir aparente sucesso, sem omissão de registros ou rewrite disparado por leitura.

#### Scenario: Versões históricas reconhecidas
- **WHEN** fixtures v1, v2, v3 e v4 de tarefas/lixeira são decodificadas
- **THEN** produzem o modelo atual com as transformações conhecidas de lembretes, tipos, recorrência/série e subtarefas
- **AND** a leitura não regrava o banco nem promete preservar propriedades desconhecidas descartadas pelo codec da origem

#### Scenario: Payload inválido
- **WHEN** há JSON inválido, IDs repetidos na mesma coleção, ID/metadados discordantes, enum/data/reminder/recorrência/subtarefa inválidos ou versão futura
- **THEN** o acesso falha com razão segura de incompatibilidade e bloqueia escritas, sem descartar a linha ou devolver coleção vazia

### Requirement: Abertura distingue ausência de incompatibilidade

Somente ausência real de banco em perfil autorizado SHALL permitir inicialização. Arquivo existente vazio, estranho ou incompatível SHALL ser preservado e bloquear abertura sem reset, DDL prematuro ou descarte. Corrupção estrutural SHALL ser identificada por erro seguro distinto de estado vazio.

#### Scenario: Perfil novo
- **WHEN** o arquivo de produto nunca existe no destino autorizado e a inicialização termina
- **THEN** schema, assinatura, metadados e revisão inicial são confirmados como uma unidade antes de publicar estado vazio válido

#### Scenario: Arquivo existente vazio ou estranho
- **WHEN** o destino é arquivo de zero bytes, SQLite de outro produto ou schema sem assinatura válida, inclusive após criação interrompida
- **THEN** a abertura retorna incompatibilidade, conserva os arquivos e não tenta completar schema, remover arquivo ou inicializar como perfil novo

#### Scenario: Corrupção ou versão futura
- **WHEN** banco truncado, integridade estrutural inválida ou versão de schema/payload futura é encontrada
- **THEN** o app bloqueia o estado de produto com código seguro de corrupção ou incompatibilidade
- **AND** não altera schema/dados da aplicação nem oferece reset automático

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

### Requirement: Leituras são livres de mutações de manutenção

List/get/snapshot SHALL representar dados validados sem expurgar lixeira, regravar codecs ou atualizar revisões. Expurgo SHALL ocorrer somente em unidade explícita de startup/entrada/move; filtro temporal da apresentação SHALL não gravar. No-op/recusa SHALL não publicar alteração.

#### Scenario: Lixeira antiga é lida
- **WHEN** uma leitura inclui entradas antigas ou coleção acima do limite futuro de retenção
- **THEN** a leitura não remove itens, não modifica revisões e não emite evento de alteração

#### Scenario: Manutenção própria e leitura concorrente
- **WHEN** startup/entrada/move expurga vencidos e outro documento lê snapshot
- **THEN** leitor vê uma revisão inteira antiga/nova; somente manutenção efetiva cria commit/evento e falha não é apresentada como vazio

### Requirement: Espera e recursos são limitados sem perda de dados

A coordenação SHALL limitar admissão, espera de fila e lock e medir bloqueio síncrono. Excedente SHALL produzir erro seguro antes de efeito. Limites de transporte/desempenho SHALL preservar dados legítimos e atomicidade, sem truncar coleções, descartar registros ou anunciar timeout capaz de interromper commit síncrono.

#### Scenario: Lock e fila excedidos
- **WHEN** outra conexão mantém lock, a fila excede 64 entradas/8 por sessão ou uma entrada espera mais de 2 s antes de iniciar
- **THEN** há recusa segura e espera de lock limitada a 100 ms, sem loop/retry infinito ou transação parcial

#### Scenario: Dados maiores que página ou dataset
- **WHEN** um registro excede a página ou a coleção excede os volumes do benchmark
- **THEN** os dados persistidos não são cortados; leitura usa continuação ou falha explícita de recurso conservando estado, sem sucesso parcial

#### Scenario: Gate de execução síncrona
- **WHEN** benchmarks de 1.000/10.000 tarefas, 100 entradas de lixeira e pelo menos 20 MiB são executados no runtime de referência
- **THEN** são registrados bytes, hardware, p95/maior bloqueio e heartbeat, com alvo p95 de 100 ms por página/mutação e preflight de 5 s
- **AND** saveMany de 10.000 itens mantém atomicidade; falha de orçamento exige revisão da abordagem, não worker silencioso ou divisão de commits

### Requirement: Evidência de durabilidade usa produto e runtime reais

A validação SHALL exercitar banco de produto no Electron empacotado com perfil fictício e registrar runtime, motor e configuração efetiva. Interrupção de processo, fault injection e falha de energia SHALL ser evidências distintas; rollback/reopen do diagnóstico SHALL ser insuficiente para declarar durabilidade de produto.

#### Scenario: Processo de teste interrompido
- **WHEN** processo proprietário exclusivamente de teste é encerrado em barreiras antes/durante transação, antes/depois de COMMIT e antes de resposta/evento
- **THEN** reopen encontra estado anterior ou novo completo com revisão coerente; depois de commit confirmado encontra o novo estado
- **AND** nenhum processo/dado real é atingido e kill não é registrado como prova de energia

#### Scenario: Produto no pacote
- **WHEN** harness executa persistência e bridge no Electron empacotado sem Node/npm externos ou instalador
- **THEN** round-trip/reopen/erros/ownership são comprovados no produto, com versões Electron/Node/SQLite e PRAGMAs efetivos registrados
- **AND** configuração divergente bloqueia o gate, sem fallback de armazenamento
