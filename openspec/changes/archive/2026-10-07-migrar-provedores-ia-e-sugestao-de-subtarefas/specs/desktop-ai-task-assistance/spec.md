# Spec Delta

## Purpose

Definir a assistência opcional de IA no formulário de tarefa do manager: quando é oferecida, exatamente qual conteúdo sai do dispositivo, como é pré-visualizado e consentido, como a saída é validada e revisada e como cancelamento ou mudança de configuração descartam o resultado.

## ADDED Requirements

### Requirement: Assistência opcional e indisponível sem provedor

A assistência de IA SHALL ser oferecida exclusivamente no formulário de tarefa do manager; o Quick Add MUST NOT oferecer nenhuma assistência. Enquanto não houver provedor configurado, nenhum elemento SHALL ser apresentado e nenhuma requisição SHALL ocorrer. A ação de sugerir SHALL exigir título preenchido e vaga disponível, ficando indisponível com motivo legível em caso contrário.

#### Scenario: Formulário sem provedor configurado
- **WHEN** o usuário abre o formulário sem provedor salvo
- **THEN** nenhuma ação de assistência é apresentada e nenhuma requisição é realizada

#### Scenario: Título vazio ou limite atingido
- **WHEN** o título está vazio ou a tarefa já tem o máximo de subtarefas
- **THEN** a ação está indisponível com motivo legível e nenhuma requisição é realizada

#### Scenario: Consentimento ausente
- **WHEN** existe provedor configurado e falta consentimento ou autorização de origem
- **THEN** o sistema informa a necessidade e oferece o consentimento sem enviar conteúdo antes dele

### Requirement: Conteúdo enviado restrito ao título e à descrição em edição

O sistema SHALL enviar ao provedor exclusivamente o título e a descrição da tarefa em edição no momento do acionamento, acompanhados apenas das instruções fixas do TaskFlow. Nenhum outro dado SHALL ser transmitido, incluindo identificadores, prazos, lembretes, recorrência, prioridade, status, pessoas, etiquetas, URL de origem ou subtarefas existentes. Descrição acima de 1.000 caracteres SHALL ser cortada antes da composição, com aviso de corte.

#### Scenario: Somente título e descrição saem do dispositivo
- **WHEN** a tarefa em edição tem outros campos preenchidos e o envio é confirmado
- **THEN** o conteúdo transmitido contém apenas título, descrição e instruções fixas do TaskFlow

#### Scenario: Descrição longa é cortada antes do envio
- **WHEN** a descrição excede o limite de envio
- **THEN** é cortada até o limite e o sistema informa que houve corte

#### Scenario: Conteúdo reflete o formulário, não o persistido
- **WHEN** o usuário alterou título ou descrição e ainda não salvou
- **THEN** o conteúdo usa os valores atuais do formulário, nunca os persistidos

### Requirement: Prévia literal preparada no main

Antes de qualquer requisição, o main SHALL preparar e devolver o conteúdo exato que será enviado, junto da origem de destino e do aviso de corte quando houver. O texto exibido pelo renderer SHALL ser idêntico, caractere por caractere, ao texto transmitido. A preparação SHALL ser vinculada a um `requestId` da sessão e da configuração; alterar título ou descrição SHALL re-preparar e invalidar o `requestId` anterior, e preparação inválida SHALL ser recusada.

#### Scenario: Prévia apresentada com a origem
- **WHEN** o usuário aciona a sugestão com título preenchido e consentimento vigente
- **THEN** o sistema apresenta o conteúdo integral que será enviado e a origem de destino, sem requisição até a confirmação

#### Scenario: Prévia idêntica ao transmitido
- **WHEN** o usuário confirma após a prévia
- **THEN** o conteúdo transmitido é exatamente o texto apresentado pelo main

#### Scenario: Edição após a prévia invalida a preparação
- **WHEN** título ou descrição mudam depois da preparação
- **THEN** o sistema recompõe a prévia com novo `requestId` e exige nova confirmação
- **AND** sugestão com `requestId` antigo é recusada sem enviar conteúdo desatualizado

