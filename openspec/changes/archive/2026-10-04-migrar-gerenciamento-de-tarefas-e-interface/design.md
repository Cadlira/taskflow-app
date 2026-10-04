# Design

## Context

TFA-004, proposta de 2026-10-04 **aprovada explicitamente em 2026-10-04**, conforme evidência no roadmap; motivação em [proposal.md](proposal.md). Dependência TFA-003 integrada no merge `d74e02df7aa38e13fd631a6a83ab2d07b96d8e42`, com TFA-001/002 arquivadas. Branch própria existente; extensão somente leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Commit/push dos artefatos autorizados; apply ainda depende de novo pedido.

O app já tem Vue/Pinia, Electron 44.5.1, TypeScript estrito, build/CI/NSIS, renderer isolado, sessões por documento, preload explícito e SQLite coordenado no main. Banco de produto: `<userData>/data/taskflow.sqlite`, schema SQL 1, codec 4, DELETE/EXTRA; `StorageCoordinator.run` e `updateTaskConditionally` coordenam existência/revisão e conservação de processedFor. Snapshot completo, contentRevision decimal, eventos de invalidação, paginação interna, foco/30 s e stale estão entregues. `src/renderer/src/App.vue` ainda é diagnóstico; `src/contracts/desktop-api.ts` tem quatro operações, sem comandos de tarefas/URLs.

Fontes verificadas: [exploração G01–G20](../../../docs/roadmap.md), [arquitetura](../../../docs/architecture.md), [paridade](../../../docs/parity-matrix.md), [testes](../../../docs/test-strategy.md), [persistência e IPC](../../../docs/local-persistence-and-state-ipc.md) e [verificação TFA-003](../archive/2026-10-04-implementar-persistencia-local-e-fronteira-ipc/verification.md). Na origem: `TaskManager.vue`, `TaskForm.vue`, `TaskList.vue`, `TaskFilters.vue`, store, task-draft/status/queries/date-time e testes citados no roadmap. Nenhum teste/build/escrita ocorreu na extensão.

## Goals / Non-Goals

**Goals:** adaptar intenções básicas ao coordenador existente; conservar identidade/interação e dados ocultos; tornar conflito, resultado incerto e limites verificáveis; prover rastreabilidade dos três deltas e G01–G20.

**Non-Goals:** segunda janela de produto, TaskService completo, scheduler no-op, emulação Chrome, nova stack/driver/dependência, worker, mudança de schema/codec, consolidação das specs no propose e antecipação de recursos posteriores. As exclusões de produto estão em proposal.

## Decisions

### D1 — Reutilização seletiva na stack existente

Copiar no apply somente os arquivos/trechos e testes revisados necessários. Manter `task.ts`/codecs já portados; acrescentar regras básicas de draft/status/queries e helper de datas, sem duplicar definições. Campos básicos e estilos de TaskForm, TaskFilters, apresentação/teclado de TaskList e fluxo básico de TaskManager são candidatos; imports/fieldsets/handlers de IA, recorrência, subtarefas editáveis, lembretes, capture, backup, trash e undo não entram. Store passa a depender de porta explícita de aplicação desktop; composição da plataforma fica fora dos componentes.

| Alternativa | Decisão e motivo |
| --- | --- |
| Cópia revisada + porta desktop + casos de uso portáveis | Escolhida: conserva CSS/testes/comportamento e usa a fundação entregue. |
| Manager/form/store/TaskService completos com serviços fictícios | Rejeitada: controles sem implementação, dependências avançadas e atualização destrutiva por omissão. |
| Quasar/rewrite visual | Rejeitada neste recorte: não há benefício que compense reconstruir paridade e teclado. |
| Task completo/writer no renderer | Rejeitada: campos de autoridade e decisão stale escapam da transação. |

Organização candidata coerente com o repo: regras em `src/domain`, casos de uso/portas em `src/application/tasks`, DTO/guards em `src/contracts/tasks.ts`, handlers/opener/composição em main, wrappers em preload e componentes/store/helper em `src/renderer/src`. Nomes internos podem ser refinados sem alterar o contrato. Fronteiras continuam vedando Vue/Pinia/Electron/Node/rede no núcleo e autoridade de sistema no renderer.

