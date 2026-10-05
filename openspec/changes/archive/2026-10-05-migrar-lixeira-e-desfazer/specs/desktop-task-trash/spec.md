# Spec Delta

## Purpose

Permitir excluir e recuperar tarefas no desktop com retenção limitada, ações atômicas condicionadas à entrada observada e confirmações acessíveis que preservam dados diante de concorrência.

## ADDED Requirements

### Requirement: Retenção usa trinta dias decorridos

Entradas SHALL vencer somente quando deletedAt for anterior a now menos 30×24 h. Exatamente 30 dias e datas futuras SHALL permanecer. Clock da decisão SHALL pertencer ao proprietário; apresentação SHALL filtrar vencidos sem gravar.

#### Scenario: Fronteiras da retenção
- **WHEN** entradas têm 29 dias, exatamente 30 dias, 30 dias+1 ms, 31 dias ou deletedAt futuro
- **THEN** somente as de 30 dias+1 ms e 31 dias vencem; limite/futuro são conservados
- **AND** mudanças DST/fuso não convertem retenção em dias civis nem alteram timestamps

#### Scenario: Passagem do tempo com área aberta
- **WHEN** entrada vence enquanto a lixeira permanece aberta
- **THEN** deixa de ser apresentada em até 60 s e imediatamente ao foco/retomada, sem escrita por timer
- **AND** qualquer restore/undo depois do limite é recusado pelo main mesmo antes de atualizar a apresentação

### Requirement: Exclusão aplica limite e ordenação no mesmo commit

Move SHALL conferir base completa, preservar Task e aplicar expurgo por idade, substituição do mesmo ID, inserção e corte a 100 no mesmo commit. Ordem SHALL usar deletedAt decrescente, revisão da entrada decrescente no empate e ID lexicográfico UTF-16 como desempate final.

#### Scenario: Inserção completa e limite
- **WHEN** uma tarefa com todos os campos é excluída com base atual e a lixeira alcança 101 itens
- **THEN** tarefa sai de tasks, nova entrada contém payload/timestamps íntegros e somente as 100 primeiras entradas da ordem permanecem
- **AND** retention/cap/substituição e ambas as coleções têm um commit e uma revisão global

#### Scenario: Empates e versão anterior do mesmo ID
- **WHEN** exclusões têm deletedAt igual ou uma tarefa ativa substitui entrada homônima na lixeira
- **THEN** maior revisão de entrada precede menor, empate restante usa ID sem locale e há uma só entrada do ID
- **AND** versão substituída não é recuperada pelo undo da nova exclusão

#### Scenario: Relógio recua com lixeira futura cheia
- **WHEN** cem entradas têm deletedAt futuro e a nova exclusão fica depois delas na ordem
- **THEN** a tarefa é removida e a nova entrada não é retida, conforme política por data/limite
- **AND** resultado informa retained:false e ausência de recuperação, sem oferta de Desfazer ou alteração artificial do relógio

### Requirement: Confirmação de exclusão preserva base completa

Excluir tarefa SHALL exigir confirmação recuperável ligada à contentRevision completa observada. Diálogo SHALL informar 30 dias, limite 100, descartes irreversíveis e interrupção da portadora sem geração. Base alterada SHALL exigir nova revisão e confirmação.

#### Scenario: Confirmar ou abandonar
- **WHEN** o usuário confirma, abandona ou usa Escape na exclusão
- **THEN** somente confirmação atual move; abandono/Escape não alteram dados e devolvem foco pertinente
- **AND** abrir a confirmação já limpa oferta de undo anterior, inclusive quando abandonada

#### Scenario: Check edição ou claim durante diálogo
- **WHEN** outra sessão altera campo/check do alvo ou apenas confirma claim de lembrete enquanto o diálogo aguarda
- **THEN** campo/check invalida a base e recusa sem gravação; claim isolado permite decisão com marcador atual preservado
- **AND** timestamp igual e editRevision igual não substituem contentRevision

### Requirement: Ações vinculam-se à entrada observada

Restore e exclusão definitiva SHALL conferir ID, contentRevision e deletedAt da entrada observada. Cada novo move SHALL receber revisão nova. Token/precondição antigos SHALL não operar sobre outra exclusão do mesmo ID.

#### Scenario: Restore e nova exclusão com mesmo relógio
- **WHEN** uma entrada é restaurada e a mesma tarefa é novamente excluída com deletedAt igual
- **THEN** entrada tem identidade nova e operação pendente contra a antiga recebe ENTRY_CHANGED ou CONFIRMATION_CHANGED sem remover/restaurar a nova

#### Scenario: Coexistência histórica e substituição
- **WHEN** tasks e trash contêm mesmo ID e metadata inicial igual e um move substitui a entrada
- **THEN** revisão da nova entrada avança e referência/token da versão substituída é recusado mesmo com conteúdo/data iguais
- **AND** não é exigida nova coluna SQL ou regravação das outras entradas

### Requirement: Restauração conserva dados e recusa sem perda

Restore SHALL reler idade/identidade e recusar ausência, vencimento, ID ativo ou conflito de portadora antes de escrever. Sucesso SHALL remover a entrada e restituir Task integral com timestamps originais e revisões novas, exceto liquidação pura de vencidos. Restore SHALL não gerar ocorrência ou oferecer undo.

