# desktop-task-recurrence Specification

## Purpose
Preservar regras de recorrência e identidade das séries no desktop, com cálculo civil local e fechamento atômico que não duplica ocorrências nem perde dados diante de concorrência ou falha.

## Requirements

### Requirement: Regras existentes têm limites e validação preservados

O sistema SHALL aceitar somente DAILY com intervalo inteiro 1–365, WEEKLY com 1–7 dias distintos 0–6 e MONTHLY com dia inteiro 1–31. Recorrência SHALL exigir prazo representável e aceitar until opcional inclusivo igual ou posterior ao dueAt combinado. Lembrete AT SHALL ser incompatível com adicionar regra; validação SHALL conservar draft/dados e oferecer erro no campo.

#### Scenario: Fronteiras e parâmetros inválidos
- **WHEN** são enviados DAILY1/365/0/366, WEEKLY com 1/7/0 dias ou dia repetido/fora de 0–6, e MONTHLY1/31/0/32
- **THEN** somente valores dentro dos limites são aceitos, sem conversão de frações, enums novos ou parâmetros de outra frequência

#### Scenario: Prazo limite e AT
- **WHEN** falta prazo, until antecede dueAt, until é exatamente dueAt ou a tarefa com AT recebe regra
- **THEN** falta/antecedência/AT falham com campos e códigos finitos, igualdade do limite é válida e nenhum dado/lembrete é removido
- **AND** until continua comparado ao prazo combinado, inclusive quando a âncora histórica diverge dele

### Requirement: Cálculo local conserva fase e pula períodos perdidos

Próxima ocorrência SHALL partir de anchorAt ou dueAt, avançar pelo menos uma vez no calendário local e selecionar o primeiro candidato estritamente posterior ao relógio atual. Mensal SHALL limitar o dia somente naquele mês. Candidato igual a until SHALL poder gerar; posterior SHALL encerrar naturalmente. Períodos perdidos SHALL não produzir backlog ou geração por passagem do tempo.

#### Scenario: Fim de mês e leap year
- **WHEN** uma série mensal de dia 31 avança de janeiro para fevereiro e março em ano comum ou bissexto
- **THEN** usa 28/29 em fevereiro e retorna a 31 em março, sem redefinir o dia pedido

#### Scenario: Cedo tarde e igualdade do relógio
- **WHEN** a ocorrência é fechada antes do prazo, vários períodos depois ou com candidato exatamente now
- **THEN** avança ao menos uma vez, pula candidatos passados/iguais e gera no máximo um futuro, mantendo fase semanal/intervalo diário

#### Scenario: Fronteira inclusiva e fim natural
- **WHEN** o primeiro candidato futuro é igual a until ou posterior ao limite
- **THEN** igualdade gera e posterior conclui sem próxima, retirando a regra da fechada no mesmo commit

### Requirement: Calendário e precisão seguem comportamento local observado

Datas não editadas SHALL conservar texto ISO, segundos e milissegundos. Cálculo SHALL usar o fuso corrente do SO e avanço civil, inclusive a normalização de gaps/repetições da origem. Revisão explícita SHALL ser exigida quando fuso muda com prazo ou limite sendo editado. Não SHALL haver fuso fixo ou novos tipos de calendário.

#### Scenario: Dias de 23 e 25 horas
- **WHEN** cálculo atravessa DST em America/New_York e é comparado a UTC e America/Sao_Paulo
- **THEN** mantém a sequência civil local, podendo resultar em 23/25 horas reais, sem somar sempre 24 h

#### Scenario: Gap no cálculo e repetição
- **WHEN** a série diária de 07/03/2026 02:30 local em New York avança por 08/03 e 09/03 ou alcança hora repetida no outono
- **THEN** o gap normaliza para 03:30 e a próxima continua 03:30; repetição segue a escolha da conversão local preservada, sem segunda ocorrência automática
- **AND** gap digitado pelo usuário continua inválido, distinguindo entrada de cálculo

#### Scenario: Precisão e fuso corrente
- **WHEN** outro campo é editado sem alterar prazo/limite, ou o SO muda de fuso antes de novo fechamento
- **THEN** os ISO intactos não são reconvertidos e o cálculo subsequente usa o fuso corrente sem regravar a base

### Requirement: Edição preserva âncora e identidade da série

