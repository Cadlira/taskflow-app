# Design

## Context

Ver [proposal.md](C:/QSI/Workspaces/taskflow-app/openspec/changes/preservar-recorrencias-e-subtarefas/proposal.md) para motivação. Base integrada: TFA-004/003, `64fe7adc42b7eb0f4435c02970363f7d6b060e3f`; branch `codex/tfa-005-preservar-recorrencias-e-subtarefas`. Este documento propõe decisões para revisão, não registra sua aprovação nem implementação.

Referências observadas no app:

- [Comandos](C:/QSI/Workspaces/taskflow-app/src/application/tasks/task-commands.ts), [unidade](C:/QSI/Workspaces/taskflow-app/src/application/storage/unit-of-work.ts) e coordenador fazem read/decide/commit no main; `saveTask` substitui ID existente e sozinho não assegura geração única.
- [Schema](C:/QSI/Workspaces/taskflow-app/src/main/storage/product-schema.ts) é SQL 1, codec de payload 4; [executor](C:/QSI/Workspaces/taskflow-app/src/main/storage/product-database.ts) já suporta migração transacional registrada e incrementa revisão global após migrar. Não há migração concreta implantada.
- [Contratos](C:/QSI/Workspaces/taskflow-app/src/contracts/tasks.ts) e estado são v1. Domain recurrence/subtasks possuem só recortes de tipos/validação/progresso; UI restringe recorrência e lembretes, e lê subtarefas.
- [Verificação TFA-004](C:/QSI/Workspaces/taskflow-app/openspec/changes/archive/2026-10-04-migrar-gerenciamento-de-tarefas-e-interface/verification.md) registra D10 de 10.000 reprovado. O archive/merge posterior não tornou essa medição aprovada.

