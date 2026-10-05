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

### Requirement: Colisão no restore preserva as coleções

IDs SHALL ser únicos dentro de cada coleção, permitindo coexistência do mesmo ID em tarefas e lixeira. Restore com ID ativo existente SHALL retornar `ID_EXISTS` sem sobrescrever, remover ou incrementar revisão. Preparação de restore SHALL ser interna e validada.

#### Scenario: Colisão preservada
- **WHEN** o ID da entrada de lixeira já existe em tarefas
- **THEN** restore retorna `ID_EXISTS` e ambos os payloads/metadados permanecem integralmente iguais

#### Scenario: Ausência ou preparação inválida
- **WHEN** o item não está na lixeira ou a preparação interna produz dados inválidos
- **THEN** a unidade retorna ausência ou erro seguro e não altera tarefas, lixeira ou revisão

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

### Requirement: Claim de ocorrência é condicional e interno

Claim SHALL revalidar status, tarefa, reminder e ocorrência esperada no estado atual e persistir `processedFor` antes de qualquer efeito externo. Claim inaplicável SHALL ser no-op. Claim válido SHALL alterar revisão global sem mudar revisão de conteúdo ou `updatedAt`.

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

### Requirement: Falhas e efeitos externos respeitam commit

Sucesso e eventos de alteração SHALL ocorrer somente depois de commit confirmado. Falha com resultado incerto SHALL invalidar a conexão e exigir reopen/validação antes de continuar. Falha de resposta ou efeito externo pós-commit SHALL exigir ressincronização, sem repetir escrita cegamente ou desfazer o commit.

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

### Requirement: Leituras são livres de mutações de manutenção

List/get/snapshot SHALL representar dados validados sem expurgar lixeira, regravar codecs ou atualizar revisões. Expurgo e outras manutenções SHALL depender de unidade explícita interna, sem integrar políticas/UX futuras nesta Change.

#### Scenario: Lixeira antiga é lida
- **WHEN** uma leitura inclui entradas antigas ou coleção acima do limite futuro de retenção
- **THEN** a leitura não remove itens, não modifica revisões e não emite evento de alteração

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