Editar regra/prazo SHALL conservar a âncora anterior enquanto divergir do novo prazo e removê-la ao retornar à base. Mudar frequência junto com prazo SHALL não reiniciar silenciosamente a âncora. Regra omitida SHALL conservar; retirada explícita SHALL conservar status e seriesId. Regra nova SHALL obter identidade da autoridade sem aceitar série/âncora do cliente.

#### Scenario: Adiar e retornar
- **WHEN** prazo é adiado e depois retorna ao ISO da âncora original
- **THEN** a primeira edição mantém a base agendada e a segunda elimina anchorAt redundante, sem trocar seriesId

#### Scenario: Regra e prazo juntos
- **WHEN** tarefa semanal ancorada na segunda muda regra e prazo para terça no mesmo save
- **THEN** mantém a antiga base conforme a origem e aplica o novo passo a partir dela, sem rebase silencioso

#### Scenario: Omitir retirar e adicionar
- **WHEN** patch omite regra, usa null ou adiciona regra sem anterior
- **THEN** respectivamente conserva regra, retira conservando status/série, ou cria regra sem âncora antiga e com série válida
- **AND** until omitido conserva existente, null limpa e string altera somente o limite

### Requirement: Fechamento transfere regra em um commit

DONE ou CANCELLED com SKIP SHALL fechar a portadora e gerar no máximo uma próxima TODO, retirando a regra da anterior e transferindo-a à nova no mesmo commit. CANCELLED com END SHALL fechar sem gerar. Identidades, série, revisão esperada e plano final SHALL ser verificados na unidade atual; falha SHALL conservar ambas as coleções e revisões anteriores.

#### Scenario: DONE SKIP END e falha entre escritas
- **WHEN** há conclusão, pulo ou encerramento, ou falha entre gravar fechada e gerada
- **THEN** DONE/SKIP confirmam ambas integralmente, END confirma só a fechada e falha reverte tudo, sem estado com meia geração

#### Scenario: Duas superfícies e resposta perdida
- **WHEN** duas sessões fecham a mesma base ou commit confirma antes de perder resposta
- **THEN** somente o primeiro fechamento aplicável confirma; o outro recebe conflito, e ressync recupera antiga/gerada inteiras sem replay ou terceira tarefa

### Requirement: Nova ocorrência conserva campos e renova passos

Nova ocorrência SHALL ter ID novo, mesma série, status TODO, prazo calculado, auditoria nova e campos básicos copiados. Frequência/parâmetros/until SHALL ser conservados sem âncora antiga. Subtarefas SHALL conservar títulos/ordem, recebendo IDs novos e done=false. completedAt SHALL estar ausente.

#### Scenario: Cópia completa
- **WHEN** portadora com descrição/pessoas/tags/origem/prioridade e subtarefas marcadas gera próxima
- **THEN** a nova conserva os campos e a regra/limite, renova todos os IDs de subtarefas e desmarca todos, sem completedAt ou anchorAt herdados
- **AND** marks/status da fechada permanecem conforme a ação do usuário

### Requirement: Criação terminal no-op e reabertura não duplicam

Criação inicial em DONE/CANCELLED com regra SHALL não gerar imediatamente. Mesmo status e edição efetivamente vazia SHALL ser no-op. Edição efetiva que resulte em terminal com regra SHALL seguir fechamento e escolha pertinentes. Reabrir histórica fechada SHALL ir a TODO conservando série, sem recuperar regra ou gerar ocorrência.

#### Scenario: Terminal criada e depois editada
- **WHEN** tarefa terminal com regra é criada e depois recebe mesmo status, toggle ou edição efetiva de título
- **THEN** criação/mesmo status/toggle não geram; edição efetiva pode fechar/transferir a regra e CANCELLED exige escolha, sujeito ao bloqueio de lembretes

#### Scenario: Reabrir histórica
- **WHEN** ocorrência que perdeu a regra ao fechar é reaberta após outra já existir
- **THEN** fica TODO com série histórica sem regra e não duplica a portadora atual

### Requirement: Escolha de cancelamento não grava antes da decisão

Cancelamento de plano terminal recorrente SHALL exigir SKIP ou END explícito. Abandonar/Escape SHALL não alterar dados. Escolha ausente SHALL produzir RECURRENCE_CHOICE_REQUIRED; escolha fora de plano pertinente SHALL ser recusada. Cancelamento recorrente por saída de foco SHALL restaurar seleção sem diálogo/comando e sem roubar foco.

