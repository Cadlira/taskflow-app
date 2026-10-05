# Spec Delta

## MODIFIED Requirements

### Requirement: Regras existentes têm limites e validação preservados

O sistema SHALL aceitar DAILY1–365, WEEKLY1–7 dias distintos0–6 e MONTHLY1–31. Criação/edição de regra SHALL exigir prazo representável e until opcional inclusivo>=dueAt combinado; AT SHALL impedir adicionar regra. Leitura/importação histórica SHALL seguir o contrato de backup sem normalizar datas intactas ou aplicar retroativamente a regra de formulário; dados/draft SHALL permanecer em recusa.

#### Scenario: Fronteiras e parâmetros inválidos
- **WHEN** são enviados DAILY1/365/0/366, WEEKLY com 1/7/0 dias ou dia repetido/fora de 0–6, e MONTHLY1/31/0/32
- **THEN** somente valores dentro dos limites são aceitos, sem conversão de frações, enums novos ou parâmetros de outra frequência

#### Scenario: Prazo limite e AT
- **WHEN** criação/edição pertinente não tem prazo, until antecede dueAt, until é exatamente dueAt ou tarefa com AT recebe regra
- **THEN** falta/antecedência/AT falham com campos e códigos finitos, igualdade do limite é válida e nenhum dado/lembrete é removido
- **AND** until continua comparado ao prazo combinado, inclusive quando a âncora histórica diverge dele

#### Scenario: Backup histórico conserva datas aceitas
- **WHEN** arquivo histórico válido contém anchorAt distinto ou until anterior ao dueAt adiado, mas satisfaz o contrato de backup
- **THEN** importação conserva os valores canônicos conhecidos sem reparação/geração ou validação retroativa de formulário
- **AND** nova alteração de regra/prazo segue as regras de edição, mantendo draft/dados em recusa

### Requirement: Portadora e identidades têm proteção contra duplicação

Cada série SHALL ter no máximo uma portadora com regra em tasks+trash, qualquer status; históricas sem regra SHALL poder estar ativas. Duplicidade histórica SHALL preservar leitura/dados. Restore/revert/backup SHALL validar seu plano final por coleção; importação SHALL conservar IDs/âncoras/parâmetros sem gerar ou reparar. Colisão gerada SHALL não sobrescrever; tentativas SHALL ser limitadas.

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

#### Scenario: Portadoras no backup e lixeira preservada
- **WHEN** tarefas importadas ou entrada preservada de trash, inclusive vencida/terminal, duplicam portadora ou trash já é duplicada
- **THEN** substituição integral recebe SERIES_CONFLICT sem commit/expurgo/retirada de regra
- **AND** plano exclui tasks antigas substituídas, mas inclui todas as linhas de trash e distingue homônimos

#### Scenario: Histórica e identidade importadas
- **WHEN** backup contém série com históricas sem recurrence, subtasks marcadas/âncora/until e IDs
- **THEN** importação conserva campos/IDs/ordens e não calcula próxima nem renova IDs de passos
- **AND** ID task/trash homônimo é permitido e restore posterior mantém ID_EXISTS

