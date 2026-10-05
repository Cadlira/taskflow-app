# Spec Delta

## Purpose

Permitir que o usuário exporte tarefas locais e importe backups da extensão por arquivos versionados, com prévia condicionada, preservação integral e resultado verificável sem transportar lixeira, credenciais ou histórico temporário.

## ADDED Requirements

### Requirement: Formato versionado permanece compatível

Backup SHALL usar o envelope taskflow-backup com formatVersion, exportedAt UTC canônico, app.version informativa e tasks. Exportação SHALL gerar v4; importação SHALL reconhecer v1–v4 por migrações ordenadas e recusar versão futura, estrutura inválida ou migração ausente integralmente.

#### Scenario: Quatro versões reconhecidas
- **WHEN** fixtures v1/v2/v3/v4 válidas são selecionadas
- **THEN** as quatro produzem tarefas canônicas completas e a prévia diferencia versão original e normalizada4
- **AND** app.version não seleciona migração nem versão de SQL/codec

#### Scenario: Marcadores e listas legadas
- **WHEN** v1 contém lastTriggeredFor e OFFSET ou v2/v3 não contém subtasks
- **THEN** v1 converte processedFor subtraindo offsetMinutes e v3→v4 fornece listas vazias, sem inventar séries/IDs/ocorrências
- **AND** marcador legado inválido rejeita o arquivo sem descartar o valor para fazê-lo válido

#### Scenario: Arquivo futuro estranho ou incompleto
- **WHEN** JSON/formato/versão/exportedAt/app/tasks é inválido ou a versão supera4
- **THEN** operação é recusada por razão fechada sem modificar tarefas/lixeira/revisões ou oferecer confirmação

### Requirement: Validação e projeção são integrais

Importação SHALL validar todos os registros e IDs, preservando os contratos estritos do backup e projetando somente campos conhecidos em todos os níveis. Registro inválido SHALL rejeitar tudo; desconhecidos SHALL não virar configuração persistida. Codec histórico SHALL continuar independente do formato de arquivo.

#### Scenario: Regras e duplicações
- **WHEN** arquivo tem enum/ISO/status-completedAt/texto/tag/URL/reminder/regra/subtask inválido ou IDs de tarefa repetidos
- **THEN** toda importação falha com no máximo cinco erros seguros de campo/código/índice e contagem restante, sem importar parte

#### Scenario: Estruturas aninhadas e IDs locais
- **WHEN** arquivo contém propriedades extras no envelope/tarefa/reminder/recurrence/subtask ou ID de subtask repetido entre tarefas diferentes
- **THEN** extras não são persistidos/exportados e repetição entre tarefas é válida; repetição dentro da mesma lista é recusada
- **AND** until histórico aceito pelo backup não recebe retroativamente normalização/regra de edição de formulário

### Requirement: Arquivos têm limite real e encoding explícito

Entrada e saída SHALL ter no máximo20971520 bytes no arquivo completo, inclusive envelope e BOM de entrada. Leitura SHALL ser limitada durante a coleta, aceitar UTF-8 estrito com um BOM inicial opcional e recusar excedente, encoding inválido e fonte não regular sem alterar dados.

#### Scenario: Limite e multibyte
- **WHEN** arquivo tem exatamente20MiB,20MiB+1 ou Unicode cujo tamanho diverge de string.length
- **THEN** igualdade pode prosseguir após validação/recursos e excedente recebe FILE_TOO_LARGE antes de parse, sem usar contagem de caracteres

#### Scenario: Crescimento e fonte imprópria
- **WHEN** tamanho declarado/stat é pequeno mas leitura ultrapassa limite, ou fonte é diretório/dispositivo/pipe
- **THEN** leitura limitada recusa sem coleta ilimitada; fonte que resolve a arquivo regular escolhido pode ser lida por seu handle

