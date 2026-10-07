# Design

## Context

Motivação em [proposal.md](proposal.md). Dependências integradas TFA-003/004/008; base `5dd68ff12e20babab5264966e6d3f65bff8a2862`. CLI1.14.0/schema spec-driven. As duas decisões humanas de entrada vazia separada e URL com título vazio prevalecem. As escolhas adicionais abaixo são propostas para revisão, sem aprovação inferida.

| Evidência consultada | Consequência |
| --- | --- |
| [Main](../../../src/main/index.ts:198), [lifecycle](../../../src/main/desktop/lifecycle.ts:1), [sessões](../../../src/main/ipc/document-sessions.ts:81) | Uma janela; withdraw percorre todas. Ocultar precisa retirar somente a sessão alvo, preservando autoridade da outra. |
| [Bridge](../../../src/contracts/desktop-api.ts:1), [preload](../../../src/preload/index.ts:1) | 26 wrappers e epochs; novos contratos devem integrar invalidadores e catálogo, sem canais livres. |
| [Store](../../../src/renderer/src/stores/tasks.ts:1059), [manager](../../../src/renderer/src/components/tasks/TaskManager.vue:1), [form](../../../src/renderer/src/components/tasks/TaskForm.vue:45) | Draft/filtros em memória; lastConfirmed local fecha editor; form não recebe initial-draft. Cada documento precisa de store próprio e confirmação própria. |
| [Draft](../../../src/domain/task-draft.ts:1), [origem salva](../../../src/application/tasks/source-url.ts:24) | Título200/descrição4000 UTF-16; abertura salva exige HTTP/HTTPS sem controles/userinfo e href<=2081. Codec não ganha limite de URL por esta Change. |
| [QuickAdd da origem](C:/QSI/Workspaces/taskflow-extension/src/components/quick-add/QuickAdd.vue:23), [captura aplicação](C:/QSI/Workspaces/taskflow-extension/src/application/page-capture.ts:22), [captura domínio](C:/QSI/Workspaces/taskflow-extension/src/domain/page-capture.ts:23) | Form compacto sem descrição; título normalizado; descrição só quando normalizado>200; captura antiga substitui origem silenciosamente. Reaproveitar seletivamente, mudando entrega/substituição. |
| [Pendência origem](C:/QSI/Workspaces/taskflow-extension/src/components/capture/use-pending-capture.ts:20), [atalhos origem](C:/QSI/Workspaces/taskflow-extension/src/application/keyboard-shortcuts.ts:1) | take destrutivo e browser.windows não são portáveis. Atalhos Chrome não eram globais; não copiar adapter/menu/contexto de aba. |
| [Tipos Electron locais](../../../node_modules/electron/electron.d.ts:7035) e [globalShortcut](../../../node_modules/electron/electron.d.ts:8630) | Electron44.5.1 readText é Promise<string>; registro depois de ready, false/throw são possíveis; isRegistered observa somente este processo. |

