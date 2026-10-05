# Spec Delta

## MODIFIED Requirements

### Requirement: Foco e semântica acessível são preservados

A interface SHALL manter rótulos/for, h1/h2/h3, nomes das ações, aria-invalid/describedby, status/alert e foco visível. Form SHALL focar título/primeiro erro e fechar retornar a Nova tarefa. Lixeira/undo SHALL recuperar origem/vizinho/último/Voltar ou Editar/ação principal pertinentes, sem roubar foco ao apresentar oferta.

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

### Requirement: Identidade e limites temporários são visíveis com clareza

Interface SHALL preservar identidade/cores/rótulos/cartões sem redesign/novas colunas e manter ações acessíveis em janela mínima/zoom200/escala. Excluir/Lixeira/Desfazer SHALL ter controles reais autorizados; recursos posteriores SHALL não ser montados. Recorrência/subtarefas e restrições de lembretes SHALL conservar guarda no proprietário e explicação acessível.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, mudança efetiva de prazo/status ou fechamento/geração é bloqueada; edições independentes, regra sem fechamento e retirada isolada da regra conservando prazo/status são permitidas
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** Excluir, Lixeira e Desfazer estão disponíveis conforme seus contratos; não há Backup/Restaurar backup, edição/agendamento de lembretes, captura/Quick Add/atalhos/hints ou IA
- **AND** origem salva oferece somente a ação específica de abertura, sem preview, fetch ou abertura de URL não salva

#### Scenario: Dimensões contraste e texto
- **WHEN** janela mínima/normal/maximizada, zoom 200%, escala Windows ou conteúdo longo é exercitado
- **THEN** rótulos/ações permanecem acessíveis por teclado e rolagem, texto não elimina controles e contrastes preservam texto 4,5:1 e foco 3:1

#### Scenario: Política da exclusão é comunicada
- **WHEN** usuário abre confirmação recuperável ou irreversível
- **THEN** retenção30×24h, limite100, descartes irreversíveis/relógio recuado e efeito da portadora são explicados conforme ação
- **AND** restauração não é anunciada como geração/agendamento e undo temporário não é descrito como histórico persistente

### Requirement: Evidências distinguem componente e produto empacotado

Validação SHALL rastrear G01–G20, R01–V01 e L01–L12 e medir 1.000/10.000 tarefas+100 trash na UI real inscrita do pacote. Ações autorizadas/reopen/offline/duas sessões SHALL ter evidência distinta de mocks. D10 herdado e prova humana SHALL continuar identificados quando pendentes; não truncar ou inferir Setup/notificações/bandeja/atalhos por build.

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
