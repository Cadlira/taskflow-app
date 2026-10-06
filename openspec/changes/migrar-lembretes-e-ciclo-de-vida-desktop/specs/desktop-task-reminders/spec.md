# Spec Delta

## Purpose

Permitir configurar lembretes locais e tentar avisos Windows a partir de ocorrências persistidas, com recuperação limitada, concorrência segura e abertura da tarefa atual sem ampliar autoridade do renderer.

## ADDED Requirements

### Requirement: Configuração preserva tipos limites e precisão

O sistema SHALL permitir até10 lembretes AT/OFFSET por tarefa com prazo, presets0/15/60/1440 e offsets inteiros seguros não negativos em minutos exatos. AT SHALL ocorrer até o prazo; instantes/IDs SHALL ser únicos e representáveis. Recorrência SHALL aceitar somente OFFSET. Datas intactas SHALL conservar ISO/precisão.

#### Scenario: Fronteiras de coleção e parâmetros
- **WHEN** coleção tem0/10/11 itens, OFFSET0/fração/negativo/overflow, AT após prazo ou instantes duplicados entre tipos
- **THEN** somente parâmetros e limites válidos são aceitos; recusa conserva draft/dados e indica campos/índices0–9 por códigos finitos
- **AND** um preset não impede offset válido fora da lista

#### Scenario: Datas e recorrência
- **WHEN** tarefa sem prazo recebe lembrete, regra recorrente recebe AT ou data local digitada está em gap/impossível
- **THEN** a alteração falha sem apagar reminders; OFFSET continua compatível e horário repetido novo segue conversão local existente
- **AND** edição independente não reconverte ISO com segundos/milissegundos; mudança de fuso com AT sendo editado exige revisão explícita

### Requirement: Drafts expressam intenção sem autoridade de processamento

Criação SHALL recusar IDs de reminders; edição SHALL aceitar somente IDs atuais ou item novo sem ID. Proprietário SHALL gerar identidades/clock/markers. Omissão SHALL conservar coleção;[] SHALL limpar e null SHALL recusar. Configuração nova/alterada com gatilho<=now SHALL falhar; configuração intacta pelo mesmo ID SHALL ser conservada.

#### Scenario: Criar editar omitir e remover
- **WHEN** usuário cria item sem ID, edita item observado, omite reminders ou envia[]
- **THEN** main respectivamente gera ID distinto, conserva identidade pertinente, conserva coleção ou remove-a integralmente
- **AND** ID estranho/duplicado ou marker/timestamp enviado pelo cliente é recusado sem efeito

#### Scenario: Vencido intacto e configuração nova
- **WHEN** gatilho<=now pertence a configuração carregada intacta ou item novo/configuração alterada
- **THEN** intacta pode permanecer e recebe liquidação da mutação; nova/alterada falha sem aviso ou gravação
- **AND** edição de outra propriedade conserva marker atual da mesma ocorrência, inclusive claim posterior à base do formulário

### Requirement: Recuperação entrega somente pendentes dentro da graça

Startup/reabertura e resume SHALL examinar pendentes persistidos. Ativas TODO/IN_PROGRESS SHALL poder submeter aviso somente com trigger<=now<=trigger+300000. Atraso maior e terminal vencida SHALL ser consumidos sem aviso. Futuras SHALL continuar pendentes; processadas/ausentes SHALL não repetir.

#### Scenario: Quatro fronteiras em todas as recuperações
- **WHEN** startup, resume ou reabertura encontra pendente ativa em trigger−1, trigger, trigger+300000 ou trigger+300001ms
- **THEN** respectivamente conserva futura, permite uma tentativa, permite uma tentativa ou consome sem tentativa
- **AND** o antigo descarte de todos os vencidos no startup não é aplicado antes da decisão

#### Scenario: Terminais e múltiplas retomadas
- **WHEN** tarefa terminal tem reminder vencido/futuro ou a mesma ativa processada é examinada novamente
- **THEN** terminal vencida liquida, futuro terminal não agenda e processada não submete novamente
- **AND** ausência de tarefa/reminder ou ocorrência alterada não autoriza aviso pelo candidato antigo

### Requirement: Mutações não reproduzem lembretes vencidos

Criação/edição efetiva/transição/fechamento/restore/undo/importação SHALL liquidar pendentes<=now sem aviso retroativo, na mesma unidade das mudanças relacionadas. Marcadores atuais de instantes intactos SHALL ser conservados conforme operação; importação SHALL manter autoridade do arquivo. Graça SHALL não reproduzir backup.

#### Scenario: Ações e igualdade do relógio
- **WHEN** cada mutação pertinente confirma com reminders vencidos/exatos/futuros, inclusive terminal ou arquivo importado dentro da graça
- **THEN** vencidos/exatos recebem marker sem aviso e futuros permanecem conforme dados finais
- **AND** passagem do tempo/toggle independente/no-op não vira geração nem edição de reminder