Origem estritamente somente leitura na revisão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`. Revisados testes portáveis e testes existentes de manager/form/IPC/preload/lifecycle; nenhum teste/build da extensão foi executado. Artefatos arquivados da TFA-008 e specs consolidadas continuam referência de lembretes, ownership, fechamento e budgets. D10 revisado permanece:1000 tarefas interação500ms/heartbeat250ms/mount2s;10000 tarefas2500ms/2500ms/8s.

## Goals / Non-Goals

**Goals:** entrega revisável por gesto sem perda de editor; duas superfícies sob uma autoridade; preferências/registro observáveis; recursos transitórios limitados; classes de falha testáveis por barreiras e evidência nativa separada.

**Non-Goals:** transação distribuída Windows/arquivo, cancelamento garantido da API nativa, foco garantido pelo SO, persistência de drafts, migração SQL/codec/backup ou promessa de hotkey exclusiva. Exclusões de produto em proposal.

## Decisions

### D1 — Duas janelas singleton sob o mesmo proprietário

Manager e Quick Add são BrowserWindows independentes com Vue/Pinia e state client próprios. Uma registry main associa role `MANAGER`/`QUICK_ADD` a webContents/documento; role não vem de query, argv do usuário, request ou renderer. Entradas locais autorizadas e seletor constante de preload definido pelo main mantêm CSP, sandbox, contextIsolation, nodeIntegration=false, navegação restrita e verificação exata de origem/URL/frame. Se houver duas entradas HTML, expandir resolver por allowlist exata, nunca query/path arbitrário.

Abrir/reabrir não remonta janela viva nem redefine form. O coordenador SQL, writer, runtime de lembretes e lock são únicos. Uma criação rápida invalida snapshots dos dois documentos após commit, mas somente seu state client recebe o ack e altera seu lastConfirmed. Manager mantém filtros, sort, scroll, área, seleção, base/editRevision e draft; atualização concorrente continua usando conflitos existentes. Acknowledge perdido nunca é repetido como create.

Alternativas: modal no manager desloca foco/contexto e mistura confirmações; segunda instância traz outro writer; compartilhar Pinia entre janelas confunde ownership. A janela própria tem custo de heap, aceito com budgets/medição Q14.

### D2 — Quick Add compacto e criação explícita

Campos: título, descrição, prazo local, solicitante, responsável, prioridade, origem. Descrição/origem podem começar recolhidas, mas são reveladas quando captura as preencher; sempre há ação de edição manual. Defaults TODO/MEDIUM; sem editor avançado de recorrência/subtarefas/lembretes nesta janela. Cria pelo createTaskv4 já existente, com fuso/validação do desktop e confirmação mais snapshot coerente. Somente sucesso confirmado da sessão viva limpa seu próprio draft e foca título. Erro, conflito, stale, BUSY ou resultado desconhecido conserva inputs e bloqueia repetição até reconciliação.

QUICK_ADD sem draft começa vazio e não lê clipboard. Se já existe draft, restaura e conserva último foco editável; URL recém-aplicada foca título; texto recém-aplicado também foca título. Abrir gerenciamento foca janela existente e conserva draft Quick Add mesmo em falha. Escape/Alt+F4 fecha para bandeja sob D3, não descarta; Enter envia somente onde apropriado (textarea/IME não envia); Tab, erros e mensagens têm semântica acessível. Nenhum botão de captura salva ou abre URL do draft.

### D3 — Lifecycle por superfície, energia/saída globais

Close com tray válido oculta apenas janela alvo, retira admissão de produto e invalida seus jobs/tokens/prévias/undo; conserva draft/filtros e heldCapture local em memória. A outra janela conserva sessão. Minimizar/perder foco conserva sessão. Reabrir reautoriza com nova geração/snapshot e base revalidada, sem autosave/replay/ack herdado. Pendência held se reassocia somente após nova autorização do mesmo documento vivo; nenhum ack da geração antiga altera a nova.

Suspend fecha admissão das duas, invalida leituras e gates de hotkey; resume reconcilia storage/scheduler e reautoriza somente janelas visíveis. Fechar ambas com tray mantém processo e hotkeys; suspensão global não é confundida com janela oculta. Sair/logoff encerra admissão global, invalidando capturas/configurações e callbacks, libera registros próprios e drena unidades antes de fechar storage. Sem tray: fechar uma mantém a outra visível; fechar a última usa saída segura, nunca fica processo oculto irrecuperável.

Tray oferece Abrir gerenciamento, Quick Add, Capturar conteúdo copiado e Sair. Abrir/segundo lançamento/COM/notificação continuam rota do manager. Falha de criação do Quick Add não esconde manager; captura staged retém-se até TTL para novo gesto de abertura. Falha de tray mostra ao menos uma janela e Sair. Recriar renderer após crash não recupera draft/held; staged não apresentado pode ser entregue a uma superfície nova do mesmo role dentro do TTL. Reload/crash apaga held daquela instância e informa perda transitória, nunca o entrega a outro role.

### D4 — Classificação fechada de text/plain e origem manual

Porta portável ClipboardTextReader; único adapter main chama readText() uma vez por gesto, sem formats/html/bookmark/SourceURL/aba. Classificador puro:

1. Trim externo; vazio/whitespace => EMPTY, preservando active/held/staged. Formato sem texto tem mesmo resultado; throw => UNAVAILABLE.
2. Candidato URL é um token inteiro sem whitespace que começa com esquema absoluto `^[A-Za-z][A-Za-z0-9+.-]*:`. HTTP/HTTPS exigem `://`, host, parse válido, ausência de userinfo e controles literais C0/C1; esquema diferente ou candidato malformado => UNSUPPORTED, sem fallback para URL perigosa. Tokens com controles que se anunciam como URL são recusados. Espaço interno/linhas => texto, inclusive `https://exemplo texto`.
3. URL aceita usa href canônico do parser portável: casing/IDNA/percent-encoding do parser, sem completar esquema, remover tracking, decode ou fetch. Draft title='', sourceUrl completo. Nunca cortar URL. Se envelope não cabe64KiB, RESOURCE_LIMIT; URL armazenável>2081 permanece inteira, mas UI explica que abertura salva pode ser indisponível pela política existente.
4. Demais entradas => texto. Título colapsa `/\s+/g` e trim, até200 unidades UTF-16 com ellipsis. Se comprimento normalizado>200, descrição é raw.trim() com linhas internas preservadas, até4000. Corte recua se dividir par substituto e sinaliza flags titleTruncated/descriptionTruncated. Entrada com substituto órfão literal é INVALID_TEXT; não produzir strings malformadas. Texto com URL embutida não infere sourceUrl.