#### Scenario: Encoding e falhas distintas
- **WHEN** arquivo contém UTF-16, UTF-8 malformado, BOM repetido, JSON vazio/truncado ou falha de I/O
- **THEN** INVALID_ENCODING/INVALID_JSON/FILE_READ_FAILED distingue a causa segura e não produz preview restaurável
- **AND** um envelope válido com tasks:[] continua distinto de arquivo vazio

### Requirement: Recursos de backup são limitados sem truncamento

Backup SHALL limitar a um job nativo ativo global e oito preparações, uma por documento, com128MiB de charge lógico incluindo candidatos/temporários. JSON SHALL limitar profundidade64 e262144 nós antes de parse. Excedente SHALL recusar por BUSY/RESOURCE_LIMIT com dados íntegros, sem teto retroativo do codec.

#### Scenario: Concorrência e orçamento
- **WHEN** dois jobs nativos concorrem ou parse/projeção/export/preparações não cabem na reserva
- **THEN** excedente recusa antes de efeito e nenhum arquivo/tarefa é cortado para caber
- **AND** filas SQL e reservas64MiB de undo mantêm limites próprios

#### Scenario: JSON adversarial e liberação
- **WHEN** desconhecidos profundos/muitos nós excedem recursos ou oito sessões repetem preparar/cancelar/expirar/encerrar
- **THEN** recusa antecede parse/clone excessivo e referências/reservas são liberadas
- **AND** charge lógico, heap/RSS/pico/bloqueio reais são medidos separadamente; não se anuncia garantia de heap exato

### Requirement: Exportação representa todas as tarefas permitidas

Exportação SHALL capturar snapshot consistente de todas as tarefas sem filtros, gerar v4 UTF-8 sem BOM e validar sua própria saída. Somente campos permitidos e metadados do envelope SHALL sair. Conteúdo histórico não exportável ou arquivo excessivo SHALL recusar tudo, conservando banco e destino.

#### Scenario: Exportação completa e exclusões
- **WHEN** filtros escondem tarefas e lixeira/configuração/recibos contêm sentinelas fictícias
- **THEN** todas as tarefas entram e trash/credenciais/provedor/undo/revisões SQL/unknowns aninhados não entram
- **AND** reimportação do JSON preserva todos os campos conhecidos

#### Scenario: Histórico e tamanho excessivo
- **WHEN** dado aceito pelo codec viola o backup ou JSON completo ultrapassa20MiB
- **THEN** LOCAL_DATA_NOT_EXPORTABLE/FILE_TOO_LARGE informa recusa integral segura; nada é normalizado, omitido ou truncado

### Requirement: Escolha nativa mantém arquivos no proprietário

Seleção e salvamento SHALL ocorrer por diálogos nativos associados à janela autorizada. Caminhos, conteúdo do arquivo e filesystem SHALL permanecer no proprietário; renderer SHALL receber somente resumo/token/resultado. Cancelar seleção SHALL ser neutro e navegação SHALL impedir efeito/saída ainda não autorizados.

#### Scenario: Selecionar salvar e cancelar
- **WHEN** usuário seleciona JSON, escolhe destino ou cancela o diálogo
- **THEN** somente escolha válida autoriza leitura/gravação e cancelamento retorna cancelled sem anunciar erro/sucesso

#### Scenario: Sessão e destino protegido
- **WHEN** documento encerra/navega ou destino resolve dentro de dados/sessão/runtime do app ou é symlink/reparse conhecido
- **THEN** efeito ainda não iniciado é recusado e temporário próprio é limpo, sem acessar arquivo por path fornecido pelo renderer
- **AND** efeito já concluído não é repetido/revertido nem entregue ao novo documento

### Requirement: Salvamento preserva destino até substituição

Exportação SHALL gravar arquivo completo em temporário exclusivo no mesmo diretório, sincronizar/fechar e substituir sem truncar/remover destino antecipadamente. Falha anterior à substituição SHALL preservar destino anterior. Sucesso SHALL distinguir arquivo confirmado de aviso posterior, sem promessa de CAS contra terceiros ou energia.