#### Scenario: Confirmar ou abandonar diálogo
- **WHEN** Enter/ponteiro/save solicita CANCELLED recorrente e o usuário escolhe SKIP/END ou abandona
- **THEN** somente escolha válida permite fechamento; abandonar conserva tarefa e draft

#### Scenario: Saída de foco e request sem escolha
- **WHEN** focusout deixa CANCELLED pendente ou request pertinente não contém escolha
- **THEN** focusout restaura sem abrir/enviar e request retorna escolha obrigatória sem commit

### Requirement: Portadora e identidades têm proteção contra duplicação

Cada série SHALL ter no máximo uma portadora com regra em tasks+trash, qualquer status; históricas sem regra SHALL poder estar ativas. Duplicidade histórica SHALL conservar leitura/dados e recusar decisão afetada. Restore/revert SHALL validar plano final removendo corretamente gerada/entrada de origem; colisão gerada SHALL não sobrescrever e tentativas SHALL ser limitadas.

#### Scenario: Duplicidade histórica
- **WHEN** duas portadoras da mesma série existem, inclusive uma na lixeira, e o usuário tenta fechar ou mudar regra/prazo
- **THEN** recebe SERIES_CONFLICT sem reparação/reset/encerramento silencioso; leitura e edição independente/marcação continuam possíveis

#### Scenario: Colisão de tarefa série e itens
- **WHEN** gerador retorna ID de tarefa/lixeira, série existente ou ID local antigo/duplicado na lista nova
- **THEN** até três tentativas por identidade podem buscar valor livre e falha final retorna IDENTITY_CONFLICT sem commit parcial

#### Scenario: Restaurar ou reverter portadora
- **WHEN** restore/undo reintroduz regra, removendo sua entrada de trash ou eventual gerada no mesmo plano
- **THEN** checagem considera coleções distintas e estado final, sem contar registro que será removido nem ignorar homônimo indevido
- **AND** outra portadora conflitante recebe SERIES_CONFLICT sem restauração parcial, geração nova ou reparação automática

### Requirement: Cálculo impossível não encerra silenciosamente

Cálculo SHALL verificar instante representável e avanço positivo a cada passo e limitar decisão a 32.768 passos. Overflow/avanço impossível SHALL retornar RECURRENCE_OUT_OF_RANGE; excedente SHALL retornar RESOURCE_LIMIT. Essas recusas SHALL conservar status/regra/dados/revisões e não ser tratadas como until esgotado.

#### Scenario: Overflow e limite de passos
- **WHEN** data aceita pelo codec não admite próximo instante ou decisão necessita mais de 32.768 passos
- **THEN** toda mutação é recusada com o código próprio, sem RangeError remoto, reset, corte ou geração aproximada

### Requirement: Lembretes e desfazer mantêm contratos separados

Prazo/status/fechamento-geração com lembretes SHALL permanecer guardados até integração própria. Undo SHALL restaurar anterior/remover gerada por conteúdo completo; restore/revert SHALL apenas preservar markers e liquidar vencidos de forma pura. Scheduler/notifier SHALL permanecer indisponíveis, e falha externa futura SHALL não reverter commit.

#### Scenario: Regra com OFFSET preservada
- **WHEN** tarefa com lembretes tenta DONE/SKIP/END ou alteração que fecharia/geraria
- **THEN** ADVANCED_TASK_RESTRICTED conserva regra/dados/marcadores; helpers puros de próxima copiam OFFSET com IDs novos sem processedFor

#### Scenario: Contrato de reversão futura
- **WHEN** fixture tenta reverter anterior e remover gerada após edição/toggle desta, ou só após claim
- **THEN** revisão completa alterada bloqueia reversão inteira e claim isolado não bloqueia, com undo remoto limitado ao token próprio e sem disponibilizar scheduler/notificação

#### Scenario: Captura real e restauração sem próxima
- **WHEN** fechamento efetivo produz anterior/gerada ou usuário restaura portadora excluída
- **THEN** before-image e referência/revisão gerada vêm do próprio plano atual; restore/undo não calcula nova ocorrência
- **AND** move conserva regra interrompendo atividade em tasks, e liquidação<=now não anuncia alarmes agendados