Associar origem ao texto é ato manual, campo editável/removível com mesma gramática segura para valor novo, sem nova leitura/fetch. Valores históricos intactos mantêm domínio/codec existentes. Alternativa de extrair primeiro link atribui origem incorreta; auto título por rede viola escolha humana; título com URL já foi descartado pelo usuário.

### D5 — Leitura nativa finita e resultado tardio sem efeito

Há uma leitura física de clipboard em voo para todo o processo. Gestos durante leitura recebem BUSY, sem fila de conteúdo ou releitura automática. Gesto captura destino/role, instância, epoch global/superfície e sequence antes de await; botão depende de sessão admitida, hotkey/tray de owner/ready/gate nativo. Destino global/tray é Quick Add; botão usa sua própria superfície, sem parâmetro de destino fornecido pelo renderer.

Deadline lógico5s retorna TIMEOUT e invalida resultado tardio. A Promise nativa não tem cancelamento garantido: gate físico permanece BUSY até ela terminar; se nunca terminar, somente reiniciar recupera leitura. Não liberar gate no timeout e acumular Promises. Suspensão, Sair, destruição ou mudança de sessão invalida efeito/entrega; clipboard bruto é descartado no main. Hotkey pode abrir Quick Add para mostrar erro, mas não substitui draft. Resultado vazio/falha/limite não remove pending anterior.

Limite raw1MiB UTF-8 após alocação nativa e antes de mapear; limite não evita memória já alocada pelo Electron. Não logar conteúdo. Um buffer bruto, dois slots de draft e até uma oferta/resposta por documento; referências/eventos coalescidos para último sequence. Não armazenar raw na inbox. Os tetos de transporte são D8, não limites novos de codec.

### D6 — Inbox em memória e protocolo de apresentação

Um slot main por role, IDs UUID e seq monotônica decimal por destino na execução, sem wrap/reuso. `staged` tem deadline monotônico10min desde conclusão válida da leitura; consulta/evento não estende TTL. `held` é apresentação reconhecida e não expira durante execução, mesmo oculto. `applied`/`discarded` removem payload e conservam somente o último recibo por documento/slot para retry idempotente; nova pendência substitui somente staged/held, com aviso explícito `replaced=true`, nunca draft ativo.

Eventos v2 `capture-available` levam somente ID/seq/replaced. getPendingCapture retorna envelope mapeado ou none/expired e último recibo limitado. Autorizar antes de consultar e antes de responder. Renderer conserva cópia provisória e geração do form; acknowledgeCapture `{id,sequence,disposition:'presented'|'applied'}` deve corresponder ao slot/documento atual. presented confirma que draft/aviso já foi apresentado, converte staged em held e retém payload main. applied é permitido somente após presented; confirmação main remove payload, renderer aplica sua cópia uma vez se ainda seguro/mesma geração. Ack perdido conserva cópia/inputs, consulta recibo autorizado e não repete efeito; retries do mesmo ack retornam recibo, nunca consomem outro ID/seq. discardCapture remove só ID/seq atual, sem criar tarefa. Ack superseded retorna STALE_CAPTURE, não remove substituta.

