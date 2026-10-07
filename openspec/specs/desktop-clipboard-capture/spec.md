# desktop-clipboard-capture Specification

## Purpose

Transformar conteúdo textual copiado por gesto explícito em rascunho revisável, com entrega limitada por destino e proteção contra substituição do trabalho em curso.

## Requirements

### Requirement: Captura lê somente texto por gesto explícito

Captura SHALL ler text/plain somente por botão ou ação global específica. Botão SHALL usar sua superfície; ação global/bandeja SHALL usar Quick Add. Abrir Quick Add SHALL não ler clipboard. Não SHALL haver polling, histórico, leitura de abas/HTML/RTF/bookmark/arquivos, título/favicon ou requisição de rede.

#### Scenario: Abertura e captura separadas
- **WHEN** usuário abre Quick Add e depois aciona Capturar conteúdo copiado
- **THEN** somente o segundo gesto solicita uma leitura de texto; captura não salva tarefa

#### Scenario: Destinos definidos
- **WHEN** botão do manager ou atalho global é acionado
- **THEN** botão entrega somente ao manager e global entrega somente ao Quick Add, sem escolher destino pelo foco do SO ou parâmetro livre

### Requirement: URL isolada exige nome manual e origem íntegra

Token inteiro com esquema absoluto SHALL ser URL somente se HTTP/HTTPS com ://, host válido e sem userinfo/controles literais. Candidato de esquema proibido/malformado SHALL ser recusado. URL aceita SHALL preencher origem canônica completa e título vazio, com foco no título, sem truncar ou obter metadados.

#### Scenario: URL válida e limite de abertura salva
- **WHEN** token HTTP/HTTPS válido tem casing/IDNA/query ou tamanho maior que2081
- **THEN** origem conserva href canônico inteiro e título vazio obrigatório; UI explica abertura salva indisponível quando ultrapassa política existente
- **AND** envelope excessivo é RESOURCE_LIMIT, sem cortar URL ou mudar codec histórico

#### Scenario: Candidato recusado
- **WHEN** token anuncia esquema proibido, HTTP sem ://, host malformado, usuário/senha ou controles C0/C1
- **THEN** retorna UNSUPPORTED preservando draft e pending anteriores, sem abrir URL ou tratar candidato perigoso como origem

### Requirement: Texto conserva mapeamento e informa cortes

Texto SHALL gerar título com whitespace colapsado/trim até200 unidades UTF-16. Somente normalizado>200 SHALL gerar descrição raw.trim() com linhas internas até4000. Corte SHALL usar ellipsis sem dividir par substituto, com aviso por campo. Texto com link/whitespace interno SHALL continuar texto sem inferência de origem; substituto órfão SHALL ser INVALID_TEXT.

#### Scenario: Fronteiras e Unicode
- **WHEN** comprimentos199/200/201 ou3999/4000/4001 e emoji atravessam limite
- **THEN** título/descrição seguem gatilho e limites, recuam corte de par e anunciam campos cortados
- **AND** nenhum campo gerado contém substituto órfão

#### Scenario: Texto e associação opcional
- **WHEN** conteúdo é multilinha ou inclui URL dentro de texto e usuário adiciona origem
- **THEN** mapeamento preserva linhas da descrição quando aplicável; origem só existe por associação manual validada/editável/removível
- **AND** não há extração automática de primeiro link ou releitura do clipboard

### Requirement: Falhas de leitura conservam estado e limitam concorrência

Captura SHALL ter uma leitura física em voo, sem fila/replay, deadline lógico5s e limite raw1MiB UTF-8 após alocação nativa. Vazio/whitespace/sem texto/erro/timeout/limite SHALL conservar draft e pendência. Resultado tardio ou de epoch/sessão invalidada SHALL não publicar conteúdo.

#### Scenario: Vazio e falha
- **WHEN** clipboard não oferece texto útil, leitura rejeita ou excede orçamento
- **THEN** recebe EMPTY/UNAVAILABLE/RESOURCE_LIMIT seguro e conserva conteúdo anterior

