# Spec Delta

## MODIFIED Requirements

### Requirement: Lembretes somente liquidam gatilhos vencidos

Restauração SHALL conservar dados do arquivo e liquidar pendentes representáveis<=now no momento da execução, sem reescrever timestamps ou gerar notificação/ocorrência. Futuro e marcas já processadas SHALL permanecer. Agenda real SHALL ser reconciliada depois de sucesso APPLIED/UNCHANGED, inclusive tasks:[], sem depender de evento SQL ou aplicar graça à importação.

#### Scenario: Fronteiras e tipos
- **WHEN** AT/OFFSET tem gatilho antes/exatamente/depois de now, marca existente ou tarefa terminal
- **THEN** vencidos/exatos pendentes recebem marker correto, futuro/marcas são conservados e timestamps/status não mudam
- **AND** nenhum aviso retroativo é emitido e nenhuma subtask/âncora é regenerada; futuros são reconciliados sem garantia visual



#### Scenario: No-op coleção vazia e falha da projeção
- **WHEN** restauração confirma APPLIED/UNCHANGED/empty ou atualização externa da agenda falha
- **THEN** projeção é reconstruída do estado final, mesmo sem revisão/evento SQL; removidas deixam de estar ativas
- **AND** falha posterior não reverte backup, importa markers antigos ou anuncia entrega concluída

### Requirement: Migração manual comunica limites e exclusões

Produto SHALL orientar exportar pela extensão inalterada, preservar original, escolher/revisar/confirmar/conferir no app e oferecer backup preventivo opcional. Arquivo SHALL transportar tarefas sem lixeira, credenciais/configuração de IA ou desfazer. JSON SHALL ser identificado como não criptografado e capaz de conter dados pessoais das tarefas.

#### Scenario: Percurso offline
- **WHEN** usuário migra fixtures sem rede
- **THEN** segue exportação manual e importação explícita com conferência, sem conta/backend/extração do Chrome ou mudança na extensão

#### Scenario: Diferenças da migração
- **WHEN** usuário lê avisos/guia ou exporta
- **THEN** não há promessa de transportar trash/segredos/undo, reparar SQLite inacessível, mesclar ou reavisar lembretes vencidos; futuros ficam sujeitos à agenda/política do app em execução
- **AND** trash do app permanece, logs/erros não contêm conteúdo sensível e reimportação é nova decisão explícita
