# Spec Delta

## MODIFIED Requirements

### Requirement: Identidade e limites temporários são visíveis com clareza

Interface SHALL preservar identidade/cores/rótulos/cartões e acessibilidade em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer/Backup SHALL ter controles autorizados; funcionalidades não aprovadas SHALL não ser montadas. Recorrência/subtarefas/lembretes SHALL ser editáveis sob contratos do proprietário; bandeja/saída/startup SHALL ter comunicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, prazo/status/fechamento/geração seguem validação e liquidação atômicas, com agenda real; edição independente conserva markers e retirada de regra conserva dados pertinentes
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir/Lixeira/Desfazer/Backup estão disponíveis conforme contratos; edição/agendamento de lembretes e opções de ciclo de vida estão disponíveis; captura copiada/Quick Add/atalhos e hints efetivos estão disponíveis; IA opcional no gerenciador segue os contratos de provedores e sugestão, com prévia/consentimento/revisão e sem aplicação automática ou IA no Quick Add
- **AND** sem configuração ou gesto/consentimento não há envio à IA; sua indisponibilidade não impede o gerenciamento local
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

Validação SHALL rastrear G01–G20/R01–V01/L01–L12/B01–B14/M01–M12/Q01–Q14/AI01–AI15/H01–H16 e medir produto real com volumes existentes. Arquivos/bridge/duas sessões SHALL ter evidência distinta de mocks; diálogos nativos SHALL ter prova Windows própria. D10 vigente SHALL ser medido e lacunas de acessibilidade SHALL permanecer identificadas, sem inferir prova nativa de instalação/notificações/login ou relaxar budgets.

#### Scenario: Volume e ações reais
- **WHEN** os dois volumes são medidos e comandos passam pela UI/preload/main/persistência no pacote
- **THEN** tempos de montagem/consultas/heartbeat, hardware/runtime/bytes e resultados de foco/convergência são registrados contra os orçamentos aprovados
- **AND** falha exige revisão da abordagem, sem esconder registros ou anunciar que velocidade do banco comprova responsividade da UI
- **AND** falha D10 histórica é distinguida de resultado atual/regressão nova sem retirar o gate ou virtualizar automaticamente

#### Scenario: Fechar e reabrir
- **WHEN** janela principal fecha com unidade admitida e o pacote reabre
- **THEN** a base conserva estado confirmado integral e sessões anteriores são invalidadas; close com bandeja mantém owner e Sair encerra processo
- **AND** draft/filtros são conservados em memória no close, mas não são anunciados como persistidos após saída/crash; transientes de undo/backup não retornam

#### Scenario: Lixeira undo e reservas no pacote
- **WHEN** produto fictício testa retenção/confirm/duas sessões/undo de série/crash/respostas tardias e reservas de memória
- **THEN** evidência registra runtime/configuração/bytes/charge/heap/latência/foco e estado inteiro em reopen
- **AND** D10 usa montagem/interações p95/heartbeat de 2s/500ms/250ms em1.000 e 8s/2.500ms/2.500ms em10.000; subcontroles p95<=500ms e cartões exatos nos dois volumes
- **AND** página/mutação representativa do banco conserva p95<=100ms e preflight<=5s; grandes commits/varreduras são medidos separadamente, sem dividir unidades ou truncar dados
- **AND** medições históricas 661,6/636,1/141,7ms e falhas/repetições posteriores conservam data/candidato/contexto, sem serem anunciadas como resultado atual

#### Scenario: Backup no produto e diálogo real
- **WHEN** harness testa I/O/preview/CAS/epoch/late ack e roteiro Windows usa diálogo nativo por teclado
- **THEN** relatório distingue serviços/arquivos/bridge reais de escolha stub e de execução manual nativa
- **AND** sem roteiro nativo executado não se declara essa aceitação; pacote/build não prova Setup/notificações/bandeja

#### Scenario: Entradas e IA no pacote integrado
- **WHEN** Quick Add/captura/atalhos e sugestão de IA são exercitados com fixtures no candidato
- **THEN** relatório distingue clipboard/registro/foco observados de portas falsas, prévia/cancelamento/late response de chamadas reais a provedor
- **AND** teste de IA não salva tarefa nem inclui credencial/conteúdo em evidência; Q13 antigo e AI16 dispensados não são exigidos novamente ou marcados PASS

#### Scenario: Geometria e acessibilidade da janela atual
- **WHEN** candidato com a geometria integrada abre o gerenciador, passa por hide/show, novo lançamento ou recriação
- **THEN** a evidência compara bounds com o workArea primário, borda direita/altura útil/largura de um terço com clamp e preservação da sessão viva
- **AND** distingue Quick Add480x560, zoom200 e verificação roteirizada de leitor de tela/DPI/multimonitor realmente observados

