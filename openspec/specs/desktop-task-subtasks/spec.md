# desktop-task-subtasks Specification

## Purpose
Permitir organizar passos de tarefas locais em uma lista ordenada de um nível, mantendo marcações independentes e atuais diante de edições concorrentes, com progresso derivado e interação acessível.

## Requirements

### Requirement: Lista tem um nível limites e identidades locais

Tarefa SHALL aceitar até 20 subtarefas de um nível; título novo/renomeado SHALL usar trim e 1–200 caracteres. IDs SHALL ser únicos dentro da tarefa; títulos iguais SHALL ser permitidos. Subtarefa SHALL não ter status/prazo/reminder/filhos. IDs novos SHALL vir da autoridade; IDs de edição SHALL pertencer à lista atual.

#### Scenario: Lista vazia limites e títulos
- **WHEN** draft tem 0/20/21 itens ou título vazio/200/201 após trim
- **THEN** 0/20 e títulos 1–200 são válidos; excedente/vazio falha com erro de lista/índice, mantendo draft

#### Scenario: IDs e profundidade
- **WHEN** há ID vazio/repetido/desconhecido, ID em criação ou campo de status/prazo/children
- **THEN** request inválido ou draft inválido é recusado com código pertinente sem gravar
- **AND** mesmo ID em tarefas distintas não é colisão local e títulos iguais são aceitos

### Requirement: Formulário conserva marcações atuais e intenção de lista

Criação SHALL enviar somente títulos. Edição SHALL enviar id/título em ordem sem done, usando os valores de marcação atuais no proprietário. Lista omitida SHALL conservar e [] SHALL limpar. Itens novos SHALL começar desmarcados; item removido SHALL não ressurgir por base stale. Histórico intacto SHALL não sofrer limite retroativo de título.

#### Scenario: Omitir limpar adicionar e reordenar
- **WHEN** edição omite lista, envia [], adiciona sem ID ou reordena IDs existentes
- **THEN** respectivamente conserva, limpa, cria desmarcada ou muda ordem mantendo done dos itens atuais

#### Scenario: Histórico intacto e ID removido
- **WHEN** título histórico longo não muda numa reordenação, ou draft tenta usar ID removido por outra edição
- **THEN** título intacto permanece e ID removido não é recriado; base estrutural antiga conflita ou ID desconhecido com base atual é recusado

### Requirement: Save tolera apenas marcações concorrentes

Save SHALL continuar aplicável após alterações somente de done, preservando marcações recentes. Alterações de campos/IDs/títulos/ordem/regra/status SHALL invalidar revisão de edição anterior. Formulário SHALL não atualizar silenciosamente sua base nem fazer merge/rebase geral. Toggle SHALL continuar sendo conteúdo de usuário para revisão completa e futuro undo.

#### Scenario: Check seguido de save
- **WHEN** uma superfície marca item enquanto outra edita título e salva com a mesma revisão de edição
- **THEN** save confirma o título e conserva done lido atualmente, sem desfazer a marcação ou pedir conflito apenas por ela

#### Scenario: Estrutura mudou e voltou
- **WHEN** outra superfície muda campo/ordem/lista e depois retorna ao valor anterior
- **THEN** a base de edição antiga conflita; igualdade de conteúdo final/timestamp não autoriza sobrescrever

#### Scenario: Claim e revisão completa
- **WHEN** ocorre claim isolado ou toggle antes de uma futura reversão por conteúdo
- **THEN** claim não invalida conteúdo/edição; toggle altera conteúdo completo e pode bloquear undo sem impedir save por revisão de edição

### Requirement: Marcação expressa intenção e independe do status

Marcação SHALL enviar boolean done desejado e alterar apenas o item, updatedAt e revisão completa de conteúdo. SHALL funcionar em TODO/IN_PROGRESS/DONE/CANCELLED sem alterar status, completedAt, prazo, regra ou lembretes. Intenção já satisfeita SHALL ser no-op; base estrutural stale e item ausente SHALL ter erros seguros.

#### Scenario: Quatro status e no-op
- **WHEN** item é marcado/desmarcado nos quatro status ou recebe seu valor atual
- **THEN** somente alteração efetiva muda done/updatedAt/conteúdo, e status/prazo/regra/reminders/completedAt permanecem; no-op não grava/eventa

#### Scenario: Intenções concorrentes
- **WHEN** duas sessões marcam itens diferentes ou enviam booleans sucessivos para o mesmo item com revisão de edição atual
- **THEN** decisões serializadas conservam os outros itens e a última intenção aplicável do mesmo item, sem inversão baseada em snapshot stale

#### Scenario: Item ausente e estrutura stale
- **WHEN** item falta com base atual ou tarefa mudou estruturalmente desde a base
- **THEN** retorna SUBTASK_NOT_FOUND ou CONFLICT, conserva dados e não marca outro item com ID semelhante

### Requirement: Ordem e progresso são observáveis sem acoplamento

Ordem manual SHALL ser conservada em save/reopen; progresso SHALL ser derivado como done/total, sem contador persistido. Concluir/reabrir tarefa SHALL não alterar checks nem depender de todos marcados. Próxima ocorrência SHALL reiniciar marcações e IDs mantendo títulos/ordem.

#### Scenario: Progresso e status
- **WHEN** 0, alguns ou todos os itens são marcados, ou tarefa conclui/reabre
- **THEN** progresso corresponde ao snapshot e status/marks seguem ações independentes, sem conclusão automática

#### Scenario: Reopen e próxima
- **WHEN** banco reabre depois de reordenar ou nova ocorrência é gerada
- **THEN** reopen conserva ordem/marks e a próxima conserva títulos/ordem com novos IDs e todos desmarcados

### Requirement: Controles preservam foco teclado e erro

Lista de formulário SHALL permitir adicionar/remover/mover com controles acessíveis por teclado e erros associados ao índice. Cartão SHALL ter expansão transitória por superfície e checkbox ocupado focável que impede dupla ação. Estado confirmado SHALL vir do snapshot; falha SHALL conservar preenchimento/foco pertinente e não anunciar marcação não confirmada.

#### Scenario: Editar e mover por teclado
- **WHEN** usuário adiciona/remove/reordena e submete item inválido sem ponteiro
- **THEN** ordem/ação são acessíveis, rótulos e posição são claros e foco vai ao primeiro erro pertinente

#### Scenario: Expandir ocupado e falha
- **WHEN** cartão expande, checkbox espera resposta ou marcação falha
- **THEN** expansão não grava preferência, controle usa aria-disabled conservando foco e falha retorna ao controle/alerta sem sucesso falso
- **AND** remoção do cartão pelos filtros segue foco de vizinho pertinente sem body
