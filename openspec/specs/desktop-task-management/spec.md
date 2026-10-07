# desktop-task-management Specification

## Purpose
Permitir gerenciamento básico de tarefas locais com paridade de campos, consultas e interação acessível, preservando dados e rascunhos diante de falhas e concorrência e delimitando recursos avançados ainda indisponíveis.

## Requirements

### Requirement: Campos básicos têm validação e normalização preservadas

O gerenciamento SHALL permitir criar tarefas com título, descrição, solicitante, responsável, status, prioridade, prazo, tags e origem. Título SHALL ser obrigatório; defaults SHALL ser TODO/MEDIUM. Textos SHALL usar trim, opcionais vazios ausentes e tags distintas sem diferenciar caixa. Limites SHALL ser 200 para título, 4000 para descrição, 120 por pessoa e 10 tags de 30. Origem preenchida SHALL ser HTTP/HTTPS válida.

#### Scenario: Criação mínima e completa
- **WHEN** o usuário envia título válido sozinho ou todos os campos básicos válidos
- **THEN** uma tarefa é confirmada com defaults/opcionais, IDs e auditoria do proprietário, tags normalizadas e campos conhecidos conservados na reabertura
- **AND** criação em DONE tem completedAt e criação nos outros status não tem esse campo

#### Scenario: Limite e erro por campo
- **WHEN** há título vazio, texto/tag acima do limite, tags distintas em excesso, enum inválido ou prazo/origem inválidos
- **THEN** a tarefa não é gravada, o formulário conserva seus valores e apresenta erro no campo, focando o primeiro inválido
- **AND** limites exatos são aceitos e alterar o DOM não permite contornar a validação do proprietário

### Requirement: Edição básica conserva valores não alterados

Editar SHALL conservar identidade, criação e campos não alterados, inclusive avançados e valores históricos aceitos pelo armazenamento. Limpeza de opcionais SHALL depender de intenção explícita. Campos novos/alterados SHALL receber validação básica; limites de formulário SHALL não ser impostos retroativamente a campos históricos intactos. Cancelar SHALL não gravar. Regra/subtarefas SHALL aceitar somente as intenções autorizadas; save SHALL conservar done atual quando apenas marcações externas mudaram, usando revisão de edição e não fazendo merge geral.

#### Scenario: Editar e cancelar
- **WHEN** o usuário muda campos básicos e salva, ou cancela o formulário
- **THEN** o save confirmado preserva id/createdAt e atualiza auditoria coerente; cancelar conserva a tarefa e retorna foco a Nova tarefa

#### Scenario: Dados históricos e precisão
- **WHEN** há valor histórico longo, prazo com segundos/milissegundos, subtarefas ou lembretes e o usuário edita campo independente
- **THEN** os valores não alterados permanecem integrais, sem corte, revalidação retroativa ou limpeza por omissão
- **AND** falha de orçamento de transporte preserva banco e preenchimento

#### Scenario: Marcações externas e edição estrutural
- **WHEN** outra superfície mudou somente done ou alterou campo/estrutura desde a base do formulário
- **THEN** no primeiro caso save preserva marks atuais e confirma; no segundo conflita conservando draft, sem atualizar base silenciosamente

### Requirement: Status simples preserva transições e no-op

Tarefas simples SHALL permitir TODO, IN_PROGRESS, DONE e CANCELLED pelo formulário/seletor/ações rápidas. Entrar em DONE SHALL registrar completedAt; sair SHALL removê-lo. Reabrir rápido SHALL ir a TODO. Solicitar status já atual SHALL conservar timestamps/revisões e não gravar ou publicar alteração.

#### Scenario: Concluir cancelar e reabrir
- **WHEN** tarefa simples muda entre os quatro status ou usa ação rápida de reabrir
- **THEN** completedAt segue a transição, reabrir vai a TODO e demais campos permanecem
- **AND** subtarefas existentes não mudam o status automaticamente

#### Scenario: Mesmo status
- **WHEN** o usuário confirma status já atual com base válida
- **THEN** o resultado é no-op e não altera updatedAt, completedAt, revisões ou eventos

### Requirement: Pesquisa preserva campos e comparação

A pesquisa SHALL combinar substring com trim e caixa ignorada em título, descrição, solicitante, responsável, tags e títulos de subtarefas existentes. Ela SHALL não remover acentos, tokenizar palavras ou incluir sourceUrl. Termo vazio SHALL corresponder a todas as tarefas disponíveis.

#### Scenario: Correspondência nos campos atuais
- **WHEN** uma substring com caixa diferente aparece em qualquer campo pesquisado, inclusive subtarefa editável
- **THEN** a tarefa corresponde ao termo conforme a comparação da origem, também após save confirmado de título de subtarefa

