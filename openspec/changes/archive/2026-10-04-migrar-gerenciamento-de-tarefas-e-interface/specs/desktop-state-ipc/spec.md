# Spec Delta

## MODIFIED Requirements

### Requirement: Catálogo de estado mínimo e versionado

A bridge SHALL oferecer getStateSnapshot, subscribeState e unsubscribeState para estado v1, verifyFoundation separado e os comandos v1 createTask, updateTask, changeTaskStatus e openTaskSource. Requests SHALL ter schema exato e validação runtime. Caminhos, SQL, callbacks remotos, repositories, Task livre como entrada, UndoPlan, IPC genérico e comandos de funcionalidades futuras SHALL permanecer indisponíveis.

#### Scenario: Operações disponíveis
- **WHEN** o documento autorizado inspeciona o preload
- **THEN** encontra wrappers explícitos para as três operações de estado, verifyFoundation separado e os quatro comandos previstos, sem canal livre

#### Scenario: Request malformado
- **WHEN** chega versão errada, objeto inválido, campo extra, cursor/ID/revisão inválido ou request acima do orçamento de sua operação
- **THEN** o main recusa antes de ler dados e retorna erro fechado, sem lançar erro de implementação através do IPC
- **AND** estado/diagnóstico continuam limitados a 1 KiB UTF-8 e os comandos têm orçamento próprio de 64 KiB

### Requirement: Transporte limitado preserva dados legítimos

Requests de estado/diagnóstico e eventos SHALL respeitar 1 KiB UTF-8; páginas SHALL respeitar 256 KiB incluindo envelope/escaping. Requests dos quatro comandos SHALL respeitar 64 KiB e suas respostas 8 KiB UTF-8 serializados. Um registro maior SHALL ser fragmentado no snapshot e validado integralmente antes da publicação. Limites SHALL não cortar campos, omitir registros ou limitar quantidade total persistida aos volumes do benchmark.

#### Scenario: Unicode e registro grande
- **WHEN** um registro historicamente válido ou Unicode/escaping excede o tamanho de uma página
- **THEN** cada mensagem respeita o orçamento e a reunião das partes recupera o conteúdo completo sem quebrar caracteres ou publicar registro parcial

#### Scenario: Pressão de recursos
- **WHEN** recurso de leitura não pode ser alocado dentro do orçamento da máquina
- **THEN** retorna RESOURCE_LIMIT, preserva banco/último estado completo e não apresenta truncamento ou vazio como sucesso

#### Scenario: Estado transitório limitado
- **WHEN** sessões realizam leituras/subscriptions sucessivas ou o harness registra mais de oito documentos
- **THEN** cada documento mantém no máximo uma inscrição e um cursor ativo e excedente de admissão é recusado sem vazamento de listener/token

#### Scenario: Formulário com caracteres escapados
- **WHEN** campos básicos válidos próximos dos limites contêm Unicode ou caracteres que aumentam o JSON serializado
- **THEN** o orçamento é medido em bytes UTF-8 do envelope completo e nenhum texto é cortado para caber
- **AND** valor histórico não alterado é omitido do patch e conservado; comando excessivo é recusado explicitamente, sem novo limite de codec

### Requirement: Erros são dados seguros discriminados

Resultados SHALL ser uniões versionadas de sucesso/erro validadas por discriminante, com códigos fechados por operação. Falhas SHALL não transportar stack, cause, SQL, paths, payloads ou protótipos de Error. Erros de campo SHALL usar códigos públicos de campos básicos. Transporte invalidado SHALL exigir ressync antes de nova decisão, sem confiar em instanceof remoto ou repetir escrita automaticamente.

#### Scenario: Erro de produto sanitizado
- **WHEN** há incompatibilidade, corrupção, indisponibilidade, request inválido, falta de autorização, sessão encerrada, snapshot stale ou limite
- **THEN** leitura conserva seus códigos INCOMPATIBLE_DATA, CORRUPTED_DATA, STORAGE_UNAVAILABLE, INVALID_REQUEST, UNAUTHORIZED, SESSION_CLOSED, SNAPSHOT_STALE, RESOURCE_LIMIT ou BUSY
- **AND** a validação do preload recusa saída malformada sem expor detalhes sensíveis

#### Scenario: Resultado tardio após commit
- **WHEN** commit interno confirma e a resposta se perde ou sessão encerra
- **THEN** o banco conserva o commit, o cliente ressincroniza após nova autorização e nenhuma repetição automática de escrita é feita

#### Scenario: Erros funcionais dos comandos
- **WHEN** um comando tem campos inválidos, base antiga, tarefa ausente, recurso avançado bloqueado, origem ausente/proibida/longa ou falha de abertura
- **THEN** seu envelope usa VALIDATION_FAILED, CONFLICT, NOT_FOUND, ADVANCED_TASK_RESTRICTED, SOURCE_NOT_AVAILABLE, SOURCE_NOT_ALLOWED, SOURCE_TOO_LONG ou EXTERNAL_OPEN_FAILED conforme a operação
- **AND** VALIDATION_FAILED contém somente campos/códigos finitos, e CONFLICT pode informar revisão atual sem devolver Task ou refletir o payload recebido

### Requirement: IPC de estado é comprovado no pacote

A validação SHALL exercitar bridge real no Electron empacotado com dados/perfis fictícios, incluindo catálogo, isolamento, negativas, sessões, ressincronização e UI de tarefas inscrita. Mocks e Node externo SHALL não substituir essa evidência nem anunciar funcionalidades futuras como disponíveis.

#### Scenario: Harness de produto e bridge
- **WHEN** o teste empacotado abre duas superfícies de teste autorizadas e provoca alterações fictícias
- **THEN** ambas convergem por snapshots/eventos, guardas negativas e limpeza de documentos funcionam no runtime real
- **AND** hooks de teste não aparecem na bridge normal nem substituem os comandos de produto por implementação exclusiva do harness