#### Scenario: Reverter série e importar
- **WHEN** undo restaura configuração intacta após claim ou importação substitui tasks a partir do arquivo
- **THEN** undo conserva marker atual antes de liquidar; importação não mescla markers das tasks substituídas nem avisa vencidos
- **AND** portadora única e remoção da gerada são verificadas no plano atômico

### Requirement: Processamento durável precede uma única tentativa externa

Ocorrência SHALL ser revalidada por tarefa/reminder/instante exatos e consumida duravelmente antes do efeito. Claim SHALL conservar updatedAt/content/edit e avançar global. Somente confirmação confiável SHALL autorizar uma tentativa de submissão; erro/crash após consumo SHALL não repetir. Não SHALL haver promessa de entrega visual ou exactly-once.

#### Scenario: Duplicação rollback e resultado incerto
- **WHEN** dois candidatos disputam tupla ou há rollback/COMMIT incerto
- **THEN** somente um claim confirmado confiável permite tentativa; outro/no-op/rollback/incerto não notificam
- **AND** reabertura validada usa marker encontrado, sem apagar processamento para recuperar aviso

#### Scenario: Crash e falha externa
- **WHEN** processo cai entre claim e submissão, depois da submissão ou notifier falha/está indisponível
- **THEN** marker confirmado permanece e nenhuma segunda tentativa automática ocorre para a mesma pendência consumida
- **AND** perda possível é documentada; backup futuro explicitamente substituído pode redefinir pendência sem ledger histórico global

### Requirement: Concorrência protege a fronteira de submissão

Decisão e clock SHALL usar estado atual da execução, serializados com mutações. Nenhuma mutação SHALL executar entre claim confirmado e solicitação externa da mesma decisão. Candidato obsoleto, suspensão/saída ou clock fora da janela SHALL impedir submissão. Alteração posterior SHALL cancelar o disponível por melhor esforço sem promessa retroativa.

#### Scenario: Candidato concorre com todas as mutações
- **WHEN** edição de título/prazo/reminder/status, exclusão, restore, undo ou backup confirma antes da decisão/submissão
- **THEN** efeito usa estado atual pertinente ou candidato torna-se inaplicável; título/prazo antigos e markers perdidos não são enviados
- **AND** aviso não ocorre dentro de transação/conclusão de manutenção nem mantém lock enquanto espera Windows

#### Scenario: Clock muda depois do consumo
- **WHEN** relógio recua antes do trigger ou avança além de trigger+300000 entre consumo e solicitação
- **THEN** efeito é suprimido conservando marker, sem aviso antecipado ou retry

#### Scenario: Windows exibe depois de nova edição
- **WHEN** tarefa muda ou sai depois de uma submissão enquanto Windows ainda processa/exibe
- **THEN** cancelamento disponível é tentado e rota antiga é invalidada quando a tupla deixa de existir
- **AND** aplicação não afirma remover texto já visto ou efeito nativo pendente com garantia

### Requirement: Agenda reconcilia estado confirmado sem alterar commits

Todas as mutações pertinentes SHALL atualizar/cancelar a agenda somente após conclusão confirmada. Startup/resume/reabertura/recuperação validada e backup APPLIED/UNCHANGED/empty SHALL reconstruí-la. Perda de atualização SHALL ser corrigida em até60s de execução disponível. Falha da agenda SHALL não reverter mutação ou inventar revisão de no-op.

#### Scenario: Mudanças e backup sem commit
- **WHEN** tarefa/reminder muda, fechada/gerada confirma, move/undo altera atividade ou backup APPLIED/UNCHANGED/tasks:[] confirma
- **THEN** agenda converge ao estado final, inclusive no-op sem evento SQL, sem timer de item removido ou aviso retroativo
- **AND** falha da projeção informa indisponibilidade sem transformar sucesso durável em rollback

#### Scenario: Invalidação perdida e recuperação
- **WHEN** atualização interna se perde ou storage volta após recuperação validada
- **THEN** ciclo de correção reconstitui pendências/marcadores sem publicar projeção parcial ou repetir comando do usuário

### Requirement: Relógio e espera longa não autorizam aviso antecipado

Espera SHALL respeitar trigger persistido, reavaliar clock em até60s enquanto em execução e suportar distância superior a2147483647ms sem disparar antecipadamente ou entrar em loop. Suspend SHALL parar novas tentativas até recuperação. Fuso SHALL não reescrever instantes intactos.

#### Scenario: Timer distante salto e recuo
- **WHEN** trigger está além do limite de timeout, relógio salta/recua ou muda fuso
- **THEN** decisão continua comparando instante atual com trigger e graça; não há aviso precoce/loop de1ms nem regravação de ISO por fuso

