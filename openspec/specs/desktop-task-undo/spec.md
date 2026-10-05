# desktop-task-undo Specification

## Purpose
Permitir desfazer a última ação efetiva da própria superfície com recibo temporário seguro, restaurando integralmente dados condicionados às revisões atuais sem criar histórico persistente.

## Requirements

### Requirement: Oferta pertence à última ação efetiva do documento

Uma oferta de undo SHALL pertencer exclusivamente ao documento que confirmou edição, status ou exclusão retida efetivos. Ela SHALL existir somente em memória, sem prazo temporal, pilha ou redo. Criação/check/restore/no-op/definitiva/empty/purge SHALL não oferecer undo.

#### Scenario: Ações elegíveis e não elegíveis
- **WHEN** edição/status/exclusão retida confirma ou criação/check/restauração/no-op/definitiva/expurgo ocorre
- **THEN** somente a primeira categoria publica oferta após commit; ações restantes não a produzem
- **AND** move que caiu fora do limite não anuncia recuperação disponível

#### Scenario: Outra superfície e passagem do tempo
- **WHEN** janela B observa commit de A, usuário minimiza/perde foco/espera ou muda filtros/ordem/expansão
- **THEN** B não recebe recibo de A e oferta de A não expira por esses eventos
- **AND** mudanças externas/retenção podem torná-la inaplicável sem transferir oferta

### Requirement: Recibo usa estado anterior realmente confirmado

Before-image e referência da gerada SHALL ser capturadas da leitura atual da unidade antes da escrita, com reserva de recursos. Publicação SHALL ocorrer somente após commit confirmado e contexto ainda corrente. Renderer SHALL não fornecer Task anterior, plano livre ou autoridade do recibo.

#### Scenario: Save depois de checks externos
- **WHEN** form aberto salva com editRevision ainda válida depois de marcações de outra sessão
- **THEN** before-image inclui done relido, save conserva marks atuais e undo restaura essa versão real, sem regressão ao snapshot de abertura

#### Scenario: Reserva rollback e pós-commit
- **WHEN** reserva/clone falha, unidade recusa/no-op/reverte ou contexto muda após commit antes da resposta
- **THEN** reserva insuficiente recusa antes de escrita; recusa/no-op/rollback não ofertam; contexto antigo não publica recibo
- **AND** commit já confirmado permanece e oferta perdida não é reconstruída por snapshot

### Requirement: Nova ação e contexto invalidam oferta anterior

Nova ação/abertura de confirmação/formulário/área SHALL limpar oferta e recibo próprios antes do percurso dependente, inclusive falha/no-op/abandono. Contexto monotônico por documento SHALL impedir que execução/resposta tardia ressuscite oferta. Ações de apresentação SHALL conservá-la.

#### Scenario: Ação falha diálogo abandona e save fecha form
- **WHEN** nova ação falha ou confirmação é abandonada, ou save efetivo fecha automaticamente seu formulário
- **THEN** nos primeiros casos oferta anterior permanece limpa; no último pode aparecer oferta do próprio save, na mesma ação
- **AND** voltar/cancelar explicitamente de área/form limpa estado transitório próprio

#### Scenario: Clear ordenado e resposta antiga
- **WHEN** contexto novo é estabelecido antes da unidade antiga iniciar ou sua resposta chega depois
- **THEN** unidade não iniciada recebe STALE_CONTEXT/encerramento e resposta antiga não recria oferta nem apaga a nova
- **AND** sequência menor é recusada, clear igual é idempotente e sequência não dá autoridade entre sessões

### Requirement: Token próprio é consumido uma vez

Undo SHALL exigir token opaco próprio do documento/contexto e consumi-lo numa tentativa válida, em sucesso, recusa ou falha. Token ausente/repetido/alheio SHALL não autorizar ação. Payload/remetente inválido SHALL não consumir recibo legítimo de outra sessão.

#### Scenario: Sucesso recusa e falha
- **WHEN** uma tentativa própria desfaz, conflita ou falha no armazenamento
- **THEN** token deixa de ser utilizável, segunda tentativa recebe UNDO_NOT_AVAILABLE e não há redo/replay
- **AND** falha ou perda de resposta exige ressync antes de nova decisão, sem token reconstruído