### Requirement: Consentimento de conteúdo distinto do de credencial

O envio de conteúdo de tarefa SHALL exigir consentimento explícito, distinto e independente do consentimento de credencial. O consentimento SHALL valer para a origem e a configuração vigentes, viver somente em memória no main por documento e ser invalidado por troca de origem/provedor/base, salvar/remover configuração, reload, crash ou saída. Recusa ou cancelamento não SHALL enviar nada nem alterar o formulário.

#### Scenario: Consentimento de credencial não autoriza conteúdo
- **WHEN** o teste de conexão já foi executado com sucesso e a sugestão é acionada pela primeira vez
- **THEN** o sistema exige consentimento próprio para enviar conteúdo de tarefa

#### Scenario: Troca de origem exige novo consentimento
- **WHEN** a configuração passa a apontar para outra origem e a sugestão é acionada
- **THEN** novo consentimento referente à nova origem é exigido antes do envio

#### Scenario: Recusa preserva o formulário
- **WHEN** o usuário recusa ou cancela o consentimento
- **THEN** nenhuma requisição é realizada e todos os dados digitados permanecem

### Requirement: Saída validada pelas mesmas regras da digitação manual

O sistema SHALL interpretar a resposta como lista de títulos de subtarefa, remover marcadores comuns e repetições e submeter a lista às mesmas regras da digitação manual: título obrigatório, até 200 caracteres, um nível e limite de 20 subtarefas por tarefa. Itens inválidos SHALL ser descartados sem impedir os demais; itens além das vagas restantes do formulário SHALL ser cortados com aviso. Sem item válido, o sistema SHALL informar e não alterar o formulário.

#### Scenario: Itens válidos e inválidos
- **WHEN** a resposta contém itens válidos, vazio e acima do limite de título
- **THEN** somente os válidos são propostos

#### Scenario: Vagas restantes e repetições
- **WHEN** a resposta excede as vagas restantes ou repete títulos
- **THEN** a proposta corta pelas vagas com aviso e cada título repetido aparece uma única vez

#### Scenario: Nenhum item aproveitável
- **WHEN** nenhum item válido restar
- **THEN** o sistema informa a ausência de sugestão aproveitável e o formulário permanece intacto

### Requirement: Proposta revisável que não persiste

A saída da IA SHALL ser apresentada como proposta revisável, nunca aplicada automaticamente. O usuário SHALL poder selecionar itens individualmente, editar o título antes de aceitar e descartar a proposta inteira. Aceitar SHALL somente acrescentar itens não concluídos à lista ainda não salva do formulário, sem identificadores persistidos e sem alterar ordem ou itens existentes. A IA MUST NOT gravar no armazenamento, criar, editar, concluir ou excluir tarefas, nem alterar a configuração.

#### Scenario: Aceitação parcial
- **WHEN** o usuário seleciona parte dos itens e confirma
- **THEN** somente os selecionados são acrescentados à lista do formulário, como não concluídos, preservando os existentes

#### Scenario: Edição e descarte de itens
- **WHEN** o usuário edita o título de um item ou descarta a proposta
- **THEN** o item aceito usa o título editado e o descarte deixa a lista exatamente como estava, sem gravação

#### Scenario: Nada persiste antes de salvar
- **WHEN** o usuário fecha o formulário sem salvar
- **THEN** a tarefa persistida permanece sem os itens aceitos e nenhuma escrita foi feita pela IA

#### Scenario: Gravação segue o caminho existente
- **WHEN** o usuário salva o formulário com itens aceitos
- **THEN** a tarefa é gravada pelo comando existente e a oferta de desfazer permanece disponível

### Requirement: Requisição única, limitada no tempo e cancelável

