# Spec Delta

## Purpose

Permitir gerenciamento básico de tarefas locais com paridade de campos, consultas e interação acessível, preservando dados e rascunhos diante de falhas e concorrência e delimitando recursos avançados ainda indisponíveis.

## ADDED Requirements

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

Editar SHALL conservar identidade, criação e campos não alterados, inclusive avançados e valores históricos aceitos pelo armazenamento. Limpeza de opcionais SHALL depender de intenção explícita. Campos novos/alterados SHALL receber validação básica; limites de formulário SHALL não ser impostos retroativamente a campos históricos intactos. Cancelar SHALL não gravar.

#### Scenario: Editar e cancelar
- **WHEN** o usuário muda campos básicos e salva, ou cancela o formulário
- **THEN** o save confirmado preserva id/createdAt e atualiza auditoria coerente; cancelar conserva a tarefa e retorna foco a Nova tarefa

#### Scenario: Dados históricos e precisão
- **WHEN** há valor histórico longo, prazo com segundos/milissegundos, subtarefas ou lembretes e o usuário edita campo independente
- **THEN** os valores não alterados permanecem integrais, sem corte, revalidação retroativa ou limpeza por omissão
- **AND** falha de orçamento de transporte preserva banco e preenchimento

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
- **WHEN** uma substring com caixa diferente aparece em qualquer campo pesquisado, inclusive subtarefa somente leitura
- **THEN** a tarefa corresponde ao termo conforme a comparação da origem

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

Entrada SHALL representar data/hora local do SO, exibição SHALL usar pt-BR e armazenamento SHALL usar ISO UTC. Prazo não editado SHALL conservar seu ISO/precisão. Datas impossíveis e gaps SHALL ser recusados; hora repetida nova SHALL seguir a escolha anterior da conversão local da origem. Mudança de fuso durante edição do prazo SHALL exigir revisão explícita antes do save.

#### Scenario: Prazo não alterado
- **WHEN** o usuário edita outro campo de tarefa cujo prazo inclui segundos/milissegundos ou pertence à segunda ocorrência de hora repetida
- **THEN** o prazo original não é reconvertido pelo input de minutos nem deslocado

#### Scenario: Calendário e transições
- **WHEN** há data impossível, leap day válido, horário inexistente ou horário repetido novo
- **THEN** datas impossíveis/gaps falham, dia válido é aceito e repetição nova usa o instante escolhido pela conversão local preservada
- **AND** não se fixa offset -03:00 ou America/Sao_Paulo no produto

#### Scenario: Fuso muda com formulário aberto
- **WHEN** o fuso corrente diverge do capturado ao abrir e há alteração pendente do prazo
- **THEN** o draft é conservado, save é bloqueado e o usuário deve revisar/confirmar o horário no novo fuso ou restaurar o prazo salvo
- **AND** edição independente com prazo intacto pode conservar o ISO original

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

Falha de validação/escrita, CONFLICT, NOT_FOUND ou resultado incerto SHALL conservar draft e base da edição. Atualização externa SHALL não sobrescrever inputs. Conflito SHALL oferecer revisão da versão atual e descarte explicitamente confirmado, sem merge automático ou troca silenciosa da base. Escrita simultânea repetida na mesma interação SHALL ser impedida.

#### Scenario: Conflito ou tarefa ausente
- **WHEN** a revisão-base fica antiga ou a tarefa deixa de existir
- **THEN** save não sobrescreve/recria dados; mensagem focável mantém preenchimento e oferece conferência da lista/versão atual
- **AND** recarregar substituindo draft exige confirmação e continuar revisando não autoriza reenvio com revisão silenciosamente atualizada

#### Scenario: Falha e possível commit
- **WHEN** save falha com recusa confirmada ou a resposta se perde depois de possível commit
- **THEN** draft permanece; resultado incerto exige ressync e nova decisão explícita, sem replay ou inferência por título
- **AND** controles ocupados impedem dupla ação e sucesso só é anunciado após confirmação

### Requirement: Seletor de status conserva interação por teclado

Setas, Home, End, PageUp e PageDown SHALL escolher sem gravar. Enter e saída de foco SHALL confirmar; Escape SHALL descartar escolha pendente; ponteiro SHALL confirmar imediatamente. Controles ocupados SHALL conservar foco com aria-disabled e ignorar novos comandos. Confirmar por saída de foco SHALL não roubar foco válido já movido.