#### Scenario: Token forjado ou alheio
- **WHEN** outra sessão fornece token, contexto antigo ou Task/UndoPlan livre
- **THEN** main recusa por código fechado sem alterar dados ou consumir oferta legítima alheia

### Requirement: Reversão simples usa revisão completa

Undo de edição/status SHALL verificar contentRevision completa produzida pela ação. Sucesso SHALL restaurar todos os campos anteriores, id/createdAt conservados, updatedAt novo e revisões novas. Check/edição/ABA SHALL bloquear; claim isolado SHALL preservar aplicabilidade e markers atuais.

#### Scenario: Campos e identidade restaurados
- **WHEN** edição/status simples é desfeito com revisão válida
- **THEN** título/opcionais/tags/origem/status/completedAt/regra/âncora/lista/done/ordem voltam à before-image real, preservando identidade/criação
- **AND** updatedAt e revisões são novos, nenhum campo histórico é truncado e tarefa independente permanece intacta

#### Scenario: Check ABA ausência e claim
- **WHEN** alvo sofreu check/edição A→B→A com timestamp igual, foi removido ou recebeu somente claim
- **THEN** check/ABA recebem CHANGED, ausência REMOVED e claim isolado permite reversão conservando marcador aplicável
- **AND** editRevision ou igualdade de campos/timestamp não substituem revisão completa

### Requirement: Reversão de série é integral

Undo de ação com gerada SHALL comparar revisões completas de alvo e gerada e validar portadora no plano final. Sucesso SHALL restaurar anterior e remover gerada diretamente de tasks num commit. Qualquer mudança/ausência da gerada ou portadora conflitante SHALL recusar tudo, sem nova geração.

#### Scenario: DONE SKIP END e outras transições
- **WHEN** DONE/SKIP/END/fim natural/edição terminal/retirada de regra/reabertura efetivos são desfeitos
- **THEN** estado anterior completo retorna e eventual gerada sai sem ir à lixeira; nenhuma próxima adicional é calculada
- **AND** plano final respeita uma portadora com regra em tasks+trash, qualquer status

#### Scenario: Gerada alterada removida restaurada ou avançada
- **WHEN** gerada foi editada/marcada/excluída/restaurada ou fechou transferindo regra para outra
- **THEN** GENERATED_CHANGED conserva anterior/gerada/sucessora/lixeira inteiras e não desfaz parte da série
- **AND** claim isolado na gerada não bloqueia; portadora concorrente no plano final recebe SERIES_CONFLICT

#### Scenario: Falha entre anterior e gerada
- **WHEN** erro acontece entre restauração do alvo e remoção da gerada ou no COMMIT
- **THEN** rollback/reopen preserva anterior ou novo estado inteiro com revisão coerente, sem meia reversão

### Requirement: Desfazer exclusão usa restore condicionado

Undo de exclusão SHALL conferir a entrada específica, retenção, ID ativo e portadora como restore normal. Sucesso SHALL conservar timestamps originais e dar revisões novas. Ele SHALL não recuperar entradas descartadas por idade/limite ou versão homônima substituída.

#### Scenario: Restore sem abrir lixeira e após vencimento
- **WHEN** usuário desfaz exclusão retida sem abrir área ou depois de 30 dias+1 ms
- **THEN** entrada válida retorna integral sem geração; vencida recebe ENTRY_EXPIRED sem restauração ou expurgo oculto

#### Scenario: Descartes colaterais e concorrência
- **WHEN** move descartou outras entradas ou o alvo foi restaurado/esvaziado/substituído por outra sessão
- **THEN** undo só recupera sua entrada ainda válida; colaterais/versão substituída não retornam e ausência/identidade/ID/série recusam sem perda

### Requirement: Restore e revert liquidam somente ocorrências vencidas

Restore/revert SHALL preservar processedFor atual de ocorrência inalterada e liquidar gatilhos pendentes representáveis <=now, sem aviso retroativo. Futuros SHALL permanecer pendentes. Isso SHALL não habilitar scheduler/notifier nem relaxar bloqueios existentes de prazo/status/fechamento com reminders.