#### Scenario: Acentos e URL
- **WHEN** o termo só corresponderia após remover acento, separar palavras ou pesquisar sourceUrl
- **THEN** essas ampliações não produzem correspondência

### Requirement: Filtros e ordenação são combináveis

Pesquisa, status, prioridade e situação de prazo SHALL combinar por AND. Ordenação SHALL oferecer DUE_DATE, PRIORITY e STATUS, com DUE_DATE inicial e desempates preservados. Limpar filtros SHALL conservar a ordenação. Contagem de resultados SHALL usar o snapshot completo válido, sem incluir lixeira.

#### Scenario: Ordem e desempates
- **WHEN** o usuário escolhe DUE_DATE, PRIORITY ou STATUS
- **THEN** prazo ordena crescente, ausentes por último e criação decrescente no empate; prioridade usa URGENT/HIGH/MEDIUM/LOW e criação; status usa TODO/IN_PROGRESS/DONE/CANCELLED, prazo e criação

#### Scenario: Combinação e limpeza
- **WHEN** filtros/pesquisa são combinados ou limpos
- **THEN** correspondência exige todas as condições e limpar conserva sortKey, com N de total correto

### Requirement: Situação do prazo usa instante e status ativo

Somente TODO/IN_PROGRESS com prazo SHALL receber classificação: atrasada se dueAt < now, próxima se now <= dueAt <= now + 24 h. Sem prazo ou terminal SHALL não receber esses badges. Relógio de apresentação SHALL atualizar em até 60 s enquanto ativo e imediatamente ao retornar ao foco/execução após suspensão.

#### Scenario: Fronteiras do intervalo
- **WHEN** prazo ativo é now-1 ms, now, now+24 h ou now+24 h+1 ms
- **THEN** é respectivamente atrasada, próxima, próxima ou fora dos dois grupos, sem equivalência ao próximo dia do calendário

#### Scenario: Estado terminal e retomada
- **WHEN** tarefa terminal/sem prazo é listada ou uma janela volta ao foco depois de o relógio avançar
- **THEN** terminal/sem prazo não recebe classificação e tarefas ativas são recalculadas com o instante corrente

### Requirement: Prazo local conserva instante e exige revisão de fuso

Entrada SHALL representar data/hora local do SO, exibição SHALL usar pt-BR e armazenamento SHALL usar ISO UTC. Prazo e limite de série não editados SHALL conservar seu ISO/precisão. Datas impossíveis e gaps de entrada SHALL ser recusados; hora repetida nova SHALL seguir a escolha anterior da conversão local da origem. Mudança de fuso durante edição do prazo ou limite SHALL exigir revisão explícita antes do save. Cálculo de recorrência SHALL seguir normalização civil própria, sem reconverter campos intactos.

#### Scenario: Prazo não alterado
- **WHEN** o usuário edita outro campo de tarefa cujo prazo/limite inclui segundos/milissegundos ou pertence à segunda ocorrência de hora repetida
- **THEN** o instante original não é reconvertido pelo input de minutos nem deslocado

#### Scenario: Calendário e transições
- **WHEN** há data impossível, leap day válido, horário inexistente ou horário repetido novo na entrada
- **THEN** datas impossíveis/gaps falham, dia válido é aceito e repetição nova usa o instante escolhido pela conversão local preservada
- **AND** não se fixa offset -03:00 ou America/Sao_Paulo no produto; normalização de gap no cálculo segue o contrato de recorrência

#### Scenario: Fuso muda com formulário aberto
- **WHEN** o fuso corrente diverge do capturado ao abrir e há alteração pendente do prazo ou limite de série
- **THEN** o draft é conservado, save é bloqueado e o usuário deve revisar/confirmar o horário no novo fuso ou restaurar o instante salvo
- **AND** edição independente com datas intactas pode conservar os ISO originais

### Requirement: Carregamento vazio e erro são estados distintos

A interface SHALL distinguir carregamento, snapshot válido vazio, nenhum resultado de filtros, estado atual e stale/indisponível. Erro SHALL nunca ser convertido em coleção vazia. Último snapshot completo SHALL permanecer identificado como stale; comandos dependentes de estado SHALL ficar indisponíveis até reconciliação válida, sem perder draft/filtros.

#### Scenario: Primeiro carregamento e vazio
- **WHEN** ainda não há snapshot completo ou chega snapshot válido sem tarefas
- **THEN** o primeiro caso apresenta carregamento e o segundo oferece Criar primeira tarefa

#### Scenario: Nenhuma correspondência
- **WHEN** tarefas existem mas nenhuma corresponde aos filtros
- **THEN** a interface oferece Limpar filtros, sem tratar o estado como armazenamento vazio

#### Scenario: Falha inicial ou posterior
- **WHEN** há indisponibilidade, corrupção, incompatibilidade, churn ou falha transitória
- **THEN** aparece erro seguro e ação pertinente de reconciliação; nenhum reset é oferecido e snapshot anterior não é apagado