Entrega staged não é consumida por get nem envio. Se apresentação ainda não foi confirmada e TTL expira, rejeitar ack, retirar cópia provisória da UI e informar expiração. Se ack de applied confirmado chega tarde após form mudar, conservar draft atual e apresentar cópia como oferta local para revisão, sem merge ou salvamento. Isso não recoloca payload como nova captura main. Perda de resposta durante hide mantém cópia transitória; nova sessão consulta estado/recibo para reconciliar, nunca autoriza pedido antigo. Reload/crash elimina cópia e slot held ligado àquela instância; destroy staged mantém destino abstrato até TTL. Nenhum conteúdo circula para documento/role diferente.

Safe state é criação vazia sem alteração de qualquer campo, ou lista do manager sem operação/modal. Dirty inclui qualquer campo, associação/remoção de origem, prioridade/prazo/descrição e draft de edição mesmo visualmente vazio. Save/ack desconhecido, conflito, confirmação, trash, backup/importação ou localização de lembrete bloqueiam aplicação. Captura que chega diretamente em safe state pode iniciar criação após handshake; se foi held durante ocupação, voltar à lista não a aplica: exige Revisar. Descarta sempre disponível fora de efeito em curso, sem salvar. Revisar não apaga editor; usuário conclui ou cancela seu draft pelo fluxo existente antes de revisar.

Alternativa take antes de entrega perde conteúdo em evento ausente; fila histórica amplia retenção sensível; merge automático perde autoria. Escolha mantém paridade de uma pendência com confirmação necessária no desktop.

Depois de cada await, aplicação local revalida também ID/seq observado e geração do form, além da sessão/safe gate. Existe no máximo uma oferta local por destino. Se late applied precisar voltar como oferta e já existir captura mais nova, a nova prevalece com aviso de substituição; não se mantém uma segunda fila/preview antigo. Com form intacto e última referência ainda válida, aplicação confirmada ocorre uma única vez.

### D7 — Ações, combinações e observação nativa

Portas de registro/preferência independentes de Electron/Vue. Enum fechado QUICK_ADD/OPEN_TASK_MANAGER/CAPTURE_CLIPBOARD. Default desejado K/L/null; hint só exibe combinação efetivamente registrada como ativa. Settings exibe desired, observed (`REGISTERED`,`NONE`,`UNAVAILABLE`,`UNKNOWN`), razão segura (`CONFLICT`,`NATIVE_FAILURE`,`PREFERENCES_INVALID`,`PROFILE_DISABLED`,`SUSPENDED`) e defaults. Não identificar aplicativo concorrente; isRegistered é só propriedade deste processo, não prova exclusividade de todo Windows.

Combo estruturada `{modifiers:'CTRL_SHIFT'|'ALT_SHIFT',key}` com key uppercase A–Z/0–9/F1–F24, exceto F4 (evitar fechar janela). UI com seletores acessíveis permite teclado sem capturar input arbitrário. Parser aceita somente shape exato, normaliza visual/local para valor canônico no renderer, main revalida; nada de string acelerador livre. Sem Win, Ctrl+Alt/AltGr, teclas multimídia/modificador isolado. Duplicata interna recusa antes de registro; lista fechada evita atalhos de sistema usuais (Win/Alt+Tab/Alt+F4/Ctrl+Shift+Esc). Outros conflitos pertencem ao registro real; não prometer catálogo exaustivo de reservas do SO.

Registro individual somente após ready+lock+composição. Native false => CONFLICT; throw => NATIVE_FAILURE, app continua com botões/tray. Não chamar unregisterAll: liberar somente combos próprias conhecidas. Suspend/Sair e lease de edição gated antes de callback; configuração ativa abre lease pela operação setShortcutEditingv1, atrelada ao documento manager focado. Blur/close/reload/crash/fim de edição libera lease; sessão perdida não deixa gate eterno. Leases não persistem. Não depender de callback suspenso para registrar provisório; gates de ação main bastam, setSuspended nativo é opcional e deve ser conciliado antes de register. Hotkey nunca reenvia criação/captura em busy nem retargeta para manager.

Dev/test não registram hotkeys automaticamente. Harness nativo opt-in, perfil fictício e combinações dedicadas; liberar ao terminar. Processo prod em uso não é alterado para testar. Sem novo hook/processo/serviço.

### D8 — Catálogo e budgets fechados por role