### Requirement: Notificação usa identidade local e conteúdo atual limitado

Aviso SHALL usar identidade Windows do app instalado por usuário, título atual/ícone/prazo pt-BR e referência opaca de no máximo64 caracteres. Conteúdo de tarefa/paths/ativação ou erro bruto SHALL não ir a logs. API suportada/submissão SHALL não ser apresentada como prova de exibição ou permissão.

#### Scenario: Notificação instalada e IDs históricos
- **WHEN** tarefa tem IDs longos/Unicode/delimitadores e chega decisão elegível
- **THEN** referência limitada representa a tupla sem truncar identidades e aviso pertinente usa conteúdo atual
- **AND** identidade/atalho/CLSID/ícone são comprovados no Windows instalado, não inferidos do build

#### Scenario: Não Perturbe ou falha
- **WHEN** SO bloqueia/retarda aviso, API não suporta ou falha nativa contém detalhes
- **THEN** app comunica capacidade/erro por códigos seguros, mantém marker consumido e não anuncia entrega visual nem faz retry

### Requirement: Ativação localiza tarefa atual sem mutação

Click/Action Center/cold start SHALL ter uma única rota, com payload limitado e referência única resolvida do estado persistido atual, inclusive processados. Ativação SHALL abrir/restaurar/focar e localizar tarefa conservando draft/filtros, sem mutar, recriar removida, executar URL/path/shell ou perder formulário.

#### Scenario: Janela aberta oculta e processo encerrado
- **WHEN** aviso é acionado com janela aberta/minimizada/oculta ou processo encerrado
- **THEN** uma única instância proprietária abre/localiza a tarefa atual, sem duplicar navegação ou writer
- **AND** callback perdido/ativação inválida não inventa alvo; gerenciamento oferece aviso seguro

#### Scenario: Alvo fora dos filtros e draft em curso
- **WHEN** alvo não corresponde a filtros ou form de outra tarefa está aberto
- **THEN** destaque temporário consultável fica fora dos resultados, conservando filtros/contagem/ordem e form em memória
- **AND** foco vai ao heading/aviso pertinente; sair do destaque retorna à lista sem salvar/recriar tarefa

#### Scenario: Obsoleto ambíguo ou malformado
- **WHEN** tarefa/reminder foi removido, instante mudou, referência resolve ambiguamente ou payload excede1KiB/tem campos ou ações indevidos
- **THEN** alvo não é selecionado; aviso seguro aparece e nenhuma operação de conteúdo ou abertura externa é executada

#### Scenario: Estado muda durante resolução
- **WHEN** resolução e snapshot não pertencem à mesma revisão ou churn impede convergência em três tentativas
- **THEN** seleção aguarda estado coerente ou retorna BUSY/stale, sem apontar ordinal de outra tarefa ou impor teto novo a IDs históricos

### Requirement: Recursos e desempenho têm limites sem truncamento

Agendamento SHALL manter recursos limitados, sem fila por todas as ocorrências ou varredura total por commit. Excesso SHALL pausar tentativas com erro seguro conservando dados. Em carga estável de referência SHALL cumprir decisão p95<=1000ms e recuperação<=5s em1000/<=10s em10000 tarefas com até10 reminders; falha SHALL exigir revisão sem relaxar gates herdados.

#### Scenario: Volume e saturação
- **WHEN** volumes1000/10000×10, bursts, fila saturada e IDs/payloads extensos são exercitados
- **THEN** mede charge/heap/RSS/CPU/latência/heartbeat e distingue saturação/expiração de carga estável
- **AND** nenhum dado é cortado, projeção parcial anunciada como completa ou promessa de aviso é feita quando recursos faltam

#### Scenario: Ocioso e recursos estruturais
- **WHEN** aplicação fica60s ociosa no equipamento de referência registrado
- **THEN** CPU médio do main<=1% é verificado e medição distingue infraestrutura de testes de produto
- **AND** orçamento64MiB de projeção, uma unidade de decisão em voo, uma agenda e16 submissões pendentes são comprovados sem alterar reservas herdadas

### Requirement: Evidências distinguem regras pacote e Windows instalado

Aceitação SHALL rastrear M01–M12 por testes portáveis, SQLite/bridge reais em perfil fictício e prova Windows instalada em conta padrão. Notificação/COM/cold start/login/tray/logoff SHALL ter evidência nativa própria. Gates e pendências D10/a11y/energia herdados SHALL não ser declarados resolvidos por mock/build.

#### Scenario: Campanhas e relatório
- **WHEN** gates, harness empacotado e roteiro instalado são executados
- **THEN** relatório registra casos/runtime/hash/hardware/resultados/limitações por camada e marca prova não executada como pendente
- **AND** ausência de autorização/ambiente de Setup não transforma M09/M10 em PASS nem autoriza distribuição