### Requirement: Falhas e concorrência conservam preenchimento

Falha de validação/escrita, CONFLICT, NOT_FOUND ou resultado incerto SHALL conservar draft e base da edição. Atualização externa SHALL não sobrescrever inputs. Conflito SHALL oferecer revisão da versão atual e descarte explicitamente confirmado, sem merge automático ou troca silenciosa da base. Escrita simultânea repetida na mesma interação SHALL ser impedida. Mudança somente de done SHALL não invalidar a revisão de edição do formulário; demais mudanças de conteúdo de edição SHALL conflitar.

#### Scenario: Conflito ou tarefa ausente
- **WHEN** a revisão-base de edição fica antiga por mudança estrutural/de campo ou a tarefa deixa de existir
- **THEN** save não sobrescreve/recria dados; mensagem focável mantém preenchimento e oferece conferência da lista/versão atual
- **AND** recarregar substituindo draft exige confirmação e continuar revisando não autoriza reenvio com revisão silenciosamente atualizada

#### Scenario: Falha e possível commit
- **WHEN** save falha com recusa confirmada ou a resposta se perde depois de possível commit
- **THEN** draft permanece; resultado incerto exige ressync e nova decisão explícita, sem replay ou inferência por título
- **AND** controles ocupados impedem dupla ação e sucesso só é anunciado após confirmação

### Requirement: Seletor de status conserva interação por teclado

Setas, Home, End, PageUp e PageDown SHALL escolher sem gravar. Enter e saída de foco SHALL confirmar status simples; Escape SHALL descartar escolha pendente; ponteiro SHALL confirmar imediatamente. CANCELLED recorrente por Enter/ponteiro SHALL pedir SKIP/END; por saída de foco SHALL restaurar seleção sem diálogo/comando. Controles ocupados SHALL conservar foco com aria-disabled e ignorar novos comandos. Confirmar por saída de foco SHALL não roubar foco válido já movido.

#### Scenario: Escolha confirmar e reverter
- **WHEN** o usuário navega pelo seletor e usa Enter, saída de foco ou Escape
- **THEN** somente a confirmação pertinente emite comando e Escape retorna ao status atual sem write
- **AND** CANCELLED recorrente por focusout restaura seleção e não emite comando nem abre diálogo

#### Scenario: Ocupado e foco externo
- **WHEN** a ação está em curso ou confirmação começou por saída de foco para outro controle
- **THEN** não há novo comando e foco válido permanece no controle em que o usuário chegou

#### Scenario: Escolha de série
- **WHEN** Enter/ponteiro/save pede cancelamento recorrente e diálogo é confirmado ou abandonado
- **THEN** somente SKIP/END válido autoriza escrita, abandoná-lo conserva dados/draft e foco retorna ao controle pertinente

### Requirement: Foco e semântica acessível são preservados

Interface SHALL manter rótulos/headings/erros/status/alert/foco visível. Form SHALL conservar destinos atuais; lixeira/undo e backup SHALL recuperar origem/alerta/vizinho/Voltar/ação principal pertinentes sem body. Busy SHALL permanecer focável; oferta nova SHALL não roubar foco.

#### Scenario: Formulário e erro
- **WHEN** criação/edição abre, validação falha ou formulário fecha
- **THEN** foco segue título/primeiro inválido/alerta/Nova tarefa conforme a ação, com mensagem associada ao campo

#### Scenario: Cartão permanece ou desaparece
- **WHEN** uma ação muda status e a tarefa permanece, sai do filtro ou falha
- **THEN** foco vai ao controle equivalente; se sumiu, a Editar do vizinho/último ou Limpar filtros; se falhou, ao controle de origem
- **AND** IDs históricos usados para localizar controles não quebram seletores nem levam foco ao body

#### Scenario: Lixeira undo e controle removido externamente
- **WHEN** remoção/restauração/undo ocorre ou snapshot remove o controle de origem durante confirmação
- **THEN** destino seguro usa controle equivalente/vizinho/último/Voltar ou Editar/ação principal segundo estado, nunca body ou seletor quebrado por ID histórico
- **AND** filtros são preservados, busy permanece focável e oferta nova não rouba foco

#### Scenario: Área de backup e modais nativos
- **WHEN** usuário abre/volta/seleciona/cancela/confirma ou base fica stale enquanto há preview
- **THEN** foco usa título/seletor/origem/alerta/Voltar seguros e aria-disabled impede dupla ação sem perder foco
- **AND** Escape abandona confirmação sem gravar e filtros/ordem permanecem

### Requirement: Identidade e limites temporários são visíveis com clareza

