# Spec Delta

## MODIFIED Requirements

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

### Requirement: Pesquisa preserva campos e comparação

A pesquisa SHALL combinar substring com trim e caixa ignorada em título, descrição, solicitante, responsável, tags e títulos de subtarefas existentes. Ela SHALL não remover acentos, tokenizar palavras ou incluir sourceUrl. Termo vazio SHALL corresponder a todas as tarefas disponíveis.

#### Scenario: Correspondência nos campos atuais
- **WHEN** uma substring com caixa diferente aparece em qualquer campo pesquisado, inclusive subtarefa editável
- **THEN** a tarefa corresponde ao termo conforme a comparação da origem, também após save confirmado de título de subtarefa

#### Scenario: Acentos e URL
- **WHEN** o termo só corresponderia após remover acento, separar palavras ou pesquisar sourceUrl
- **THEN** essas ampliações não produzem correspondência

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

### Requirement: Identidade e limites temporários são visíveis com clareza

A interface SHALL preservar identidade, cores, rótulos e conteúdo básico dos cartões, sem redesign ou novas colunas. Janela mínima/normal/maximizada, zoom 200% e escala Windows SHALL manter acesso às ações. Controles futuros SHALL não ser montados. Recorrência/subtarefas SHALL ter controles autorizados; lembretes existentes SHALL ser conservados e restrições de prazo/status/fechamento-geração SHALL ter explicação acessível e guarda no proprietário.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** regra e lista podem ser editadas conforme seus contratos, subtarefas podem ser marcadas/reordenadas e lembretes permanecem íntegros
- **AND** com lembretes, mudança efetiva de prazo/status ou fechamento/geração é bloqueada; edições independentes, regra sem fechamento e retirada isolada da regra conservando prazo/status são permitidas
- **AND** AT continua incompatível com adicionar recorrência e marcação não aciona serviços de lembretes

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento é aberto
- **THEN** não há Excluir, Lixeira, Desfazer, Backup/Restaurar, edição/agendamento de lembretes, captura/Quick Add/atalhos/hints ou IA
- **AND** origem salva oferece somente a ação específica de abertura, sem preview, fetch ou abertura de URL não salva

#### Scenario: Dimensões contraste e texto
- **WHEN** janela mínima/normal/maximizada, zoom 200%, escala Windows ou conteúdo longo é exercitado
- **THEN** rótulos/ações permanecem acessíveis por teclado e rolagem, texto não elimina controles e contrastes preservam texto 4,5:1 e foco 3:1

### Requirement: Evidências distinguem componente e produto empacotado

A validação SHALL rastrear G01–G20 e R01–V01 a cenários/testes, medir responsividade com 1.000/10.000 tarefas fictícias e exercer criar/editar/status/recorrência/subtarefas/reopen/offline na UI real inscrita do pacote. Nenhum limite de volume SHALL truncar tarefas. D10 herdado SHALL permanecer medido e identificado quando reprovado. Mocks, build e smoke de renderer SHALL não comprovar Setup, notificações, bandeja ou atalhos.

#### Scenario: Volume e ações reais
- **WHEN** os dois volumes são medidos e comandos passam pela UI/preload/main/persistência no pacote
- **THEN** tempos de montagem/consultas/heartbeat, hardware/runtime/bytes e resultados de foco/convergência são registrados contra os orçamentos propostos
- **AND** falha exige revisão da abordagem, sem esconder registros ou anunciar que velocidade do banco comprova responsividade da UI
- **AND** falha D10 histórica é distinguida de resultado atual/regressão nova sem retirar o gate ou virtualizar automaticamente

#### Scenario: Fechar e reabrir
- **WHEN** janela principal fecha com unidade admitida e o pacote reabre
- **THEN** a base conserva estado confirmado integral e sessões anteriores são invalidadas, sem bandeja/processo residual
- **AND** draft/filtros/expansão são transitórios e não são anunciados como persistidos após saída ou crash
