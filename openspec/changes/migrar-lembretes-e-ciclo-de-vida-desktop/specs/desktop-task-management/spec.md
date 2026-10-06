# Spec Delta

## MODIFIED Requirements

### Requirement: Identidade e limites temporários são visíveis com clareza

Interface SHALL preservar identidade/cores/rótulos/cartões e acessibilidade em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer/Backup SHALL ter controles autorizados; recursos posteriores SHALL não ser montados. Recorrência/subtarefas/lembretes SHALL ser editáveis sob contratos do proprietário; bandeja/saída/startup SHALL ter comunicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, prazo/status/fechamento/geração seguem validação e liquidação atômicas, com agenda real; edição independente conserva markers e retirada de regra conserva dados pertinentes
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir/Lixeira/Desfazer/Backup estão disponíveis conforme contratos; edição/agendamento de lembretes e opções de ciclo de vida estão disponíveis; não há captura/Quick Add/atalhos/hints ou IA
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