Nove wrappers novos v1: openQuickAdd, openTaskManager, captureClipboard, getPendingCapture, acknowledgeCapture, discardCapture, getShortcutSettings, setShortcut, setShortcutEditing. Catálogo manager35 =26 atuais+9. QuickAdd14: getStateSnapshot, subscribeState, unsubscribeState, createTask, clearUndoOffer, getDesktopStatus, requestQuit, subscribeDesktopEvents, openTaskManager, captureClipboard, getPendingCapture, acknowledgeCapture, discardCapture, getShortcutSettings. Main aplica a mesma allowlist por role, mesmo se renderer for comprometido; Quick Add não recebe edição/trash/backup/startup/diagnóstico ou setter de atalhos. Verificar adaptação do state client para não invocar operações ausentes.

Contratos existentes de tarefas permanecem: estado3, create4/check3, update5/status4, move2 e restantes1. getDesktopStatus request/result e inscrição/eventos desktop passam v2: status inclui role/visibilidade/sequence da própria superfície; eventos suspend/active são destinados ao owner correto; energia/status podem ser globais com destino. setStartAtLogin/requestQuit/resolveReminderActivation mantêmv1. Rejeitar versões antigas alteradas. Eventos novos: capture-available e shortcuts-changed (só configRevision/statusSequence); role/status finitos; callback/disposer locais, uma inscrição por documento.

Requests novos<=1KiB UTF-8 JSON completo; results comuns<=8KiB; getPendingCapture<=64KiB incluindo envelope e escaping. Eventos desktop continuam<=1KiB sem draft/descrição. Comandos de produto64KiB/acks8KiB/páginas256KiB seguem atuais. Falha de serialização/budget=>RESOURCE_LIMIT antes de publicar, nunca corta URL/IDs/campo para caber. Memória máxima inbox dois envelopes64KiB; raw<=1MiB somente depois da leitura; recibos/listeners limitados aos documentos registrados (máximo8 herdado). Sequence/revision decimal limitada a32dígitos; se esgotar, bloquear recurso e exigir restart, nunca wrap.

Requests novos têm `version:1` e apenas campos finitos: open/capture/get/shortcut-read sem payload livre; ack/discard UUID+sequence; setShortcut action+combination|null+expectedConfigRevision; editing boolean. Resposta result union seguro: INVALID_REQUEST,UNAUTHORIZED,BUSY,EMPTY,UNSUPPORTED,INVALID_TEXT,UNAVAILABLE,TIMEOUT,RESOURCE_LIMIT,STALE_CAPTURE,STALE_SETTINGS,PREFERENCES_INVALID,UNKNOWN; domain/create mantém erros próprios. Nenhum raw clipboard/canal/path/URL para abrir/accelerator nativo livre; draft contém somente title/description/sourceUrl/kind/flags e referência.

Guards de documento/frame/origem/URL/role/admissão/version/extra/tipo/bytes vêm antes de ler clipboard/inbox/preferência, registrar, salvar ou criar janela; revalidar após awaits/antes da entrega. Controle sobre oculto só suspensão/ativação/status finitos, sem entrega de conteúdo; capture-available coalesce aguardando admissão. Hotkey/tray é intenção main de owner, não requisição de renderer oculto. Dados nunca em logs/screenshots/backups; testes fictícios.

### D9 — Preferências versionadas e CAS em arquivo próprio

Escolha: `userData/shortcuts.json`, owner main, versão1, limite8KiB, `{version:1,revision:<decimal>,actions:{QUICK_ADD:<combo|null>,OPEN_TASK_MANAGER:<combo|null>,CAPTURE_CLIPBOARD:<combo|null>}}`, três chaves exatas. Missing => defaults em memória revision0, sem gravar no startup. Escolha confirmada só por setShortcut com CAS esperado; fila única de configurações, no máximo uma ativa e oito aguardando, espera2s/BUSY; leituras não entram na fila SQL. revisão incrementa somente mudança durável; no-op retorna estado sem gravar. Dois clientes não usam last-write-wins.