### D2 — Catálogo fechado v1 e intenção de edição

Preservar as quatro operações existentes e acrescentar exatamente `createTask`, `updateTask`, `changeTaskStatus`, `openTaskSource`. Cada wrapper chama canal dedicado v1; nenhum send(channel), callback remoto, URL livre ou hook de teste na bridge normal. Reusar guardas de documento/main frame/origem real/URL e schema exato antes de admissão, execução e saída.

| Comando | Request lógico | Sucesso lógico |
| --- | --- | --- |
| createTask | `{version:1,draft}` | `{version:1,status:'ok',taskId,revision,contentRevision}` |
| updateTask | `{version:1,taskId,expectedContentRevision,patch}` | `{version:1,status:'ok',revision,contentRevision}` |
| changeTaskStatus | `{version:1,taskId,expectedContentRevision,status}` | mesmo ack de update, inclusive no-op |
| openTaskSource | `{version:1,taskId,expectedContentRevision}` | `{version:1,status:'ok'}`; significa solicitação aceita pelo sistema |

Draft de criação aceita somente title obrigatório, description/requester/assignee/status/priority/dueAt/tags/sourceUrl opcionais; omissão usa os defaults conhecidos. Patch aceita apenas essas nove chaves, todas opcionais, com **ausente = conservar**. null limpa description/requester/assignee/dueAt/sourceUrl; [] limpa tags. title/status/priority não aceitam null. Valores vazios em textos opcionais alterados também normalizam para ausência, conforme a origem. Task ID é string não vazia compatível com o codec histórico; não exigir UUID no endereço de tarefa existente. Revisão de conteúdo é decimal canônica positiva até o máximo SQLite existente, sem conversão para Number.

O renderer compara os valores do formulário com a base e envia somente intenção realmente alterada; não reconstruir a tarefa a partir dos fieldsets visíveis. Main normaliza/revalida campos presentes e valida a tarefa resultante pelo codec existente. Um campo histórico intacto acima do limite de formulário permanece válido; se alterado, sua nova entrada precisa cumprir o limite. Nunca invocar cegamente o `updateTask` integral da origem: reminders omitidos viram [] e recurrence omitida desaparece. Subtarefas/seriesId/recurrence/reminders/processedFor e auditoria não são chaves permitidas no request.

Alternativa de draft completo mais flag keepAdvanced exige reenviar valores históricos e multiplica estados de omissão/limpeza; patch explícito é menor e conserva dados sob CAS. Patch vazio é no-op; status igual só é no-op quando a revisão esperada é válida. Enviar patch semanticamente alterado mantém a auditoria da edição; mudar status aplica completedAt da regra portável.

### D3 — Transação, IDs, revisões e advanced guards

Clock e geração UUID são portas injetadas na composição main. Dentro de `StorageCoordinator.run`: validar existência, revisão, restrições e campos alterados; produzir Task completa a partir da atual; confirmar com primitives existentes. Não ler na UI e depois chamar saveTask como protocolo de edição. Criação verifica colisão em tarefas e lixeira antes de saveTask; até três tentativas de UUID e RESOURCE_LIMIT final sem sobrescrever dados. Não é retry de comando/commit.

Edição/status usam `updateTaskConditionally` e contentRevision, nunca timestamp ou revisão global. Main traduz NOT_FOUND/CONFLICT; no-op não incrementa revisão/evento e não modifica timestamps. Claim isolado não muda contentRevision e seus marcadores atuais sobrevivem à edição independente. Unidades são síncronas; nenhum await/shell/rede dentro da transação. Ack vem somente após confirmação; falha de commit/rollback segue classificação/reopen já entregue.

Recorte conservador aprovado:

| Dados existentes / ação | Tratamento nesta Change |
| --- | --- |
| recurrence presente | Sem mutação, inclusive patch vazio/status; leitura/pesquisa e abertura de origem continuam possíveis. SeriesId sozinho não bloqueia ocorrência histórica sem regra. |
| subtasks presentes, sem recurrence | Preservar e apresentar itens/progresso somente leitura, sem adicionar/marcar/reordenar; campos básicos e status independentes continuam disponíveis. |
| reminders presentes, sem recurrence | Preservar integralmente; rejeitar mudança **efetiva** de dueAt ou status, inclusive no patch. Edição independente e status já atual com base válida não disparam scheduler. |
| excluir/trash/undo | Sem botão ou comando; permanecem na TFA-006. |