#### Scenario: Write flush ou rename falha
- **WHEN** permissão/disco cheio/arquivo ocupado/escrita/sync/substituição falha antes do efeito final
- **THEN** FILE_WRITE_FAILED conserva destino anterior e tarefas; limpeza remove somente temporário próprio, sem fallback copy-delete

#### Scenario: Destino mudou ou verificação falha
- **WHEN** fingerprint mudou antes da substituição ou readback falha depois de arquivo substituído
- **THEN** primeiro caso recebe DESTINATION_CHANGED sem sobrescrever; segundo retorna SAVED_WITH_WARNING sem alegar original preservado
- **AND** não há segunda gravação ou recuperação automática sobre mudanças posteriores

#### Scenario: Windows real e interrupção
- **WHEN** pacote salva em destino novo/existente com Unicode, confirmação de overwrite e interrupções isoladas
- **THEN** evidência registra fase/bytes/resultados e estado inteiro do destino
- **AND** escolha stub no harness ou kill não é apresentada como diálogo real ou prova de energia

### Requirement: Prévia é própria imutável e temporária

Preparação SHALL guardar cópia validada no proprietário, token opaco próprio de documento/contexto e base global atual. Prévia SHALL mostrar contagens/data/versão original/normalizada/app e expirar em5min monotônicos. Troca/cancelamento/expiração/encerramento SHALL liberar referências; confirmação SHALL não reler o arquivo.

#### Scenario: Arquivo mudou e seleção repetida
- **WHEN** arquivo muda depois da prévia ou usuário seleciona novamente o mesmo arquivo
- **THEN** confirmar usa somente a cópia apresentada; nova seleção prepara cópia/token/base novos sem acumular preparação anterior

#### Scenario: Expiração e token inválido
- **WHEN**5min passam, contexto/documento muda ou token é alheio/ausente/reutilizado
- **THEN** BACKUP_PREVIEW_EXPIRED/INVALID ou STALE_CONTEXT recusa sem escrita e sem consumir preparação legítima de outra sessão
- **AND** undo continua sem expiração temporal e TTL não é renovado por foco/exportação preventiva

### Requirement: Substituição exige consentimento sobre a base

Usuário SHALL confirmar explicitamente substituição total irreversível. Prévia SHALL alertar para arquivo sem tarefas e permitir exportação preventiva opcional. Qualquer mudança da revisão global após preparar SHALL exigir nova prévia/confirmação; consentimento SHALL não ser transferido à base nova automaticamente.

#### Scenario: Zero tarefas e abandono
- **WHEN** usuário confirma tasks:[] ou abandona modal/cancela prévia
- **THEN** confirmação válida remove todas as tarefas ativas; abandono modal conserva preview/token e cancelamento da prévia libera-o sem gravar

#### Scenario: Duas sessões e lixeira
- **WHEN** outra sessão edita/checka/exclui/restaura/expurga ou há claim entre preview e confirm
- **THEN** BACKUP_BASE_CHANGED conserva estado atual e exige nova preparação, mesmo se a contagem permanece igual

#### Scenario: Exportar durante prévia
- **WHEN** usuário exporta tarefas atuais a partir da prévia
- **THEN** exportação não confirma importação nem renova token/TTL/base; preview permanece e alterações posteriores ainda conflitam

### Requirement: Importação substitui somente tarefas em uma unidade

Restauração SHALL substituir tasks integralmente por base global válida em uma unidade, preservando trash/configurações e metadados locais coerentes. Removidas SHALL não ir à lixeira; importação SHALL não oferecer undo. No-op SHALL conservar revisão SQL, e falha SHALL não confirmar coleção parcial.

#### Scenario: Coleção nova e no-op
- **WHEN** backup válido substitui tarefas ou o plano final é idêntico
- **THEN** novos/alterados recebem revisões locais, removidos saem diretamente e idênticos conservam metadata; no-op é UNCHANGED sem revisão nova
- **AND** timestamps/IDs do arquivo e trash inteira são preservados