#### Scenario: Timeout não cancela API física
- **WHEN** leitura não termina em5s e novos gestos chegam
- **THEN** primeiro gesto recebe TIMEOUT, outros recebem BUSY até Promise nativa concluir; resultado tardio é descartado
- **AND** Promise que nunca conclui exige reiniciar para recuperar leitura, sem acumular chamadas

#### Scenario: Suspensão e encerramento durante await
- **WHEN** destino perde sessão, suspende ou é destruído antes da leitura terminar
- **THEN** resultado não chega à sessão/documento novo nem altera slot; Sair invalida efeitos globais

### Requirement: Pendência é única por destino e não apaga draft ativo

Cada destino SHALL conservar no máximo uma pendência. Nova captura válida SHALL substituir só pendência anterior com aviso, nunca draft ativo. Criação vazia/lista segura SHALL poder receber captura diretamente; draft dirty, edição, save, confirmação, trash, backup, conflito, ack incerto ou localização de lembrete SHALL manter oferta para revisão explícita.

#### Scenario: Dirty por qualquer campo
- **WHEN** título está vazio mas prazo/prioridade/pessoa/descrição/origem foi alterado, ou editor de tarefa está aberto
- **THEN** captura permanece held sem mudar campos; Revisar só ocorre depois de resolver/cancelar draft pelo fluxo existente

#### Scenario: Ocupação termina e chega substituta
- **WHEN** captura foi apresentada durante ocupação, UI volta à lista e depois chega nova captura
- **THEN** voltar não aplica captura automaticamente; nova substitui somente oferta com aviso
- **AND** Descarta remove oferta sem salvar/mesclar tarefa

### Requirement: Entrega confirmada protege TTL e corridas

Consultar/enviar SHALL não consumir captura. ID/seq/documento SHALL controlar apresentação, aplicação e descarte idempotentes. Staged SHALL expirar em10min monotônicos antes da apresentação; held reconhecido SHALL não expirar na execução. Ack antigo/superseded SHALL não consumir substituta ou alterar outro documento.

#### Scenario: Prazo e apresentação perdida
- **WHEN** captura staged atinge600000ms sem ack de apresentação, inclusive durante handshake
- **THEN** expira e UI recebe expiração sem aplicar cópia provisória; consulta/evento não renova prazo
- **AND** held reconhecido antes do limite continua disponível mesmo após ocultação e10min

#### Scenario: Ack e eventos fora de ordem
- **WHEN** evento/ack é perdido/duplicado/reordenado ou ID/seq foi substituído
- **THEN** consulta e recibo limitado reconciliam estado sem consumir captura errada ou repetir aplicação/criação
- **AND** form alterado durante ack conserva seus valores e mantém cópia como oferta local revisável

#### Scenario: Documento desaparece
- **WHEN** destino falha ao abrir, fica oculto, sofre reload/crash ou processo sai
- **THEN** staged não apresentado permanece somente até TTL do mesmo destino; ocultação conserva held da instância viva; reload/crash perde held daquela instância
- **AND** Sair/crash do processo perde conteúdo transitório, sem persistência/histórico ou entrega a outro role

### Requirement: Conteúdo permanece privado e transporte é limitado

Clipboard bruto SHALL ficar somente no proprietário durante leitura. Draft mapeado SHALL trafegar até64KiB UTF-8 JSON completo; eventos<=1KiB SHALL levar apenas referência/seq/status. Guards de role/documento/sessão/origem/frame e schemas SHALL preceder leitura e entrega. Logs/backups SHALL não receber clipboard/draft.

#### Scenario: Remetente inválido e envelope grande
- **WHEN** documento alheio/oculto tenta ler/ack/discard ou envelope excede limite
- **THEN** operação é recusada antes do efeito/entrega e não revela conteúdo ou corta dados para caber
- **AND** testes usam texto fictício e não serializam raw em eventos/logs