Arquivo é fonte do desired; registry nativa é fonte do observed. TEMP exclusivo no mesmo diretório, escrita completa+flush+fechamento, validação/readback, rename de publicação e releitura do destino. Preservar cópia anterior completa `.previous` antes da publicação; não apagar anterior/temp quando estado incerto. Abrir confirma versão/shape/bytes antes de efeitos. Incompatível/futuro/corrupto/permission denied bloqueia setters e registro novo, informa indisponível sem defaults falsos ou overwrite. `.previous` não se restaura silenciosamente: se principal inválido, UI explica recuperação manual autorizada. Temp órfão não é configuração concluída. Somente após publicação/readback confirmado limpar temporário próprio e substituir previous na próxima alteração.

Crash antes de publicação conserva arquivo anterior; depois da publicação pode observar antigo ou novo completos conforme durabilidade Windows/filesystem. Testar fases/barreiras e kill, sem prometer sobrevivência a qualquer corte de energia. Perda de resposta consulta revision/desired/observed; não replay. Downgrade preserva versão futura. Upgrade preserva arquivo; uninstall conserva junto aos dados, reinstalação usa versão compatível existente (atalhos não são cadastro startup). Backup/importação de tarefas não inclui nem altera prefs. Perfis dev/test separados, nenhuma escrita HKCU para hotkeys.

Alternativas: tabela no banco de tarefas exigiria migração SQL por três combos e acoplamento de backup; SQLite separado acrescentaria armazenamento/conexão sem necessidade; HKCU mistura aprovação/política Windows com preferência de produto. Arquivo pequeno exige publicar/reler explicitamente e aceitar UNKNOWN; não usar fallback no apply se provas falharem: revisar proposta.

### D10 — Troca de registro sem fingir transação Windows/arquivo

Serializar depois de guards/CAS. Rebind A->B: registrar B provisório com callback gated; false/throw termina sem persistir, A continua ativo. Confirmar registro próprio B; preparar/publicar/reler prefs B; somente após confirmação ativar callback B e retirar A/verificar. Startup registra desired sem regravar. Desabilitar: gate callback A, persistir null/reler e retirar/verificar A; falha antes de publicação restaurar gate A somente se A observado registrado. Restaurar default é setter individual, sujeito a mesmas duplicatas/CAS, não batch oculto.

Falha comprovadamente anterior a publicação: desfazer B provisório/verificar, conservar arquivo e callback A. Se unregister/compensação falha ou publicação/readback não determina qual arquivo vigora, fechar callbacks da ação, mostrar UNKNOWN com observação dos registros próprios e bloquear setters desta ação até releitura/reconciliação explícita. Não registrar/desregistrar automaticamente por timeout ou perder ack. Se prefs B confirmado mas liberar A falha, desired=B; ação permanece gated/UNKNOWN até cleanup verificável. Novo snapshot/status não inventa rollback. Reconciliação explícita pode usar mesmo setter com expected revision observada, inclusive no-op desired, para limpar registros provisórios da ação e restabelecer exclusivamente configuração confirmada; nunca apagar prefs incompatíveis. Sair libera todo registro próprio observado/tentado sem mexer em terceiros. Suspensão/interrupção de documento não corta unidade de arquivo ativa; drenar e publicar status somente à nova sessão autorizada.

Incerteza de publicação/readback do arquivo bloqueia **todos** os setters de preferência, pois revision/configuração são globais. Incerteza restrita ao registro bloqueia somente a ação afetada. A fila revalida arquivo/versão/CAS antes de cada efeito, inclusive alteração externa; nenhum temporário adicional é criado enquanto publicação estiver incerta. No máximo um temporário e uma cópia previous de8KiB cada são retidos. Status anuncia gate de edição como pausa temporária, distinguindo-o de indisponibilidade persistente. Reconciliação usa leitura validada e gesto explícito; arquivo futuro/corrupto não admite setter de recuperação que o sobrescreva.

### D11 — Evidência, aceitação e continuidade