#### Scenario: Falha entre registros
- **WHEN** aplicação ou verificação pré-commit falha entre remover/inserir/alterar
- **THEN** rollback/reopen conserva coleção anterior inteira e revisão exata, sem sucesso parcial ou divisão em commits

### Requirement: Portadora é validada no estado final

Importação SHALL conferir portadora única por série em tarefas importadas e todas as entradas preservadas de trash, qualquer status. IDs entre coleções SHALL poder coexistir. Conflito SHALL recusar tudo sem expurgo, reparação automática, retirada de regra ou geração.

#### Scenario: Duas portadoras e trash antiga
- **WHEN** duas importadas ou importada/trash portam a mesma série, inclusive terminal/vencida, ou trash já contém duplicidade
- **THEN** SERIES_CONFLICT conserva ambas as coleções/revisões e nenhuma regra é removida para aceitar backup

#### Scenario: ID homônimo e histórica sem regra
- **WHEN** ID importado existe em trash ou série contém históricas sem recurrence
- **THEN** coexistência/históricas são permitidas se não há duas portadoras; restore posterior conserva ID_EXISTS pertinente

### Requirement: Fidelidade inclui campos aninhados completos

Verificação SHALL comparar conjuntos exatos por ID e todos os campos conhecidos/opcionais, preservando ordem das listas. SeriesId, frequência/parâmetros/anchorAt/until, reminders/processedFor e subtasks id/title/done/ordem SHALL participar. Metadata de armazenamento SHALL ser conferida separadamente.

#### Scenario: Perda isolada de campo
- **WHEN** gravação remove/altera cada campo básico/opcional, série/regra/parâmetro, marker ou campo/ordem de subtask
- **THEN** cada divergência é detectada, inclusive com contagem/título geral iguais; não há verified verdadeiro para perda de dados

#### Scenario: Ordem da coleção e listas
- **WHEN** leitura SQL reordena tarefas mas não seus conteúdos, ou modifica lista aninhada
- **THEN** reordenação da coleção por ID não falha; alteração de tags/reminders/weekdays/subtasks é detectada
- **AND** Unicode/precisão ISO/ausência de opcional permanecem verificáveis após exportação/reimportação/reopen

### Requirement: Lembretes somente liquidam gatilhos vencidos

Restauração SHALL conservar dados do arquivo e liquidar pendentes representáveis<=now no momento da execução, sem reescrever timestamps ou gerar notificação/ocorrência. Futuro e marcas já processadas SHALL permanecer. Scheduler e guards existentes de edição/status SHALL não ser habilitados/relaxados.

#### Scenario: Fronteiras e tipos
- **WHEN** AT/OFFSET tem gatilho antes/exatamente/depois de now, marca existente ou tarefa terminal
- **THEN** vencidos/exatos pendentes recebem marker correto, futuro/marcas são conservados e timestamps/status não mudam
- **AND** nenhuma mensagem afirma agendamento e nenhuma subtask/âncora é regenerada

### Requirement: Resultado de falha distingue commit de rollback

Resultado SHALL distinguir NOT_APPLIED, sucesso APPLIED/UNCHANGED com verificação VERIFIED/PENDING e commitState UNKNOWN. Commit confirmado SHALL não ser anunciado como rollback por falha posterior. Perda de resposta/resultado incerto SHALL exigir reconciliação/reopen, sem replay ou reversão automática.

#### Scenario: Conferência antes e depois do commit
- **WHEN** conteúdo diverge antes do commit ou releitura falha depois de commit confirmado
- **THEN** primeiro caso reverte e retorna BACKUP_VERIFICATION_FAILED/NOT_APPLIED; segundo conserva commit e retorna sucesso durável/PENDING com aviso e estado bloqueado até reopen

#### Scenario: Commit incerto e resposta perdida
- **WHEN** COMMIT/rollback é incerto ou resposta se perde
- **THEN** confirmação consumida não é repetida/reconstruída; banco bloqueado exige reopen e UI comunica incerteza, nunca lista vazia ou nada alterado sem evidência