#### Scenario: Igualdade AT OFFSET e markers atuais
- **WHEN** restore/revert inclui AT/OFFSET vencido/exato/futuro e claim de mesma ocorrência confirmado após a ação
- **THEN** vencidos/exatos recebem marker do gatilho, futuro permanece pendente e claim atual não é apagado
- **AND** restore conserva updatedAt, revert o renova e nenhuma mensagem afirma que alarmes foram agendados

#### Scenario: Terminal sem prazo e gatilho extremo
- **WHEN** tarefa é terminal, não tem dueAt ou possui gatilho histórico não representável
- **THEN** terminal segue liquidação pura sem guarda de status ativo, ausência de prazo conserva reminders e gatilho impossível não recebe marker inventado
- **AND** guards D8 das mutações existentes permanecem e nenhum scheduler fictício é chamado

### Requirement: Encerramento e backup invalidam estado temporário

Reload/navegação/crash/fechamento/saída SHALL descartar recibos/tokens próprios sem perder commits. Reabertura SHALL não recuperar histórico. Contrato interno de futuro backup bem-sucedido SHALL invalidar recibos/confirmações/publicações de todas as sessões, inclusive UNCHANGED; cancelamento/falha confirmada SHALL não invalidar as demais.

#### Scenario: Encerrar durante ação e reabrir
- **WHEN** documento encerra com pedido pendente ou commit já confirmado e depois reabre
- **THEN** pedido não iniciado perde admissão, unidade ativa termina/reverte com segurança e tasks/trash confirmados sobrevivem sem recibo antigo
- **AND** minimizar/foco não executa essa limpeza; lifecycle provisório permanece sem bandeja

#### Scenario: Porta futura de backup e candidato tardio
- **WHEN** fixture chama sucesso de backup APPLIED/UNCHANGED ou cancelamento/falha com rollback
- **THEN** sucesso invalida todas as ofertas internas e candidato antigo não publica; cancel/falha não invalida outras sessões
- **AND** trash permanece e não há wrapper/importação/UI de backup nem histórico/credenciais/lixeira exportados nesta Change

### Requirement: Recursos de recibos são limitados antes do efeito

Recibos/confirmações SHALL ter no máximo uma oferta publicada/confirmação corrente por documento e reservas globais de 64 MiB, incluindo candidatos pendentes. Falta de recurso SHALL recusar antes de escrita; limpeza SHALL liberar referências sem timeout de oferta ou truncamento de Task histórica.

#### Scenario: Reserva excedida e oito sessões
- **WHEN** clone/base/recibo não cabe no orçamento ou oito documentos executam ações e limpezas repetidas
- **THEN** RESOURCE_LIMIT preserva dados e ações confirmadas existentes; referências/reservas liberam no consumo/clear/encerramento
- **AND** métricas distinguem charge lógico, heap real e pico de clone; limite não é novo teto de codec

### Requirement: Oferta e resultado preservam anúncio e foco

Oferta SHALL aparecer apenas após ack confirmado e snapshot válido, sem roubar foco. Undo SHALL anunciar sucesso/recusa/erro, manter busy focável e devolver foco a Editar do alvo visível ou ação principal pertinente. Filtros SHALL não ser desfeitos.

#### Scenario: Alvo visível oculto ou falha
- **WHEN** undo conclui/recusa e alvo está visível, oculto por filtro ou lista fica vazia
- **THEN** foco segue Editar ou Limpar filtros/Nova tarefa/Criar primeira tarefa conforme estado, sem cair no body
- **AND** busy impede repetição e anúncio não oferece redo nem promessa de agendamento

#### Scenario: Ack confirmado e snapshot falha
- **WHEN** ack de ação confirma mas ressync não conclui, ou resposta antiga chega em contexto novo
- **THEN** UI informa gravação confirmada/atualização pendente ou descarta oferta antiga, sem upsert, replay ou anúncio falso de rollback
- **AND** snapshot sozinho não cria oferta ou transfere recibo entre documentos