| Caso | Evidência prevista |
| --- | --- |
| Q01 | URL http/https inteira; casing/IDNA/porta/query; usuário/senha, controles, esquema proibido/malformado, texto com link e URL>2081/budget; título vazio obrigatório e sem fetch. |
| Q02 | Texto<=200/>200, trim/linhas, limites199/200/201 e3999/4000/4001, emoji no corte/substituto inválido e flags. Origem manual editável/removível. |
| Q03 | Clipboard vazio/whitespace/sem texto, throw/limite/timeout, uma leitura física, clique rápido e late completion descartada; não alterar draft/pending. |
| Q04 | Quick Add vazio/reabertura/descrição/sucesso+snapshot/erro/unknown; nenhuma confirmação rápida fecha editor manager. |
| Q05 | Form dirty por cada campo, revisão de tarefa vazia, save/conflito/trash/backup/lembrete; captura held, Revisar só seguro e Descarta sem salvar. |
| Q06 | Substituta/aviso, destino global versus local, TTL10min antes de presented, held sem expiry após hide, expiração em handshake. |
| Q07 | Barreiras get/presented/applied/discard; ID/seq/documento errado, eventos ausentes/duplicados/reordenados, ack perdido/superseded, form alterado durante ack, hide/reload/crash. |
| Q08 | Personalizar/remover/default/restart, duplicatas/reservadas/AltGr, CAS, register false/throw e desired/observed/hints corretos. |
| Q09 | Faults open/temp/write/flush/rename/readback/unregister/compensação/kill; arquivo futuro/corrupto intocado, UNKNOWN sem replay, backup sem prefs. |
| Q10 | Fechar uma versus ambas, minimize/foco, suspend/resume/quit, tray falho, COM/segundo lançamento/notificação ao manager; writer/scheduler únicos. |
| Q11 | Negativos IPC por role/frame/origem/URL/sessão/shape/bytes antes de qualquer efeito e saída/eventos validados; facades35/14 no pacote. |
| Q12 | Tab/Enter/Escape/IME, foco entre janelas, busy/erro, mínimo360px Quick Add e zoom200/DPI/leitor de tela; evidência humana separada. |
| Q13 | Windows empacotado: outro app em foco, hidden/tray, clipboard fictício, conflito real por processo de teste, rebind/restart/liberação após Sair, sem admin/serviço. |
| Q14 | npm validate/OpenSpec estrito/package/verify:package/smoke; budgets, heap/latência nas duas janelas e D10 TFA-008, regressão lembretes/COM/backup/undo. |

Tasks detalham implementação, testes e evidências; todos os casos obrigatórios sem marcar o não executado como aprovado. Setup/roteiros instalados dependem da autorização/ambiente correspondentes no apply; pacote e mocks não substituem instalação. Pendências humanas/energia/conta padrão da TFA-008 continuam identificadas, sem carregar seu waiver de segunda conta como nova prova. Relatório de verify dentro da Change deve listar limitações e ser aprovado antes de archive.

## Risks / Trade-offs

- [Clipboard sensível ou memória nativa excessiva] → gesto único, sem log/histórico, limite pós-alocação documentado; timeout não cancela leitura física.
- [Draft transitório perdido por crash/Sair] → comunicação explícita, nenhum autosave/replay; tarefas só por confirmação existente.
- [Corrida entrega/edição e duas sessões] → IDs/seq/gerações/recibos limitados, safe gate revalidado após await e testes com barreiras.
- [Foco negado pelo Windows] → tentativa restore/focus, aviso e entrada tray/botão; não declarar garantia visual.
- [Preferência e registro divergentes] → desired/observed separados, publicação verificada, compensação limitada e UNKNOWN gated; revisitar design se primitives não satisfizerem provas.
- [Mais heap e alterações cross-cutting] → medir Q14, conservar budgets/D10 e invalidar somente janela alvo.
- [Combinações limitadas] → allowlist explícita facilita validação e evita AltGr/reservadas; ampliar requer proposta própria.

## Migration Plan

Sem migração de tarefas/SQL2/codec4/backupv1–v4 ou nova dependência. Implementar contratos/main/preload/renderer juntos em pacote coerente; versões desktop antigas recusadas. Primeira execução carrega prefs ausente em defaults sem arquivo; conflitos não impedem abrir app. Upgrade mantém arquivo e dados. Downgrade ignora recursos novos sem apagar versão futura; tasks existentes continuam compatíveis. Rollback de código não reenvia drafts nem desfaz criações confirmadas. Nenhuma publicação/instalação real nesta etapa.

## Open Questions

Nenhuma decisão material é delegada ao apply. Revisão humana destes artefatos ainda é necessária. Deferráveis: medidas de foco/DPI/leitor de tela e latência nativa no ambiente Windows disponível, e refinamento do texto de erro mantendo códigos/comportamentos definidos. Limitação ambiental deve aparecer no relatório, sem relaxar critérios ou trocar arquivo por outro armazenamento sem revisão.