Cada acionamento SHALL produzir no máximo uma requisição, sem streaming e com teto de saída de 3.000 tokens definido pelo TaskFlow. O sistema SHALL impor limite de tempo, indicar andamento e oferecer cancelamento; cancelar SHALL descartar qualquer resposta e não alterar o formulário. Enquanto uma requisição estiver em andamento, novo acionamento SHALL ser recusado sem iniciar outra; nenhuma repetição automática SHALL ocorrer após falha.

#### Scenario: Progresso e cancelamento
- **WHEN** a requisição está em andamento e o usuário cancela
- **THEN** a operação é descartada, o cancelamento é informado e o formulário permanece como estava

#### Scenario: Acionamento duplicado
- **WHEN** o usuário aciona novamente durante uma requisição
- **THEN** nenhuma requisição adicional é realizada

#### Scenario: Limite de tempo excedido
- **WHEN** o provedor não responde dentro do limite
- **THEN** a operação é encerrada com motivo de tempo esgotado e não é repetida

### Requirement: Mudança de configuração e sessão descartam o resultado

A requisição SHALL capturar a revisão da configuração vigente no início. Salvar ou remover configuração SHALL abortar pedidos em curso e limpar consentimentos; fechar, reload, crash e saída SHALL descartar pedidos e resultados da sessão; recomenda-se abortar também em ocultar/suspender. Resposta tardia SHALL ser descartada sem entrega e sem registro, e somente o documento que iniciou o pedido SHALL poder cancelá-lo.

#### Scenario: Provedor trocado durante o pedido
- **WHEN** a configuração é salva ou removida enquanto uma sugestão está em andamento
- **THEN** o pedido é abortado, consentimentos são limpos e nenhum resultado é entregue

#### Scenario: Fechamento e resposta tardia
- **WHEN** a janela fecha, recarrega ou o processo cai durante o pedido e a resposta chega depois
- **THEN** o resultado não é entregue nem registrado e nenhum estado novo é criado

#### Scenario: Cancelamento de outro documento
- **WHEN** um `requestId` de outra sessão é usado para cancelar
- **THEN** o pedido alheio não é afetado e a operação é recusada

### Requirement: Falhas fechadas sem vazar credencial nem resposta

Toda falha SHALL ser apresentada e registrada como motivo de conjunto fechado, acompanhado no máximo da origem e do código de estado, cobrindo ainda resposta vazia, resposta impossível de interpretar e resposta sem item válido. O sistema não SHALL apresentar nem registrar a credencial, a URL completa, os cabeçalhos enviados ou o corpo bruto do provedor, inclusive em respostas de sucesso. A resposta SHALL ser usada apenas para compor a proposta em memória.

#### Scenario: Credencial inválida durante a sugestão
- **WHEN** o provedor responde 401 com corpo que contém trecho da chave
- **THEN** o sistema apresenta credencial inválida e não transporta nem registra o corpo

#### Scenario: Resposta ilegível ou vazia
- **WHEN** a resposta não permite extrair títulos ou vem vazia
- **THEN** o motivo correspondente é apresentado e o formulário não é alterado

#### Scenario: Falha de rede sem endereço completo
- **WHEN** a requisição falha antes de obter resposta
- **THEN** o registro contém no máximo motivo e origem, sem caminho, consulta ou cabeçalhos

### Requirement: Conteúdo externo não ganha autoridade

Título e descrição SHALL ser tratados como dados, nunca como instrução ao modelo, porque a descrição pode ter sido montada a partir de texto selecionado em página. A resposta MUST NOT ser capaz de alterar destino, configuração, dados da tarefa ou qualquer outro estado: o desfecho máximo é uma proposta de títulos sujeita a validação e confirmação do usuário.

#### Scenario: Descrição com texto instrucional
- **WHEN** o conteúdo enviado contém texto que aparenta instruir o modelo
- **THEN** ele é enviado como dado e o desfecho possível permanece uma proposta de títulos

#### Scenario: Resposta não altera configuração nem destino
- **WHEN** a resposta contém texto que aparenta instruir mudança de endereço, modelo ou chave
- **THEN** a configuração permanece inalterada e nenhuma requisição adicional é feita