Restrição é também aplicada no main e devolve ADVANCED_TASK_RESTRICTED; a UI explica a indisponibilidade em linguagem de produto, sem IDs de Changes. Isso evita liquidar/gerar ocorrências com uma migração parcial. Antecipar exclusão recuperável é alternativa material, não autorizada pelo prompt; exige rever este plano e o recorte da TFA-006 antes de apply.

### D4 — Bytes, admissão e erros públicos

Escolha proposta: **64 KiB UTF-8 JSON serializado por request dos quatro comandos**, incluindo envelope/escaping; **8 KiB por resposta**. Os valores máximos finitos de campos básicos, inclusive controles escapados, cabem nessa ordem de grandeza; testar a composição máxima em vez de afirmar pela contagem de caracteres. sourceUrl e taskId históricos são limitados apenas pelo orçamento do request, não por novo codec/maxlength persistente. IDs enormes podem tornar uma ação explicitamente indisponível; não os cortar ou substituí-los para caber. A edição omite valores históricos intactos.

Leitura/diagnóstico/eventos continuam 1 KiB; página 256 KiB com fragmentação; cursor/inscrição/documentos e fila permanecem como TFA-003: 64 entradas totais, 8 por sessão, espera 2 s, lock configurado 100 ms, até oito documentos. Ack de update/status não repete o taskId potencialmente grande nem Task; criação devolve UUID novo. Não ampliar STATE_LIMITS para acomodar um formulário.

Erro padrão `{version:1,status:'error',code}`. Comandos de escrita admitem os erros comuns de request/autorização/sessão/BUSY/recurso/incompatibilidade/corrupção/armazenamento, mais VALIDATION_FAILED/CONFLICT/NOT_FOUND/ADVANCED_TASK_RESTRICTED. VALIDATION_FAILED traz mapa das nove chaves básicas para REQUIRED, TOO_LONG, TOO_MANY, INVALID_VALUE, INVALID_DATE ou INVALID_URL, sem valores recebidos/mensagens arbitrárias; messages pt-BR são mapeadas na UI. CONFLICT pode trazer currentContentRevision. Opener usa erros comuns/CONFLICT/NOT_FOUND e SOURCE_NOT_AVAILABLE/SOURCE_NOT_ALLOWED/SOURCE_TOO_LONG/EXTERNAL_OPEN_FAILED. Listas de códigos são específicas da operação; não fazer leitor aceitar erro exclusivo do shell.

Objeto/protótipo/chaves/tipos/versão/bytes são validados no main antes de acessar dados, e respostas no preload. Limite de bytes excessivo é INVALID_REQUEST; indisponibilidade de recurso admitido é RESOURCE_LIMIT. Falha de transporte/saída inválida é condição local de resultado não confirmado, sem inventar envelope de erro main ou anunciar rollback. Nada de instanceof remoto, stack/cause/path/SQL/payload/URL em logs.

### D5 — Store, subscription e confirmação visual

Pinia guarda filtros/ordem/seleção/draft e estado de apresentação, não decide persistência. Conectar uma inscrição existente ao montar, receber somente snapshot completo validado, ignorar regressões e limpar inscrição/timers no unmount. Handshake/fragmentação/30 s/foco são do state client entregue, sem duplicar listeners ou segundo poller. Clock dos badges é distinto e fica no renderer (60 s + foco/resume), sem scheduler de lembretes.

Estados explícitos: loading sem snapshot; ready; empty real; sem resultados; stale com snapshot anterior; blocked/error inicial; submitting; confirmed-awaiting-snapshot; outcome-unknown. Stale bloqueia comandos dependentes de estado enquanto conserva draft/filtros/lista. Erro de corrupção/incompatibilidade não oferece reset; Retry apenas reconcilia sob autorização corrente.