Fonte somente leitura, HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`:

- [Cálculo/geração](C:/QSI/Workspaces/taskflow-extension/src/domain/task-recurrence.ts:130), [draft/âncora](C:/QSI/Workspaces/taskflow-extension/src/domain/task-draft.ts:312), [subtarefas](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:40), [status](C:/QSI/Workspaces/taskflow-extension/src/domain/task-status.ts:7), [orquestração](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts:164).
- Testes de domínio `task-recurrence.test.ts`, `task-subtasks.test.ts`, `task-status.test.ts`, drafts e aplicação `task-service.test.ts` da origem fundamentam os cenários. Serão copiados seletivamente e executados apenas no app.

## Goals / Non-Goals

**Goals:** manter a semântica observada; uma decisão e um commit para fechar/gerar; aceitar save após checks com valores atuais; separar metadados de storage do payload; interface e autoridade consistentes diante de conflitos, precisão, falhas e transporte.

**Non-Goals:** portar TaskService completo, adapters Chrome, scheduler no-op, tokens/histórico/UI de undo, lixeira funcional, importação/backup, novos calendários, otimização por worker/virtualização, multiwindow de produto, instalação/distribuição. Alterações das primitivas já existentes atendem ao novo metadado; não habilitam serviços de TFA-006/008.

## Decisions

### D1 — Reutilização seletiva e dono da decisão

Copiar/revisar regras e testes portáveis, mantendo domínio/aplicação independentes de Vue/Pinia/Electron. Estender os comandos existentes para construir planos puros e aplicá-los na unidade atual. Relógio e IDs são portas do proprietário; ler `now` uma vez na execução admitida, não usar relógio do renderer nem instante capturado antes da fila. Nenhum await, notifier ou shell dentro da unidade.

Alternativas: copiar TaskService inteiro traz orquestração Chrome/undo/reminder antes das respectivas Changes; validar apenas no renderer perde autoridade; decidir antes de enfileirar usa base stale. As três são rejeitadas.

### D2 — Calendário preservado, falha explícita

Manter DAILY 1–365, WEEKLY 1–7 dias distintos 0–6 e MONTHLY 1–31; avanço civil via calendário local do SO no main. Base `anchorAt ?? dueAt`, avançar pelo menos uma vez e depois até instante estritamente maior que `now`. WEEKLY mantém a fase da base; mensal calcula dia pedido em cada mês, reduzindo apenas naquele mês. `until` inclusivo; candidato posterior encerra naturalmente sem gerar. Não gerar no relógio, reopen ou bootstrap, nem criar atrasadas para cada período perdido.

Datas gravadas intactas, inclusive `dueAt`, `until` e `anchorAt` históricos, não passam pelo input de minutos quando não editadas. Alteração explícita normaliza novo instante em ISO, preservando segundos/ms oferecidos pelo comando. `until` é validado contra `dueAt` combinado, como na origem, não contra a âncora. Gaps de entrada são recusados; gap alcançado pelo cálculo usa a normalização civil da origem. Exemplo em America/New_York: 07/03/2026 02:30 → 08/03 03:30 → 09/03 03:30. Não corrigir drift para 02:30. Repetição nova escolhe o primeiro instante da conversão local; intervalo real pode ter 23/25 h. Fuso da série não é persistido: próximas decisões seguem o SO corrente; mudar fuso com edição de prazo/limite exige revisão explícita do draft.

O cálculo puro retorna união finita `NEXT`, `EXHAUSTED`, `OUT_OF_RANGE`, `RESOURCE_LIMIT`; máximo **32.768 passos** por decisão. Cada passo verifica instante representável/finito e avanço estritamente positivo antes de ISO. `OUT_OF_RANGE` vira `RECURRENCE_OUT_OF_RANGE`; excesso vira `RESOURCE_LIMIT`. Ambos recusam toda mutação, não removem regra, não mudam status/revisões e não convertem erro em fim natural. O limite é de recurso, não de duração da série. Até candidato válido > until é fim natural; não pular o erro de representabilidade para encerrar. Medir o pior caso no runtime alvo antes de afirmar latência. Acelerar por milissegundos ou saltos aritméticos mudaria DST/fase e fica excluído; mudar limite/abordagem requer revisão.

### D3 — Âncora, identidade e fechamento atômico

Edição usa valores combinados atuais+patch. Regra omitida conserva; `null` retira regra e conserva status/seriesId. Objeto de regra oferece frequência/parâmetros exatos e `until` opcional: omitido conserva limite existente, `null` o retira, string o altera; criação não tem limite se omitido. Renderer nunca fornece anchorAt/seriesId. Ao mudar prazo/regra de portadora existente, a âncora é a antiga `anchorAt ?? dueAt`; permanece se divergir do novo prazo e desaparece ao retornar ao mesmo texto ISO. Isso vale também quando regra e prazo mudam juntos. Regra nova sem anterior não recebe âncora. Regra adicionada à tarefa de série histórica mantém seriesId, sujeita a portadora única; nunca reconecta automaticamente a portadora atual.

Criação inicial, inclusive DONE/CANCELLED com regra, só cria e não gera, como na origem. Comando de mesmo status ou patch efetivamente vazio permanece no-op conforme contrato desktop. Uma edição efetiva que resulte em terminal com regra pode fechar/gerar, como update da origem; isso inclui adicionar regra a terminal histórica. CANCELLED nesse plano exige SKIP/END. `setSubtaskDone` nunca fecha/gera, inclusive na criação terminal histórica.

Plano de fechamento: conferir existência/revisão/portadora; aplicar patch/status; escolher DONE ou CANCELLED+SKIP/END; calcular candidato quando pertinente; validar/copiar próxima; conferir todas as identidades; remover regra da fechada; gravar fechada e gerada na mesma unidade, com uma revisão global. DONE/SKIP transferem regra para próxima TODO; END não gera. Até fim natural sem candidato, fechada perde regra. Sem candidato não se inventa outro seriesId. A antiga conserva seriesId e completedAt só se DONE; reabrir vai TODO sem restaurar regra nem gerar.

Nova ocorrência tem id novo, mesma série, campos básicos/tags/origem/prioridade/pessoas/descrição copiados, prazo calculado, createdAt=updatedAt=now, sem completedAt. Copia frequência/parâmetros/until sem âncora antiga. Subtarefas conservam títulos/ordem, todos done=false e IDs novos. Contrato puro copia apenas OFFSET com IDs novos e sem processedFor; fechamento real de tarefas com lembretes continua guardado por D8.

IDs UUID gerados pelo main: até três tentativas por identidade. Tarefa nova não colide com tarefas/lixeira; nova série não reutiliza seriesId de nenhuma dessas coleções nem identidade de tarefa reservada pelo mesmo plano. Itens/reminders novos não reutilizam IDs antigos do conjunto substituído nem duplicam IDs na lista nova. Gerador injetado colidente resulta em `IDENTITY_CONFLICT` e rollback, nunca upsert substituindo outra tarefa.

Uma portadora é qualquer registro com regra e seriesId, independentemente de status, em tarefas **ou lixeira**. Checagem coordenada percorre ambas as coleções sem regravar payload. Regra+seriesId duplicados não tornam leitura vazia/inválida por nova regra retroativa, mas operações que mudam regra/prazo ou consomem a portadora retornam `SERIES_CONFLICT`. Edição independente e marcação continuam possíveis. Antigas reabertas sem regra não contam. Validar unicidade do plano final, não o estágio intermediário de salvar fechada+gerada. Não introduzir registro separado de séries, índice de JSON ou reparação automática; medir custo da varredura com 10.000. Casos de reparação material precisam de proposta própria.

### D4 — Dois níveis de revisão persistida

**Recomendação:** `editRevision` monotônica por tarefa/lixeira além de `contentRevision`. São metadata de storage, não campos Task nem backup. Representação bigint internamente, decimal exato no IPC, mesmos limites atuais; validar `1 <= edit <= content <= global`. Cada commit aloca g=global+1 uma vez.

| Alteração efetiva | Global | contentRevision | editRevision | updatedAt |
| --- | --- | --- | --- | --- |
| Criar/gerar/restaurar/recriar ID | g | g | g | do caso de uso |
| Campos básicos/status/regra/IDs-títulos-ordem de subtarefas | g | g | g | now |
| Somente done, por comando de marcação tipado | g | g | conserva | now |
| Claim/processedFor de ocorrência inalterada | g | conserva | conserva | conserva |
| Recusa/no-op/rollback | conserva | conserva | conserva | conserva |

Form/status recebem `expectedEditRevision`, e conferem na unidade atual. Se checks ocorreram, edit não mudou: construir lista por id/título e done lido **agora**, não de snapshot antigo. Mudança estrutural ou básica por outra sessão muda edit e conflita mesmo se voltou ao valor anterior. Não atualizar base silenciosamente nem fazer merge geral. Mesma regra para o seletor de status: checks não impedem intenção estrutural; status concorrente muda edit e impede segundo fechamento. Toggle recebe expectedEditRevision, subtaskId e **done desejado**, lê atual e só altera esse item. Checks concorrentes serializam sem conflito entre si; última intenção aplicável vence no mesmo item, repetição já satisfeita é no-op. Alteração estrutural anterior conflita conservadoramente; item ausente com base atual é `SUBTASK_NOT_FOUND`.

Criação/recriação/restauração sempre obtém edit g novo: tarefa removida/recriada, item removido/reintroduzido e edição A→B→A não reutilizam autorização antiga. Não é necessário terceiro revision/incarnation por tarefa nem revisão por item. Primitivas genéricas de save/replace/revert tratam conteúdo alterado como edição e atualizam ambas; apenas operação tipada `setSubtaskDone` conserva edit. Nenhum flag de renderer escolhe classificação. Claim é a única alteração interna já existente que conserva ambas. Atualizar todas as portas, codecs de linha, outcomes, mocks e snapshots; nunca usar default em leitura SQL 2 que oculte metadata inválida.

Alternativas: (a) CAS só de conteúdo é menor, mas rejeita save após checks e contraria preferência humana; (b) token de edição mantido no main evita coluna, mas precisaria registrar base/fingerprint por documento, lifecycle, expiração e invalidar ABA/reopen; (c) hash estrutural volta ao mesmo valor em ABA. SQL revision persiste em reopen, aproveita unidades existentes e permite verificação simples. Escolha implica migração explícita sujeita à revisão.

### D5 — Subtarefas e drafts atuais

Até 20, trim título novo/renomeado 1–200, um nível e sem status/prazo/reminder próprios. Títulos iguais são permitidos; ID vazio/repetido/fora da tarefa é recusado. Criação aceita apenas título; edição aceita título e id opcional: id presente deve existir atualmente, ausente pede ID novo/desmarcado. A lista enviada define ordem e itens removidos; propriedade ausente conserva; [] limpa. done é proibido no formulário. IDs removidos não são ressuscitados por draft antigo: edit stale conflita; id inexistente com base atual falha. IDs iguais em tarefas distintas não são colisão de domínio. Título histórico intacto conserva valor aceito pelo codec; mudar outro campo não força revalidação retroativa. Se uma lista precisa ser enviada por reordenação, título exatamente igual ao atual permanece intacto; novos/renomeados recebem limite.

Mesmo status, mesmos itens/ordem/títulos e nenhum campo efetivamente alterado não gravam. Após toggle atualizar contador derivado do snapshot, sem persistir progresso. Não há vínculo automático done/status nem limpeza de checks ao concluir/reabrir. Só nova ocorrência os reinicia. Fonte [build/toggle/reset](C:/QSI/Workspaces/taskflow-extension/src/domain/task-subtasks.ts:90); a retenção de campos omitidos e recusa de ID removido adaptam segurança do patch desktop, em vez de copiar fallback da origem que reintroduziria o item.

### D6 — Catálogo e compatibilidade IPC fechados

Nove wrappers de produção, nenhum canal genérico. Trocar estado (snapshot/subscribe/unsubscribe/eventos) para v2 com revisão de conteúdo **e edição** em cada tarefa/entrada de lixeira. Main/preload/renderer mudam juntos no mesmo pacote; não negociar downgrade nem aceitar v1 de estado/mutação. `verifyFoundation` e `openTaskSource` preservam v1, autorização e comportamento atuais. OpenTaskSource continua exigindo revisão de conteúdo atual.

| Wrapper | Request exato proposto |
| --- | --- |
| createTask | `{version:2,draft}`: básicos existentes + recurrence opcional (sem null/anchor, until string ou omitido) + subtasks `{title}[]`; sem reminders |
| updateTask | `{version:2,taskId,expectedEditRevision,patch,cancellation?}`: básicos + regra/null + `{id?,title}[]`; cancellation SKIP/END somente se plano termina CANCELLED com regra |
| changeTaskStatus | `{version:2,taskId,expectedEditRevision,status,cancellation?}`: escolha somente CANCELLED com regra |
| setSubtaskDone | `{version:2,taskId,expectedEditRevision,subtaskId,done}`: boolean explícito |
| openTaskSource | v1 atual com taskId/expectedContentRevision |
| verifyFoundation | v1 atual |
| getStateSnapshot/subscribeState/unsubscribeState | shapes atuais, version:2; cursores/inscrição opacos da própria sessão |

Recurrence é união exata: DAILY intervalDays, WEEKLY weekdays ou MONTHLY dayOfMonth, mais until opcional conforme D3. Campos de frequência alheia são recusados. CANCELLED com portadora e sem escolha devolve `RECURRENCE_CHOICE_REQUIRED` sem write; escolha em plano não pertinente é `INVALID_REQUEST` sem write. Criação CANCELLED não exige escolha porque não fecha. Update sem alteração efetiva não fecha; escolha extrínseca não provoca write.

Requests recusam Task livre, auditoria, seriesId/anchorAt, done nos drafts, reminders/processedFor, depth/children, IDs de criação, URL/path/opções de shell e UndoPlan. Parsers usam plain objects/chaves exatas antes de dados; domínio valida sem confiar no preload. Autorizar em admissão, execução e saída como hoje; envelopes/eventos validam versão e metadados runtime. Invalidação da sessão impede entrega, não desfaz commit.

Ack mutação v2: `{version:2,status:'ok',revision,contentRevision,editRevision}`; create acrescenta taskId. No-op usa revisões atuais sem evento. Ack não devolve Task, IDs históricos de request ou plano da gerada; snapshot autoritativo ≥ ack mostra antiga e próxima juntas. Falha/incerto conserva draft/estado stale e exige ressync/nova decisão, sem replay nem inferência por título. Eventos v2 seguem invalidações pequenas pós-commit; não são patches.

Códigos comuns de transporte/estado permanecem fechados. Mutação adiciona `RECURRENCE_CHOICE_REQUIRED`, `RECURRENCE_OUT_OF_RANGE`, `SERIES_CONFLICT`, `IDENTITY_CONFLICT`, `SUBTASK_NOT_FOUND`; conserva VALIDATION_FAILED/CONFLICT/NOT_FOUND/ADVANCED_TASK_RESTRICTED e BUSY/RESOURCE_LIMIT/erros de storage/sessão previstos. `CONFLICT` pode expor currentEditRevision/currentContentRevision, nunca conteúdo. VALIDATION_FAILED conserva códigos básicos existentes e adiciona REQUIRED/INVALID_VALUE/TOO_LONG/TOO_MANY/DUPLICATE_ID/UNKNOWN_ID/DUE_REQUIRED/UNTIL_BEFORE_DUE/ABSOLUTE_REMINDER_INCOMPATIBLE nos campos pertinentes. Erros avançados têm forma finita por recurrence.frequency/intervalDays/weekdays/dayOfMonth/until, subtasks.list e itens index 0–19/title/id; nenhuma mensagem arbitrária ou chave recebida é refletida.

Budgets preservados: 64 KiB request de cada um dos cinco comandos, 8 KiB resposta; 1 KiB estado/diagnóstico/evento; páginas 256 KiB com fragmentação histórica. Medição da proposta com JSON completo e controle escapado seis bytes por caractere: 20×200 títulos, campos básicos nos limites, tags distintas, URL ASCII de 2.081 e UUIDs de 36, envelope/revisão decimal máxima: **55.047 bytes create / 56.020 update**, abaixo de 65.536. A medição é de serialização fictícia, não gate de runtime/validação. Confirmar nos testes também Unicode suplementar e pior escape. IDs/URLs históricos não têm limite retroativo: omitir campos intactos, medir request completo e recusar excesso explicitamente, preservando preenchimento/banco. Não aumentar orçamento silenciosamente nem truncar IDs/títulos para salvar.

### D7 — Interface, precisão e escolha de cancelamento

Adaptar Vue/Pinia existente: formulário tem frequência/parâmetros/limite e lista ordenada com adicionar/remover/mover por botões de teclado. Manter editor básico, tags, filtros, pesquisa e ordenação. Abrir edição mantém ISO original de prazo/limite; só campos alterados passam pela conversão local. Fuso revisado para qualquer data editada. Form não envia done nem regra/lista intactas. Opção de retirar regra é explícita, preserva status e avisa que encerra futuras gerações daquela portadora.

Cartões mostram resumo/regra/progresso e expansão transitória por tarefa/superfície, sem gravar preferência. Checkbox em qualquer status usa intenção done atual, busy focável com aria-disabled e bloqueio de ação repetida; falha recupera o controle e não inventa marcação confirmada. Estado atual e contagem vêm do snapshot. Ao sumir cartão/novo item no filtro, manter política de foco equivalente/vizinho existente.

CANCELLED recorrente por Enter/ponteiro ou save abre diálogo acessível SKIP/END com abandonar/Escape, sem gravar antes da escolha; base da edição não é trocada silenciosamente durante diálogo. **Focusout** para CANCELLED recorrente restaura seleção, não abre diálogo, não envia comando nem rouba foco. Esse caso é exceção documentada ao seletor básico. DONE não exige esse diálogo. Diálogo abandonado mantém dados/draft; escolhas bloqueadas por lembretes mostram motivo D8 e não criam falso fluxo funcional.

### D8 — Lembretes: bloqueio temporário preciso

Nenhum scheduler/settlement/reconcile/notificação é entregue. Guard no main sobre estado e plano atuais, independentemente da UI: se tarefa contém lembretes e plano muda efetivamente dueAt/status **ou** fecha/gera ocorrência, recusar `ADVANCED_TASK_RESTRICTED`. Isso inclui DONE/SKIP/END, edição efetiva em terminal que fecharia regra e remover regra combinado com mudar status/prazo. Preservar banco/regra/reminders/marcadores/revisões.

Permitir título/descrição/tags/pessoas/prioridade/origem, estrutura/marks das subtarefas, rule edit em não terminal sem mudar prazo/status nem fechar, e retirada isolada da regra conservando status/prazo. Criação não admite reminders. Adicionar regra a tarefa com AT é validação `ABSOLUTE_REMINDER_INCOMPATIBLE`, sem apagar o lembrete. No-op verdadeiro continua no-op. Claim interno em fixture conserva marcadores/revisões D4, não anuncia scheduler disponível.

Texto acessível proposto: “Esta tarefa tem lembretes. Alterar prazo ou status e gerar outra ocorrência depende da integração de lembretes.” Retirada isolada: “Remover a recorrência mantém o status, o prazo e os lembretes desta tarefa.” Mensagens são strings locais por códigos, não payload IPC.

Contrato TFA-008: next occurrence pura copia OFFSET, IDs novos/sem processedFor; settlement de vencidos e reconcile **após** commit durável; claim revalida ocorrência antes do efeito; falha externa não reverte tarefa/gerada e não repete commit. Testes de contrato usam helpers puros e primitivas internas atuais; integração funcional só em TFA-008.

### D9 — Contrato futuro de desfazer e lixeira

Não criar UndoPlan público, token, histórico, botão ou serviço de undo. Manter reversão interna existente por contentRevision completa de anterior e gerada, verificadas juntas: alteração de qualquer campo ou done da gerada bloqueia remover; claim isolado não bloqueia. Reversão válida precisa restaurar a anterior e remover gerada no mesmo commit, preservando processedFor aplicável e portadora única no plano final. Revisões novas para conteúdo restaurado impedem ABA; não usar updatedAt/editRevision para autorizar undo.

Lixeira futura conserva regra/dados/revisões no move; restore recebe novas revisões de tarefa ativa, nunca gera ocorrência por si, e deve revalidar colisão de ID/portadora antes de retornar. TFA-005 testa fidelidade/metadata nas primitivas já existentes e fixa cenários de regressão. A integração dessas ações à UI/políticas/retenção continua na TFA-006; não apresentar tais contratos como funcionalidades prontas.

### D10 — Aceitação e evidência

Critérios R01–V01 da exploração são contratos de implementação futura, não testes já executados nesta proposta:

| Critério | Evidência requerida no apply |
| --- | --- |
| R01 | Limites exatos/excedidos das três regras, prazo obrigatório, until inclusivo/antes do due, AT incompatível, erros posicionais |
| R02 | Jan→Fev→Mar dia 31, fevereiro leap/nonleap, semanal fase/dias, DAILY365, fechamento cedo/atrasado/now exato e perdas sem backlog |
| R03 | UTC/São Paulo/New York, 23/25 h, gap drift/repetição, mudança de fuso e segundos/ms/ISO intactos |
| R04 | Adiar/retornar âncora; regra+prazo juntos; retirar regra mantendo série/status/precisão; no rebase geral |
| R05 | DONE/SKIP/END/fim natural, criação terminal, cópia de campos, IDs novos e atomicidade de antiga+gerada |
| R06 | Escolha obrigatória/abandonada, focusout sem ação, reabertura histórica sem regra/geração, no-op terminal |
| R07 | Falha entre writes/cálculo/IDs/COMMIT; kill em barreiras antes/durante/depois de commit e resposta, reopen inteiro |
| R08 | Duas sessões fecham mesma base, portadoras históricas duplicadas inclusive trash, ABA tarefa/item, resposta perdida sem replay |
| S01 | 0/20/21 itens, títulos 0/200/201, trim, duplicatas/unknown ID, ordem manual, omit/[] e histórico intacto |
| S02 | Toggle nos quatro status, intenção/no-op, vários itens/mesmo item, status/reminders independentes e claim atual |
| S03 | Save após checks conserva done; estrutura A→B→A conflita; metadata/reopen/migração/limite de revision |
| U01 | Teclado/diálogo/expansão/busy/foco/erros/contraste, janela mínima/zoom200%; DPI/leitor de tela humanos identificados |
| I01 | Nove wrappers, v1 negativo/v2 exato, bytes/escaping/histórico, guards em três fases, ack/snapshot/reload/cleanup |
| C01 | Fixtures puras e primitivas do contrato TFA-006/008, sem serviços/UI/notificação futura disponíveis |
| V01 | 32.768 passos e overflow, produto/bridge no Electron empacotado fictício, migração/kill, varredura série e gates herdados |

Executar gates existentes lint/typecheck/test/build (`npm run validate`), package/verify/smoke pertinentes no apply sem executar Setup, e OpenSpec estrito. Runtime de referência instalado no projeto: Electron 44.5.1, Node embarcado 24.21.0, SQLite 3.53.4; validar versões efetivas e configuração em cada pacote. Não instalar dependências para esta proposta.

Preservar D10 herdado de TFA-004: montagem ≤5 s, UI p95≤500 ms e heartbeat≤250 ms, main página/mutação p95≤100 ms. Histórico 10.000: 521,5/578,9 ms, reprovado; smoke pode terminar exit1 por esse gate. Separar falha herdada de regressão nova, sem remover gate, virtualizar, cortar registros ou afirmar verde. Reportar impacto da varredura/novos controles; desvio novo material exige revisão. Relatório `verification.md` só no futuro verify do apply; aprovação humana antes de archive.

## Risks / Trade-offs

- [Schema 2 impede leitor antigo] → migração validada atômica e recusa de downgrade; aprovar compatibilidade antes de aplicar, sem reset/exportação automática.
- [Mudança de fuso/gap surpreende calendário] → preservar comportamento observado, revisão de inputs e cenários com clock/TZ determinísticos; sem timezone por série.
- [Portadoras duplicadas históricas] → preservar leitura/dados e recusar decisão afetada com código claro; reparação fica fora da Change.
- [32.768 passos e varredura sincronamente custosos] → limite determinístico e medição empacotada; não alegar timeout que interrompe commit nem saltar períodos por aproximação.
- [Checks invalidam undo mas permitem save] → revisão de conteúdo completa permanece independente; teste conjunto contra regressão de classificação interna.
- [IDs históricos excedem request] → recusa segura e manutenção integral de banco/draft; orçamento não é limite retroativo do codec.
- [Lembretes guardados deixam paridade parcial] → mensagens e documentação explícitas, nenhuma remoção de dados/scheduler fictício; integração na TFA-008.
- [D10 herdado permanece reprovado] → retê-lo e distinguir evidência histórica/atual, decisão própria para revisão material de desempenho.

## Migration Plan

1. No apply aprovado, registrar SQL 2 de produto e migração concreta 1→2 na definição existente. Reconstruir tasks/trash com coluna `edit_revision INTEGER NOT NULL CHECK(edit_revision > 0 AND edit_revision <= content_revision)`, mesmas PKs/STRICT/WITHOUT ROWID e demais campos. SQL do main é constante; sem JSON/payload rewrite. Validar fonte com leitor 1 e destino com leitor 2 apropriados por versão.
2. Na mesma transação, preencher edit_revision=content_revision de cada registro, conservar payload_json/payload_version/IDs/ordem/deleted_at/content_revision; schema metadata/user_version=2. Como executor atual, global_revision avança **uma vez** por migração; não tratar como edição de tarefas. Se limite de revision impede avanço, recusar e preservar origem.
3. Em perfil novo inicializar SQL 2 diretamente, revisão global0, sem registros/defaults artificiais. Em SQL2 validar todas as novas metadata; repetir bootstrap/reopen não altera revision ou migra novamente.
4. Fault injection e kill antes/durante/migrate:before-commit deixam SQL1 completo; depois de commit deixam SQL2 completo. Não apagar auxiliares do motor. Prova, extensão e backups não migram. Preservar coexistência histórica do mesmo ID nas coleções.
5. Pacote atualizado transporta estado/mutações v2 conjuntamente. Abrir cria novas sessões/cursores, recusando clientes antigos. Não admitir requests v1 de mutação como alias mais permissivo.
6. Rollback de binário após commit encontra schema futuro e recusa sem alterar banco. Rollback automático de dados/downgrade não é suportado; um procedimento de restauração, se requerido, precisa de revisão própria. Falha de migração anterior ao commit permite continuar com binário antigo após reopen validado.

Não há dúvida material deixada para o apply: revisão SQL/IPC, guarda de lembretes e limite de passos são escolhas explícitas desta proposta. Aprovação dos artefatos ainda está pendente. Ajustes de redação visual e nomes internos podem ser refinados sem alterar esses contratos; qualquer mudança observável exige revisar os artefatos antes de implementar o ponto.
