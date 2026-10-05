# Spec Delta

## MODIFIED Requirements

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

Interface SHALL preservar identidade/cores/rótulos/cartões e acessibilidade em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer/Backup SHALL ter controles autorizados; recursos posteriores SHALL não ser montados. Recorrência/subtarefas e guards de lembretes SHALL continuar no proprietário com explicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, mudança efetiva de prazo/status ou fechamento/geração é bloqueada; edições independentes, regra sem fechamento e retirada isolada da regra conservando prazo/status são permitidas
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir/Lixeira/Desfazer/Backup estão disponíveis conforme contratos; não há edição/agendamento de lembretes, captura/Quick Add/atalhos/hints ou IA
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

### Requirement: Evidências distinguem componente e produto empacotado

Validação SHALL rastrear G01–G20/R01–V01/L01–L12/B01–B14 e medir produto real com volumes existentes. Arquivos/bridge/duas sessões SHALL ter evidência distinta de mocks; diálogos nativos SHALL ter prova Windows própria. D10 e acessibilidade pendentes SHALL permanecer identificados, sem inferir instalador/scheduler ou relaxar budgets.

#### Scenario: Volume e ações reais
- **WHEN** os dois volumes são medidos e comandos passam pela UI/preload/main/persistência no pacote
- **THEN** tempos de montagem/consultas/heartbeat, hardware/runtime/bytes e resultados de foco/convergência são registrados contra os orçamentos propostos
- **AND** falha exige revisão da abordagem, sem esconder registros ou anunciar que velocidade do banco comprova responsividade da UI
- **AND** falha D10 histórica é distinguida de resultado atual/regressão nova sem retirar o gate ou virtualizar automaticamente

#### Scenario: Fechar e reabrir
- **WHEN** janela principal fecha com unidade admitida e o pacote reabre
- **THEN** a base conserva estado confirmado integral e sessões anteriores são invalidadas, sem bandeja/processo residual
- **AND** draft/filtros/expansão são transitórios e não são anunciados como persistidos após saída ou crash

#### Scenario: Lixeira undo e reservas no pacote
- **WHEN** produto fictício testa retenção/confirm/duas sessões/undo de série/crash/respostas tardias e reservas de memória
- **THEN** evidência registra runtime/configuração/bytes/charge/heap/latência/foco e estado inteiro em reopen
- **AND** D10 500/250 ms e referência100 ms continuam retidos; medições anteriores 661,6/636,1/141,7 ms não são chamadas sucesso novo

#### Scenario: Backup no produto e diálogo real
- **WHEN** harness testa I/O/preview/CAS/epoch/late ack e roteiro Windows usa diálogo nativo por teclado
- **THEN** relatório distingue serviços/arquivos/bridge reais de escolha stub e de execução manual nativa
- **AND** sem roteiro nativo executado não se declara essa aceitação; pacote/build não prova Setup/notificações/bandeja