Ack confirmado permite mensagem de sucesso de persistência; não deve mostrar lista nova derivada de upsert local. Aguardar snapshot >= revision do ack para encerrar formulário/retornar foco e concluir sincronização. Snapshot mais novo vence ack antigo. Se ressync falhar depois do ack, mostrar tarefa salva e atualização pendente, conservando inputs até reconciliação; não anunciar que save falhou nem reenviar. Duplicação por Enter/click/focusout é bloqueada por ação em curso sem retirar foco do controle.

### D6 — Conflito e resultado incerto com draft intacto

CONFLICT conserva exatamente draft e revisão-base. A lista pode atualizar; inputs não. Mensagem focável: a tarefa mudou e o preenchimento não foi aplicado. **Conferir versão atual** mostra os campos básicos atuais em leitura, sem alterar draft/base; **Manter preenchimento** permite continuar conferindo/copiar manualmente por recursos nativos de texto, sem API nova de clipboard; **Recarregar tarefa** pede confirmação explícita de descarte e só então usa dados/revisão atuais. Não existe rebase automático, botão que só troca a revisão e reenvia, ou merge automático. Reaplicar valores é uma nova edição manual depois da revisão/reload. NOT_FOUND conserva draft, oferece conferir lista e não cria tarefa silenciosamente.

Se transporte falhar depois de envio, resultado pode ser incerto. Conservar draft, impedir reenviar e oferecer **Conferir lista** por ressync. Para edição, revisão atual ajuda a conferir; para criação, título igual não prova identidade/commit. Depois da conferência, o usuário pode abandonar o draft ou iniciar explicitamente uma nova criação a partir do preenchimento, avisado de que deve conferir possível criação anterior; nada é enviado só por renovar sessão. Não acrescentar protocolo persistente de idempotência nesta Change. Salvar de novo automaticamente após timeout é alternativa rejeitada por risco de duplicação.

### D7 — Prazo local e precisão preservada

Reutilizar helper local da origem e seus casos, com os ajustes documentados. Formulário guarda ISO original, valor exibido inicialmente, flag de intenção de alteração e identidade do fuso via porta local. Prazo intacto sai **ausente do patch**, conservando segundos/milissegundos e uma eventual segunda ocorrência de hora repetida. Entrada nova/alterada usa conversão local e comparação das partes; gap/data impossível falha, hora repetida nova escolhe a ocorrência anterior como Date na origem. Exibir pt-BR com formatter recriado quando fuso mudar, sem cache eterno do fuso inicial.