### Requirement: Restauração invalida histórico temporário global

Sucesso confirmado APPLIED/UNCHANGED SHALL invalidar recibos/confirmações/candidatos e ofertas visuais de todas as sessões antes de próxima ação/publicação. Epoch transitória SHALL cercar respostas antigas mesmo sem revisão SQL nova. Cancelamento/falha com rollback SHALL não invalidar outras sessões.

#### Scenario: No-op e ack antigo
- **WHEN** importação UNCHANGED confirma enquanto ack elegível anterior está atrasado
- **THEN** SQL/revisões permanecem, ofertas somem em todas as sessões e ack de época antiga não as recria

#### Scenario: Cancelamento rollback e recuperação incerta
- **WHEN** arquivo é cancelado/recusado/revertido ou banco exige reopen após resultado incerto
- **THEN** primeiros casos preservam ofertas alheias; recuperação incerta aplica barreira conservadora sem anunciar sucesso da importação

### Requirement: Migração manual comunica limites e exclusões

Produto SHALL orientar exportar pela extensão inalterada, preservar original, escolher/revisar/confirmar/conferir no app e oferecer backup preventivo opcional. Arquivo SHALL transportar tarefas sem lixeira, credenciais/configuração de IA ou desfazer. JSON SHALL ser identificado como não criptografado e capaz de conter dados pessoais das tarefas.

#### Scenario: Percurso offline
- **WHEN** usuário migra fixtures sem rede
- **THEN** segue exportação manual e importação explícita com conferência, sem conta/backend/extração do Chrome ou mudança na extensão

#### Scenario: Diferenças da migração
- **WHEN** usuário lê avisos/guia ou exporta
- **THEN** não há promessa de transportar trash/segredos/undo, reparar SQLite inacessível, mesclar ou agendar lembretes
- **AND** trash do app permanece, logs/erros não contêm conteúdo sensível e reimportação é nova decisão explícita

### Requirement: Interface preserva consentimento teclado e foco

Área Backup SHALL preservar identidade visual e distinguir loading/preview/rejected/restoring/exporting/success/stale/blocked. Controles SHALL manter busy focável com aria-disabled e impedir dupla ação. Cancelamento/erro/sucesso SHALL anunciar fase correta e recuperar foco seguro, conservando filtros e uma inscrição.

#### Scenario: Teclado modal e busy
- **WHEN** usuário entra/volta, seleciona/cancela, usa Escape ou repete ação enquanto ocupado
- **THEN** foco segue título/seletor/origem/alerta/Voltar pertinentes e só uma operação efetua, sem body ou confirmação implícita

#### Scenario: Estado mudou e filtro esconde importadas
- **WHEN** snapshot fica stale/base muda ou filtro não mostra tarefas importadas
- **THEN** confirmação antiga fica indisponível com explicação e contagens independem de filtros, sem lista vazia de erro ou limpeza arbitrária do draft/filtros

### Requirement: Evidência cobre arquivo e produto reais

Validação SHALL rastrear B01–B14 com formatos/campos/falhas/tokens/recursos e bridge/I/O de produto empacotado em perfil fictício. Diálogos nativos SHALL ter evidência Windows própria. Gates existentes e pendências herdadas SHALL permanecer distintos de mocks, build, instalador ou scheduler.

#### Scenario: Gates e pacote
- **WHEN** lint/typechecks/testes/build/OpenSpec e pacote/harness/roteiro nativo são executados
- **THEN** relatório identifica comandos/runtime/hash/casos/resultados e pendências, sem apresentar stub de diálogo ou build como prova nativa

#### Scenario: Recursos e budgets
- **WHEN** arquivos no teto/adversariais, oito preparações e1000/10000 tarefas são medidos
- **THEN** registra bytes/charge/heap/RSS/pico/latência/bloqueio/heartbeat/liberação sem truncar, dividir commits ou relaxar gates
- **AND** D10/a11y/before-images herdados e prova de energia permanecem identificados quando não executados