#### Scenario: Escolha confirmar e reverter
- **WHEN** o usuário navega pelo seletor e usa Enter, saída de foco ou Escape
- **THEN** somente a confirmação emite comando e Escape retorna ao status atual sem write

#### Scenario: Ocupado e foco externo
- **WHEN** a ação está em curso ou confirmação começou por saída de foco para outro controle
- **THEN** não há novo comando e foco válido permanece no controle em que o usuário chegou

### Requirement: Foco e semântica acessível são preservados

A interface SHALL manter rótulos/for, hierarquia h1/h2/h3, nomes acessíveis das ações por tarefa, aria-invalid/describedby, feedback status/alert e foco visível. Formulário SHALL focar título inicial/primeiro erro; fechar SHALL retornar a Nova tarefa. Ações SHALL recuperar controle equivalente ou vizinho pertinente quando o cartão desaparece dos resultados.

#### Scenario: Formulário e erro
- **WHEN** criação/edição abre, validação falha ou formulário fecha
- **THEN** foco segue título/primeiro inválido/alerta/Nova tarefa conforme a ação, com mensagem associada ao campo

#### Scenario: Cartão permanece ou desaparece
- **WHEN** uma ação muda status e a tarefa permanece, sai do filtro ou falha
- **THEN** foco vai ao controle equivalente; se sumiu, a Editar do vizinho/último ou Limpar filtros; se falhou, ao controle de origem
- **AND** IDs históricos usados para localizar controles não quebram seletores nem levam foco ao body

### Requirement: Identidade e limites temporários são visíveis com clareza

A interface SHALL preservar identidade, cores, rótulos e conteúdo básico dos cartões, sem redesign ou novas colunas. Janela mínima/normal/maximizada, zoom 200% e escala Windows SHALL manter acesso às ações. Controles futuros SHALL não ser montados. Dados avançados existentes SHALL ser conservados e restrições temporárias SHALL ter explicação acessível, também aplicada pelo proprietário.

#### Scenario: Recorrência subtarefas e lembretes existentes
- **WHEN** snapshot contém recorrência, subtarefas ou lembretes
- **THEN** recorrência presente torna mutações indisponíveis; subtarefas podem ser lidas/pesquisadas sem toggle/reordenação; lembretes são preservados e mudança efetiva de prazo/status é bloqueada
- **AND** campos básicos independentes de tarefa sem recorrência podem ser editados sem apagar os avançados

#### Scenario: Recursos posteriores ausentes
- **WHEN** o gerenciamento básico é aberto
- **THEN** não há Excluir, Lixeira, Desfazer, Backup/Restaurar, recorrência/subtarefas editáveis, lembretes, captura/Quick Add/atalhos/hints ou IA
- **AND** origem salva oferece somente a ação específica de abertura, sem preview, fetch ou abertura de URL não salva

#### Scenario: Dimensões contraste e texto
- **WHEN** janela mínima/normal/maximizada, zoom 200%, escala Windows ou conteúdo longo é exercitado
- **THEN** rótulos/ações permanecem acessíveis por teclado e rolagem, texto não elimina controles e contrastes preservam texto 4,5:1 e foco 3:1

### Requirement: Evidências distinguem componente e produto empacotado

A validação SHALL rastrear G01–G20 a cenários/testes, medir responsividade com 1.000/10.000 tarefas fictícias e exercer criar/editar/status/reopen/offline na UI real inscrita do pacote. Nenhum limite de volume SHALL truncar tarefas. Mocks, build e smoke de renderer SHALL não comprovar Setup, notificações, bandeja ou atalhos.

#### Scenario: Volume e ações reais
- **WHEN** os dois volumes são medidos e comandos básicos passam pela UI/preload/main/persistência no pacote
- **THEN** tempos de montagem/consultas/heartbeat, hardware/runtime/bytes e resultados de foco/convergência são registrados contra os orçamentos propostos
- **AND** falha exige revisão da abordagem, sem esconder registros ou anunciar que velocidade do banco comprova responsividade da UI

#### Scenario: Fechar e reabrir
- **WHEN** janela principal fecha com unidade admitida e o pacote reabre
- **THEN** a base conserva estado confirmado integral e sessões anteriores são invalidadas, sem bandeja/processo residual
- **AND** draft/filtros são transitórios e não são anunciados como persistidos após saída ou crash