Interface SHALL preservar identidade/cores/rótulos/cartões e acessibilidade em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer/Backup SHALL ter controles autorizados; recursos posteriores SHALL não ser montados. Recorrência/subtarefas/lembretes SHALL ser editáveis sob contratos do proprietário; bandeja/saída/startup SHALL ter comunicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, prazo/status/fechamento/geração seguem validação e liquidação atômicas, com agenda real; edição independente conserva markers e retirada de regra conserva dados pertinentes
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir/Lixeira/Desfazer/Backup estão disponíveis conforme contratos; edição/agendamento de lembretes e opções de ciclo de vida estão disponíveis; captura copiada/Quick Add/atalhos e hints efetivos estão disponíveis; não há IA
- **AND** origem salva oferece somente a ação específica de abertura, sem preview, fetch ou abertura de URL não salva

#### Scenario: Dimensões contraste e texto
- **WHEN** janela mínima/normal/maximizada, zoom 200%, escala Windows ou conteúdo longo é exercitado
- **THEN** rótulos/ações permanecem acessíveis por teclado e rolagem, texto não elimina controles e contrastes preservam texto 4,5:1 e foco 3:1

#### Scenario: Política da exclusão é comunicada
- **WHEN** usuário abre confirmação recuperável ou irreversível
- **THEN** retenção30×24h, limite100, descartes irreversíveis/relógio recuado e efeito da portadora são explicados conforme ação
- **AND** restauração não é anunciada como geração/agendamento e undo temporário não é descrito como histórico persistente

#### Scenario: Backup explica substituição e exclusões
- **WHEN** prévia apresenta counts/versões/data ou arquivo vazio
- **THEN** UI explica substituição total irreversível sem undo, preservação da trash atual e ausência de trash/credenciais/desfazer no arquivo
- **AND** exportação preventiva é opcional; JSON não criptografado e recurso indisponível não são anunciados como migração completa

#### Scenario: Formulário de lembretes e foco de ativação
- **WHEN** usuário adiciona/edita/remove AT/OFFSET ou abre tarefa pela notificação com filtros/draft em curso
- **THEN** controles/presets/limites/erros por item seguem teclado/foco da origem e localização mantém draft/filtros sem editor destrutivo
- **AND** estados indisponíveis e política de fechar/Sair/recuperar em5min são anunciados dentro da janela

#### Scenario: Captura preserva área e criação alheia
- **WHEN** captura chega durante form/conflito/trash/backup/confirmação/localização de lembrete, ou Quick Add confirma criação
- **THEN** manager conserva campos/base/filtros/scroll/área e mantém captura como oferta sem merge
- **AND** Revisar exige estado seguro e voltar à lista não aplica oferta automaticamente; ack rápido não fecha editor do manager

### Requirement: Evidências distinguem componente e produto empacotado

Validação SHALL rastrear G01–G20/R01–V01/L01–L12/B01–B14/M01–M12 e medir produto real com volumes existentes. Arquivos/bridge/duas sessões SHALL ter evidência distinta de mocks; diálogos nativos SHALL ter prova Windows própria. D10 e acessibilidade pendentes SHALL permanecer identificados, sem inferir prova nativa de instalação/notificações/login ou relaxar budgets.

#### Scenario: Volume e ações reais
- **WHEN** os dois volumes são medidos e comandos passam pela UI/preload/main/persistência no pacote
- **THEN** tempos de montagem/consultas/heartbeat, hardware/runtime/bytes e resultados de foco/convergência são registrados contra os orçamentos propostos
- **AND** falha exige revisão da abordagem, sem esconder registros ou anunciar que velocidade do banco comprova responsividade da UI
- **AND** falha D10 histórica é distinguida de resultado atual/regressão nova sem retirar o gate ou virtualizar automaticamente

#### Scenario: Fechar e reabrir
- **WHEN** janela principal fecha com unidade admitida e o pacote reabre
- **THEN** a base conserva estado confirmado integral e sessões anteriores são invalidadas; close com bandeja mantém owner e Sair encerra processo
- **AND** draft/filtros são conservados em memória no close, mas não são anunciados como persistidos após saída/crash; transientes de undo/backup não retornam

#### Scenario: Lixeira undo e reservas no pacote
- **WHEN** produto fictício testa retenção/confirm/duas sessões/undo de série/crash/respostas tardias e reservas de memória
- **THEN** evidência registra runtime/configuração/bytes/charge/heap/latência/foco e estado inteiro em reopen
- **AND** D10 500/250 ms e referência100 ms continuam retidos; medições anteriores 661,6/636,1/141,7 ms não são chamadas sucesso novo

#### Scenario: Backup no produto e diálogo real
- **WHEN** harness testa I/O/preview/CAS/epoch/late ack e roteiro Windows usa diálogo nativo por teclado
- **THEN** relatório distingue serviços/arquivos/bridge reais de escolha stub e de execução manual nativa
- **AND** sem roteiro nativo executado não se declara essa aceitação; pacote/build não prova Setup/notificações/bandeja