#### Scenario: UI inscrita perde evento ou documento
- **WHEN** há evento perdido, retorno de foco, reconciliação de 30 s, reload ou crash controlado da superfície de teste com UI inscrita
- **THEN** a interface corrente recupera snapshot completo sem regressão e a sessão anterior não entrega respostas/eventos
- **AND** listeners/timers não se acumulam e dados confirmados sobrevivem à reabertura; draft perdido num crash é documentado como transitório

## ADDED Requirements

### Requirement: Comandos aceitam somente intenção básica

createTask SHALL aceitar campos básicos validados; updateTask SHALL aceitar ID, revisão de conteúdo esperada e patch básico; changeTaskStatus SHALL aceitar ID, revisão e status; openTaskSource SHALL aceitar ID e revisão. Auditoria, campos avançados, URL arbitrária e opções de sistema SHALL ser recusados. Omissão no patch SHALL preservar valor; limpeza opcional SHALL ser explícita.

#### Scenario: Draft e patch fechados
- **WHEN** criação ou edição contém somente campos básicos autorizados, com tipos corretos
- **THEN** a criação normaliza os campos e a edição altera somente os campos presentes, preservando os demais
- **AND** null limpa somente descrição, solicitante, responsável, prazo ou origem; tags vazias limpam tags, e título/status/prioridade não aceitam null

#### Scenario: Campos de autoridade indevidos
- **WHEN** um request inclui id na criação, createdAt, updatedAt, completedAt, recurrence, seriesId, subtasks, reminders, processedFor, path ou opções do shell
- **THEN** é recusado antes de ler ou modificar dados

### Requirement: Escritas são decisões condicionais no proprietário

O proprietário SHALL gerar IDs/clock de criação e decidir, validar e confirmar mutações sobre o estado atual numa unidade coordenada. Criação SHALL não substituir ID existente. Edição/status SHALL verificar existência e revisão de conteúdo na mesma unidade; revisão global ou timestamp SHALL não substituir essa condição. Recusa/no-op SHALL não produzir commit de alteração ou evento.

#### Scenario: Criação colide
- **WHEN** o gerador fornece ID já existente em tarefas ou lixeira
- **THEN** nenhum item é substituído; outra identidade pode ser gerada com tentativas limitadas e falha final segura

#### Scenario: Mesma base concorre
- **WHEN** duas sessões editam ou mudam status da mesma tarefa/revisão
- **THEN** a primeira alteração aplicável confirma e a outra recebe CONFLICT, sem perda de dados
- **AND** tarefa ausente retorna NOT_FOUND e nunca é recriada pelo comando de edição

#### Scenario: Conteúdo independente e avançados
- **WHEN** outra tarefa muda, ocorre claim isolado ou são editados campos independentes de tarefa com lembretes/subtarefas
- **THEN** não há conflito por revisão global/claim apenas e os campos avançados atuais são conservados
- **AND** recorrência presente impede mutação; com lembretes, mudança efetiva de prazo/status é recusada até sua integração funcional

### Requirement: Confirmação de comando converge com snapshot

Sucesso de escrita SHALL informar revisão global e revisão de conteúdo exatas após confirmação; criação SHALL informar o novo ID. Estado completo SHALL continuar vindo do snapshot. O cliente SHALL aguardar snapshot completo de revisão igual ou superior para encerrar a sincronização, sem upsert por resposta antiga ou anúncio de rollback após commit.

#### Scenario: Resposta chega depois de snapshot novo
- **WHEN** uma resposta confirmada antiga chega depois de o cliente ter recebido snapshot mais recente
- **THEN** a lista conserva o snapshot recente e a resposta não reinstala conteúdo antigo

#### Scenario: Commit sem resposta
- **WHEN** há possível commit e falha de transporte antes da confirmação ao cliente
- **THEN** o cliente preserva draft, sinaliza resultado incerto e exige ressync/revisão explícita antes de nova escrita
- **AND** não reenvia criação/status/edição automaticamente nem infere criação confirmada pela igualdade de título

### Requirement: Origem salva abre somente por operação controlada

openTaskSource SHALL ler origem salva da tarefa/revisão autorizada, após ação explícita, e validar HTTP/HTTPS com host, sem credenciais ou controles. A URL serializada destinada ao sistema SHALL ter até 2081 caracteres no Windows. Abertura SHALL ocorrer fora da transação, com revalidação da sessão antes do efeito, sem alterar tarefa ou permitir navegação remota no app.

#### Scenario: Origem válida salva
- **WHEN** o usuário aciona abrir origem salva com ID/revisão atual e URL HTTP/HTTPS admissível
- **THEN** a operação solicita abertura no navegador padrão, sem opções ou URL enviadas livremente pelo renderer
- **AND** sucesso significa que o sistema aceitou a solicitação, não que a página foi carregada

#### Scenario: Origem recusada ou alterada
- **WHEN** não há origem, a revisão mudou, ou a URL contém controles, userinfo, protocolo proibido, host inválido ou excede 2081 caracteres após serialização
- **THEN** o comando retorna o código previsto sem chamar o opener e sem truncar/regravar a origem
- **AND** file/javascript/data/mailto/taskflow e caminhos UNC não são aceitos

#### Scenario: Falha externa ou sessão encerrada
- **WHEN** o sistema rejeita a abertura ou o documento invalida antes do efeito
- **THEN** a tarefa/draft permanecem intactos e não há nova tentativa automática
- **AND** falha externa é sanitizada, efeito já solicitado não é anunciado como reversível e resposta antiga não é entregue ao novo documento