#### Scenario: Fidelidade sem geração
- **WHEN** entrada válida com status, regra, âncora, completedAt, ISO precisos e subtarefas ordenadas é restaurada
- **THEN** campos/id/createdAt/updatedAt/completedAt/done/ordens/regra permanecem, novas revisões autorizam tarefa ativa e nenhuma próxima nasce
- **AND** somente markers de lembretes vencidos são liquidados conforme contrato próprio

#### Scenario: Ausência identidade vencimento e ID ativo
- **WHEN** entrada não existe, identidade mudou, idade excedeu retenção ou ID já existe em tasks
- **THEN** retorna respectivamente NOT_IN_TRASH, ENTRY_CHANGED, ENTRY_EXPIRED ou ID_EXISTS sem alterar nenhuma coleção/revisão
- **AND** verificação de idade ocorre também sem abrir a área; entrada vencida não é expurgada como efeito dessa recusa

#### Scenario: Portadora concorrente
- **WHEN** restauração de uma regra criaria outra portadora da mesma série em tasks ou trash
- **THEN** SERIES_CONFLICT conserva todas as entradas/dados, sem reparação/reset nem lista vazia aparente

### Requirement: Definitiva e esvaziamento exigem confirmação atual

Exclusão definitiva e esvaziamento SHALL exigir confirmação irreversível opaca própria, consumível uma vez. Definitiva SHALL remover apenas a entrada observada. Esvaziamento SHALL comparar composição/identidades completas capturadas; diferença SHALL recusar e pedir revisão, sem apagar itens novos.

#### Scenario: Definitiva confirmada ou abandonada
- **WHEN** usuário confirma entrada atual ou abandona/Escape
- **THEN** somente confirmação remove essa entrada, sem modificar tasks nem oferecer undo; abandono preserva dados/foco
- **AND** remoção é lógica do produto, sem promessa de eliminação forense do SQLite ou de backups

#### Scenario: Composição muda durante esvaziamento
- **WHEN** outra sessão move, restaura, expurga, exclui definitivamente ou substitui uma entrada depois da preparação
- **THEN** confirmação recebe CONFIRMATION_CHANGED, nenhuma entrada é apagada por ela e a lista precisa ser revista antes de novo diálogo
- **AND** contagem igual ou conjunto de IDs igual não libera confirmação se identidades mudaram

#### Scenario: Tarefa independente muda
- **WHEN** somente uma tarefa fora da lixeira ou seu claim muda enquanto EMPTY aguarda
- **THEN** confirmação continua aplicável à composição original sem falso conflito por globalRevision
- **AND** sucesso remove todas as entradas confirmadas num commit, com removedCount exato

#### Scenario: Preparação e token alheio
- **WHEN** diálogo é preparado, resposta atrasa ou outro documento/tipo tenta usar seu token
- **THEN** preparação não grava e diálogo só habilita depois de snapshot completo igual/superior à revisão preparada
- **AND** token alheio/errado/repetido é recusado sem consumir o token legítimo de outra sessão ou acessar dados sem autorização

### Requirement: Manutenção é explícita e falha é visível

Expurgo por idade SHALL executar explicitamente no startup válido, entrada da lixeira e move. Snapshot/list/get SHALL continuar puros. No-op SHALL não alterar revisão/evento; falha SHALL conservar estado identificável e oferecer recuperação sem falso vazio.

#### Scenario: Startup entrada e leitura pura
- **WHEN** app inicia, usuário entra na área ou apenas pede snapshot contendo entrada antiga
- **THEN** startup/entrada usam unidade explícita; snapshot conserva dados/revisões sem expurgo oculto
- **AND** startup/entrada não cortam coleção histórica acima de 100 apenas por limite de inserção

#### Scenario: Falha no expurgo e nova tentativa
- **WHEN** expurgo falha com rollback confirmado ou resultado incerto
- **THEN** a área comunica erro/retry e conserva último snapshot stale; incerto exige reopen/validação
- **AND** não anuncia lixeira limpa/vazia nem duplica timers/listeners; expurgo sem vencidos não grava

### Requirement: Lixeira preserva interação e foco acessíveis

Área SHALL oferecer acesso pelo header/vazio, Voltar, título/data local, ordem e estados loading/stale/erro/vazio distintos. Controles busy SHALL permanecer focáveis e ignorar repetição. Anúncios e foco SHALL seguir item/origem/vizinho/último/Voltar de forma segura.

#### Scenario: Navegar e manter apresentação
- **WHEN** usuário entra/volta da lixeira ou dados externos chegam
- **THEN** mesma inscrição atualiza tasks+trash; filtros/ordem da lista principal são conservados na sessão e erros não viram vazio
- **AND** data usa pt-BR/fuso local sem reconverter armazenamento ou introduzir busca/ordem nova

#### Scenario: Remover restaurar ou perder controle externo
- **WHEN** item do meio/último/único é restaurado/removido, ação falha ou item desaparece externamente durante diálogo
- **THEN** foco segue Restaurar do vizinho/novo último ou Voltar; erro/abandono usa origem existente ou destino seguro
- **AND** busy/duplo gesto não duplica comando, oferta não rouba foco e IDs históricos não quebram seletores

#### Scenario: Esvaziamento antigo e acessibilidade
- **WHEN** EMPTY é recusado por mudança ou janela mínima/zoom200/strings longas são exercitados
- **THEN** alerta focável orienta revisar/reabrir diálogo e ações permanecem acessíveis por teclado/rolagem
- **AND** esvaziamento confirmado foca Voltar e não oferece Desfazer