Detectar mudança de fuso na retomada do foco e antes de salvar/converter; observar também offset aplicável ao horário editado. Se prazo foi alterado, manter texto e bloquear save com mensagem junto ao campo; usuário revisa e confirma a conversão no fuso corrente ou restaura prazo salvo. Confirmação atualiza o contexto de fuso e a prévia textual do instante; mudança posterior exige revisão de novo. Sem alteração do prazo, preservar ISO e permitir edição independente. Não mudar fuso do PC em testes: subprocessos com TZ e porta fictícia, mais observação local do runtime. Referência de desambiguação: [Date e fusos](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date#date_components_and_time_zones).

Alternativas: reconverter sempre perde precisão; fixar -03:00 rompe uso fora desse fuso; adicionar seleção geral de timezone é produto novo. A escolha mantém semântica local e protege intenção sem ampliar o formulário.

### D8 — Abrir origem salva fora da transação

Ação **Abrir origem salva** junto ao campo sourceUrl da edição/leitura, com URL salva disponível; nova tarefa não oferece ação antes do save. Se o usuário alterou o campo, o nome/explicação deixam claro que a ação refere-se ao valor salvo; não abrir draft. Em recorrente somente leitura a ação continua disponível, pois não muda dados. Cartão não ganha descrição/pessoas/tags expandidas nem preview.

Main autoriza e obtém `{sourceUrl,contentRevision}` numa leitura coordenada com revisão esperada. Valida controles ASCII U+0000–001F/U+007F na string antes do parse, esquema HTTP/HTTPS, hostname e ausência de username/password; usa href serializado, com no máximo 2081 caracteres. Nunca manda a string não validada ao sistema nem altera a URL no banco. file/javascript/data/mailto/taskflow/UNC são recusados. Shell fica fora da fila/unidade, sob porta de opener main que chama somente `shell.openExternal(href)` sem workingDirectory/opções arbitrárias. Revalidar sessão imediatamente antes da chamada e entrega da resposta.

O alvo é o valor salvo verificado no instante da leitura; uma alteração posterior não transforma abertura em transação longa ou garantia de URL continuamente atual. Sucesso significa pedido aceito pelo SO, sem alegar carga/segurança do site. Promise rejeitada vira EXTERNAL_OPEN_FAILED; saída/timeout do cliente não desfaz efeito já solicitado nem autoriza repetição automática. Nas suítes usar fake; na prova manual Windows usar URL sem dados privados e controlada pela evidência. Fontes: [shell.openExternal](https://www.electronjs.org/docs/latest/api/shell#shellopenexternalurl-options), [segurança Electron](https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-shellopenexternal-with-untrusted-content); assinatura disponível conferida no electron.d.ts fixado.

### D9 — Janela, acessibilidade e controles disponíveis

Substituir jornada principal de App.vue pelo TaskManager adaptado; diagnóstico em área secundária recolhível acessível por teclado, sem modal técnico no fluxo normal. Remover footer que anuncia somente dados fictícios quando houver gerenciamento de produto. Manter janela inicial 780×560/min360×420; adaptar wrapping/scroll e escopos CSS para não somar estilos do shell às regras da origem. Sem novas colunas, dashboard ou redesign.

Preservar h1/h2/h3, label/for, aria-invalid/describedby, live regions, texto de badge, contrastes 4,5:1/3:1, foco inicial/erros/retorno e seletor pending/Enter/Escape/focusout. Retirar handlers e hints futuros, não apenas v-if. Em ações em curso usar aria-disabled com gate de evento, não disabled que perde foco. Encontrar elementos por refs/IDs escapados. Ao sumir por filtro, recuperar Editar do vizinho/último ou Limpar filtros, conforme origem; falha volta à ação de origem, e focusout não rouba foco externo válido.

Sair/fechar continua encerrando o processo após drain, sem bandeja. Draft, filtros e undo ausente são transitórios; não prometer recuperação de draft após crash/saída. Esse contrato não impede futura política de lifecycle/drafts na TFA-008/009.

### D10 — Evidências e orçamento de UI proposto

Copiar testes portáveis revisados de task-draft/status/queries, casos básicos task-service e componentes/stores/date-time; adaptar fixtures/fakes sem serviços Chrome/avançados. Não há arquivo dedicado TaskFilters.test na origem; casos estão em queries/TaskManager. Complementar com patch/histórico/CAS/ack, runtime guards, store versionado e Electron real inscrito. Harness pode ter duas superfícies **de teste**, sem criar segunda janela de produto ou publicar hooks.

| G | Evidência futura / decisão |
| --- | --- |
| G01–G04 | Domínio/application/TaskForm: campos/defaults/limites, patch/limpeza, auditoria/status/no-op e reopen. |
| G05–G07 | task-queries/TaskFilters/TaskManager: campos da busca, AND/desempates, contagens e fronteiras now/24 h/clock. |
| G08 | date-time/form: fusos controlados, datas/DST, precisão intacta e revisão de fuso. |
| G09–G11 | Store/UI/contratos: loading/empty/sem resultados/stale/blocked, falhas, ack antes do snapshot, duplo envio e resultado incerto. |
| G12 | Duas sessões por barreiras determinísticas: CAS/no false conflict/claim, draft e respostas fora de ordem. |
| G13–G15 | TaskList/Manager/form/CSS: teclado/foco/semântica/contraste e inspeção manual no pacote com zoom/DPI. |
| G16–G17 | Opener falso + guards main/preload: URL/revisão/sessão/protocolos/2081, schemas/bytes/saídas e zero efeito antes do guard. |
| G18 | Pacote com UI inscrita: perda de evento, foco/30 s, reload, crash de PID/superfície fictícia, cleanup. Fecha prova W4 da TFA-003. |
| G19 | DOM/bridge/main: recursos futuros ausentes, avançados/históricos conservados e guards não contornáveis. |
| G20 | Pacote/offline: volume, comandos reais, reopen/drain e performance; sem executar Setup. |

Orçamentos aprovados: no PC Windows x64 de referência com runtime fixado, primeira lista utilizável <=2 s para 1.000 e <=5 s para 10.000 tarefas; p95 de filtro/ordenação até lista estabilizada <=500 ms (20 interações após aquecimento); maior atraso observado do heartbeat renderer <=250 ms durante essas interações. Registrar hardware, bytes/quantidade/cardDOM, primeiro carregamento separado de consultas, p95/máximo e confirmação do foco. São **alvos aprovados sem medição nesta etapa**; não transportar o tempo do benchmark SQLite como evidência de UI. Falha exige revisão concreta da abordagem, não truncamento, virtualização/worker/novo limite automático ou gate removido por conveniência.

No apply: `npm run validate`, OpenSpec estrito e pacote/verify:package/smoke:packaged pertinentes. Build/DOM/mocks não certificam IPC/opener/instalador. Prova Windows do navegador e acessibilidade é separada do opener falso. Não executar Setup, instalar novamente ou distribuir neste recorte. W1/W2/W3/W5/W6 da TFA-003 continuam limitações documentadas; prova nova não as declara resolvidas por inferência. Fechamento da janela principal e de todas as superfícies do harness precisa de evidência explícita; CI só é alegada quando seu resultado tiver sido consultado.

## Risks / Trade-offs

- [Draft completo apaga avançados/histórico] → Patch fechado, validação dos alterados, composição a partir da tarefa atual e fixtures regressivas.
- [Writer único aceita base stale] → CAS de conteúdo dentro da unidade; origem/revisão guardadas enquanto formulário está aberto.
- [Ack antigo regride lista ou resposta perdida duplica criação] → Snapshot autoritativo, ack curto, resultado incerto e decisão humana após ressync; sem replay.
- [Bloqueios temporários reduzem ações em dados avançados] → Explicação acessível, preservação integral e integração nas Changes responsáveis; revisar recorte antes de apply se necessário.
- [Fuso/minutos deslocam prazo] → Omissão de prazo intacto, contexto de fuso e revisão explícita; casos de precisão/DST.
- [URL amplia autoridade] → Origem salva/ID/revisão, parse/allowlist final no main, opener dedicado e isolamento intacto.
- [10.000 cartões prejudicam renderer] → Orçamento observado e revisão em caso de falha; banco rápido não prova UI rápida.
- [CSS/IDs quebram foco ou janela pequena] → Reuso revisado, refs/escaping, teste de teclado/zoom/contraste e pacote.
- [Fixture/harness toca produto real] → Perfis/PIDs de teste verificados, dados fictícios e nenhum hook normal; origem protegida.

## Migration Plan

1. Artefatos criados e aprovados, roadmap atualizado; commit/push do planejamento autorizados. Nenhuma funcionalidade/cópia de código/dependência.
2. Após novo pedido de apply, usando a aprovação registrada: implementar por tasks nesta branch, preservando baseline e origem; sem migração de schema/dados automática. Validar os novos comandos antes de ligá-los à UI.
3. Executar gates e provas planejadas com perfis fictícios; atualizar docs operacionais/paridade/testes somente do que existir. Gerar verification.md por openspec-verify-change dentro desta Change e submeter à aprovação explícita.
4. Somente após autorização correspondente: archive na mesma branch, consolidar deltas, ajustar Purpose de desktop-foundation/desktop-state-ipc ao funcionamento ampliado (o propose não edita specs principais), atualizar roadmap e README factual. Commit/push/PR/merge seguem pedidos próprios; nenhuma integração/distribuição automática.

Rollback de código restaura o baseline pelo Git do app, preservando mudanças do usuário; schema/codec não mudam e tarefas criadas continuam no banco. Perder interface não equivale a apagar dados nem autoriza excluir arquivo ou downgrade incompatível. Draft é transitório; backup/recuperação por importação permanecem na TFA-007. Não tocar a extensão.

## Open Questions

Não há decisão material delegada ao apply: os recortes, schemas, UX, limites e alvos acima são o plano concreto aprovado. Detalhes seguros posteriores são nomes de módulos/canais internos, estrutura das fixtures fictícias e organização das evidências; não alteram catálogo, behavior, orçamento ou tasks. Alternativa material exige revisão coerente antes de implementação.
