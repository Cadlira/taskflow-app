# Design

## Context

Motivação em [proposal.md](proposal.md). Base `c7dcf845ba82a74e7027e764626decf6e0bfd82c` da TFA-007 integrada; a branch da TFA-008 parte desse merge, com a exploração preexistente conservada. CLI1.14.0/spec-driven. Nada deste design está implementado ou aprovado por sua criação.

Evidências de código consultadas:

| Referência | Restrição relevante |
| --- | --- |
| [Domínio atual](../../../src/domain/task-reminders.ts) e [unidade](../../../src/application/storage/task-storage-unit.ts) | MAX10, validação de coleção, claim exato e markers; claim avança global conservando content/edit/updatedAt. Restore/revert já liquidam vencidos. |
| [Coordenador](../../../src/main/storage/coordinator.ts) | Uma conexão/fila; SQL síncrono;64 entradas/8 por owner/espera2s; onCompleted somente in-memory, anterior à publicação/próxima entrada. |
| [Comandos](../../../src/application/tasks/task-commands.ts) e [contratos](../../../src/contracts/tasks.ts) | D8 bloqueia prazo/status/fechamento com lembretes; create3/update4 não aceitam reminder drafts. |
| [Sessões](../../../src/main/ipc/document-sessions.ts) e [main](../../../src/main/index.ts) | invalidate troca geração, mas permite nova autorização do documento oculto; unregister retira admissão. Close atualmente sai; lock antecede storage. |
| [Build](../../../package.json) e [NSIS](../../../build/installer.nsh) | Electron44.5.1, appId taskflow.app, NSIS por usuário e ícone existente; sem serviço/updater/elevação. |
| [TFA-007](../archive/2026-10-05-migrar-backups-e-importar-dados-da-extensao/design.md) | Backupv1–v4, codec4/SQL2; APPLIED e UNCHANGED invalidam transientes; no-op não emite commit SQL. |

Origem somente leitura `C:/QSI/Workspaces/taskflow-extension`, revisão `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`: `src/domain/task-reminders.ts`, `src/domain/task-draft.ts`, `src/application/reminder-service.ts`, `src/application/reminder-scheduler.ts`, `src/entrypoints/background.ts`, formulário e testes correspondentes. A fila do service worker serializa apenas lembretes; seu startup liquida todos os vencidos, incompatível com a recuperação agora confirmada. Não copiar adapters Chrome nem logs brutos da origem.

## Goals / Non-Goals

**Goals:** decisão temporal no estado atual; uma tentativa externa após confirmação durável; mutações com settlement e notificações com limite verificável de concorrência; sessão suspensa realmente sem autoridade; configuração nativa verificável sem duas fontes de verdade.

**Non-Goals:** transação distribuída SQLite/Windows, garantia visual/exactly-once, fila histórica de entrega, alteração de SQL/codec/backup, novos processos escritores, serviço ou relógio/fuso fixo. Exclusões de produto em proposal. Recurso instalado não será atestado por mock/build.

## Decisions

### D1 — Regras portáveis e identidade sob autoridade do main

Reutilizar seletivamente domínio/draft/testes/formulário, revisando imports e autoridade. O renderer envia OFFSET `{type,offsetMinutes}` ou AT `{type,at}`; no update pode acrescentar `id` de reminder da base observada, nunca ID novo de cliente ou processedFor. ID presente que não pertence à tarefa atual recusa; novos itens omitem ID, main gera UUID com até três tentativas de unicidade local. Criação recusa IDs de reminders. Omissão no update conserva coleção; `[]` limpa; null recusa. AT digitado normaliza ISO; datas/configurações intactas conservam precisão. Presets são conveniência, não lista exclusiva de offsets.

Validar dez itens, prazo obrigatório, OFFSET safe integer>=0 e instante representável após duração exata em minutos; AT<=dueAt; IDs e instantes efetivos distintos; recorrência somente OFFSET. Configuração nova/alterada com gatilho<=clock da unidade falha como na origem. Configuração carregada pelo mesmo ID/tipo/parâmetro conserva-se mesmo vencida, passando depois por settlement. Guardar markers atuais de mesmo ID/instante antes de substituir; alteração de configuração não importa marker do renderer. Adicionar/remover/editar coleção altera content/edit; processamento isolado não altera essas revisões.

Alternativa: editar Task completa ou emular Chrome. Recusada por ampliar autoridade e perder claims concorrentes. A regra de formulário continua independente da leitura histórica e validação de backup.

### D2 — Política temporal confirmada e separação de recuperação/mutação

Usar clock UTC de parede na execução da unidade; monotônico apenas para espera/recursos/deadlines operacionais. Ocorrência = tupla exata `(taskId,reminderId,triggerISO)`, com `triggerISO` canônico calculado. Em startup, resume, reabertura da bandeja, recuperação validada do storage e tick/fallback:

| Estado atual | Decisão |
| --- | --- |
| Ativa TODO/IN_PROGRESS, pendente, now<trigger | Continuar futura, sem claim/submissão. |
| Ativa pendente, trigger<=now<=trigger+300000 | Claim condicional; se confirmado, tentar submissão uma vez. |
| Ativa pendente, now>trigger+300000 | Consumir marker sem aviso. |
| Terminal pendente vencida | Settlement interno sem aviso; futuro terminal não agenda. |
| Ausente, tupla alterada ou marker correspondente | Inaplicável, sem efeito/revisão. |

Limite é inclusivo. A tolerância de60s do adapter Chrome não participa da decisão desktop. Atraso na fila conta: reler clock dentro da unidade e imediatamente antes de show; avanço além de cinco minutos ou recuo antes do trigger depois do claim suprime efeito, conservando marker consumido.

Criação, edição efetiva, transição, fechada+gerada, restore, undo e importação usam settlement puro de todos os pendentes<=now, sem aplicar graça. No-op independente conserva revisões; backup calcula seu plano com settlement antes de decidir APPLIED/UNCHANGED. Passagem do tempo não gera recorrência. Mudança de fuso altera apresentação/cálculo civil existente, não os instantes AT/OFFSET persistidos. Reconciliar após resume antes de autorizar nova escrita visível evita editar uma pendência ainda não examinada na recuperação.

Alternativa de descartar todos no startup contradiz decisão humana; entregar backlog ilimitado cria avisos obsoletos. Atualizar D6 de architecture e matriz no apply, conservando diferença deliberada.

### D3 — Índice descartável, agenda única e recuperação limitada

Serviço de aplicação portátil recebe clock, agenda, porta de processamento coordenado e notifier; Electron só nos adapters main. Projeção contém chaves/instantes, sem guardar títulos ou Tasks como autoridade. Índice ordenado atualizável + mapa por tarefa + índice de tags; um timer de agenda acorda no menor deadline de ocorrência, manutenção ou submissão pendente. Delay<=2147483647 e reavaliação no máximo a cada60s; futuro distante não vira timer de1ms. [Node24: timers](https://nodejs.org/download/release/v24.21.0/docs/api/timers.html).

No máximo uma unidade interna de processamento em voo; cada ocorrência é decidida em unidade curta e próximo item vai em outro macrotask. Não enfileirar uma Promise por reminder, drenar backlog em while síncrono nem escanear todas as tarefas por commit. Em onCompleted, produtores registram somente IDs afetados/reset e incrementam epoch do scheduler, sem SQL/notifier/await. Após liberação da unidade, coalescer leitura dos IDs; fechamento inclui antiga e gerada, undo inclui removida/restaurada, move exclui ativa. Claim retira sua ocorrência; não causa rebuild recursivo. Backup confirmado, inclusive UNCHANGED/empty, exige reset explícito, independente de onCommitted.

Startup/resume/reopen/storage-recovered fazem rebuild; fallback a cada60s detecta perda de invalidação, mudanças de clock e corrige projeção. Varredura cooperativa lê páginas de até128 tarefas por unidade coordenada, monta projeção em fatias com yield até10ms de trabalho puro. IDs alterados durante rebuild são journalizados e relidos antes da troca; reset de coleção invalida epoch e reinicia, no máximo três vezes por ciclo, depois BUSY até novo ciclo. Não publicar índice parcial como completo. Tarefa candidata sempre será revalidada na unidade, mesmo se a projeção atrasar.

Reservar até64MiB de charge lógico para índice/candidatos/journal, independente de undo64MiB/backup128MiB. Fórmula de referência por ocorrência:256 bytes mais2×comprimentos UTF-16 de IDs/ISO/tag, mais estruturas/journal explicitamente contados; referências compartilhadas contam uma vez. Mapas/heap não acumulam tombstones ilimitados. Excedente pausa notificações com RESOURCE_LIMIT e informa estado seguro; não corta tarefas/reminders nem impõe novo teto ao codec. Continuar CRUD preservando dados e exibir indisponibilidade do serviço; novo ciclo explícito/60s pode recuperar. Medir charge e heap/RSS reais separadamente.

Native submissions pendentes limitadas a16; capacidade é reservada antes do claim elegível e liberada imediatamente em no-op/recusa/rollback/guard que suprima efeito, ou por show/failed/deadline10s após solicitação, sem ressubmissão. Enquanto cheia, candidato não é consumido antes de decisão, fica para nova avaliação em até1s/primeiro callback; atraso pode torná-lo expirado. Consumo expirado sem aviso não exige reserva nativa. Objetos de notificação ficam referenciados durante tentativa, depois a rota central não depende da vida do objeto. O timer único também atende esses deadlines. Não há recurso de rate-limit/snooze oferecido ao usuário.

O teto16 limita reservas/submissões consideradas pendentes pelo app; deadline não comprova término de trabalho interno do Windows. Medir também retenção nativa/RSS e registrar atraso/efeito desconhecido após timeout, sem alegar controle integral da fila do SO ou transformar timeout em nova tentativa da mesma ocorrência.

Alternativas: timer por reminder pode chegar a100000 timers; scan integral a cada disparo/commit escala com a coleção e prejudica a fila. Índice reduz custo normal; fallback medido cobre falha de efeito pós-commit sem torná-lo fonte de verdade.

### D4 — Claim e submissão ordenados, fora da transação e de onCompleted

Ampliar a decisão interna de processamento para retornar DTO candidato atual e discriminar inapplicable/expired/claimed. Relê Task, status, reminder, marker, instante exato e clock na unidade; terminal vencida/expirada recebe apenas marker, conservando content/edit/updatedAt. Nunca chamar notifier em SQL ou onCompleted.

Adicionar ao coordenador uma conclusão externa **síncrona** restrita a adapters main (`afterReleased`), executada depois de `#execute` retornar e antes de resolver a entrada/agendar a próxima. A transação, o objeto unit e onCompleted já terminaram. Callback recebe somente resultado/outcome confirmado; não recebe conexão/unit e não executa/enfileira leitura reentrante, await ou filesystem. Só a operação interna de reminder registra esse callback. Manter `onCompleted` existente sem mudar suas restrições.

Entre claim e show não há yield nem outra unidade SQL: afterReleased reconfere availability=ready, revision confirmada, epoch/tupla do candidato, runtime não suspended/quitting, reserva nativa, clock dentro da janela, e chama submit síncrono do notifier. O DTO de título/prazo vem da releitura da unidade, não do timer. O adapter constrói Notification e chama show no mesmo trecho. Falha do callback/constructor/submit é capturada e sanitizada; não bloqueia/reverte commit confirmado nem cria oferta/novo claim. Eventos de estado podem ter sido publicados, mas seus handlers não executam outra unidade no meio da mesma pilha. Exigir que o pump continue por macrotask e que shutdown não drene claims para notificar; tickets de runtime internos ficam inadmissíveis após quitting/suspend.

Essa é a fronteira de serialização **até a solicitação de show**. Mutação confirmada antes de claim é observada; candidato de epoch anterior não submete. Alteração admitida mas executada depois da submissão não a retroage. O Windows monta/exibe de forma assíncrona; cancelar/editar depois usa close best effort nos objetos disponíveis e invalida rota antiga, sem prometer retirar texto já mostrado ou trabalho nativo pendente. Não manter lock SQL enquanto espera callback do SO.

| Falha | Resultado permitido |
| --- | --- |
| Queue full/timeout/lock antes de começar ou rollback confirmado | Sem aviso/marker novo; candidato continua pendente, reavaliado em ciclo posterior dentro da janela, sem repetir comando do usuário. |
| COMMIT/rollback incerto ou conclusão que bloqueou storage | Nenhum efeito; parar agenda e exigir reopen validado. Se marker confirmou, não tentar de novo; se não confirmou, pendente segue política da recuperação. |
| Crash depois do claim e antes de show | Marker persiste; aviso pode ser perdido. |
| Constructor/show/failed/unsupported após claim | Marker permanece; código seguro, sem retry. |
| Crash após show ou Windows suprime/retarda | Não duplicar; resultado visual não comprovado pelo marker/evento show. |

Alternativa de Promise.then apenas permite unidades futuras em condições não controladas; await nativo no coordenador bloqueia toda aplicação; enviar antes de claim duplica após crash. A garantia é no máximo uma tentativa por tupla no estado persistido corrente. Backup que explicitamente substitui dados/reminders futuros pode reintroduzir pendência: não é ledger histórico global, e importação vencida continua liquidada.

### D5 — Integração de todas as mutações sem upgrade de dados

Retirar D8 somente quando serviço/adapters estiverem compostos e verificações D2/D4 cobrirem os comandos. Fechar recorrência salva fechada com settlement e gerada OFFSET com IDs novos/sem marker herdado e settlement pertinente na mesma unidade; projeção só após confirmação. Revert conserva marker atual para instante intacto antes do settlement, remove gerada condicionada por conteúdo e nunca gera outra. Move/trash interrompem atividade; restore/undo não recuperam vencidos pela graça. Toggle independente conserva contratos e não liquidará pendências como se fosse edição de reminders.

Backup mantém arquivo autoritativo, portadora única em tasks+trash, codec4/SQL2/formatos1–4, timestamps e CAS global. Não mesclar markers das antigas tasks que o arquivo substituiu. APPLIED/UNCHANGED aciona reset na conclusão in-memory existente, reconstrução fora dela; falha dessa projeção não altera resultado/verification do backup. Recovery validado faz reset e barreira transitória já existente, sem inferir sucesso de comando incerto. Não inventar tabelas de ocorrências/configuração ou revisão SQL para UNCHANGED.

### D6 — Hide com suspensão real da superfície

Máquina de estados no main: VISIBLE, HIDDEN, SUSPENDED_POWER e QUITTING, com flags de visibilidade e energia independentes e sequência monotônica dos eventos. Criar Tray antes de permitir hide, ícone empacotado existente, tooltip TaskFlow App, menu Abrir/Sair e ativação para abrir. Sem GUID fixo enquanto binário não é assinado. [Tray](https://www.electronjs.org/docs/latest/api/tray).

Close por X/Alt+F4: preventDefault somente se tray válido e não quitting; emitir suspensão, retirar sessão via unregister, cancelar owner pendente, descartar undo/confirmações/preview/jobs/client epochs; hide conserva Vue draft/filtros em memória. Main retira autoridade mesmo se renderer não processar evento. Preload suspende produtores/subscriptions/polls; eventos desktop seguros de controle continuam destinados ao contents vivo. Minimize/perda de foco não fazem cleanup. Diálogo/job já aberto não ganha autorização nova e é cancelado cooperativamente; efeito confirmado permanece sem ack para a nova sessão. Sem autosave, troca de base do draft ou replay.

Suspend por energia não equivale a close: conserva sessão e ofertas já confirmadas, ressalvadas expiração normal de prévia e invalidação por recovery/backup. Bloqueia admissão/efeitos e pausa polls/clientes; requests ainda não iniciados são recusados pela guarda de runtime e não são repetidos. Epoch local cerca respostas pendentes para não publicar oferta nova de resposta atrasada. Resume conserva draft/base/undo já confirmado e somente libera atividade depois da reconciliação; close/Sair durante esse estado faz cleanup normal.

Abrir: restaurar/show/focus janela; modo de leitura/reconciliação enquanto storage/scheduler atualizam; registrar **nova** sessão somente quando recuperação puder ser apresentada com sucesso ou erro seguro. Reanexar clientes/uma inscrição, snapshot completo, revalidar base do draft e então liberar comandos; falha conserva draft/filtros e estado stale/bloqueado. Sessão/eventos/acks antigos não migram. Renderer crash perde draft e pode ser recriado pela ação Abrir; erro acessível, sem fingir recuperação do texto.

Falha de Tray inicial ou posteriormente detectada muda para janela visível, anuncia falha e oferece Sair; close passa a saída segura quando não há caminho de recuperação. Destruição incidental da janela com tray válido conserva owner e Abrir recria superfície; não pode produzir processo invisível irrecuperável. Não prometer detectar toda remoção de ícone pelo shell.

Sair no menu/janela chama uma rotina idempotente: set quitting antes de eventos close, parar timer/power/ativação, recusar novas entradas, invalidar sessões/recibos/preview/jobs, finalizar unidade ativa/cancelar filas de sessões e claims internos não iniciados, drenar só manutenção admissível, fechar conexão e destruir tray/janelas. window-all-closed não sai enquanto há tray válido; before-quit e query-session-end/session-end Windows iniciam encerramento, não hide nem bloqueio de logoff. Kill/energia continuam falhas abruptas, sem promessa de before-quit. [PowerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor) e tipos fixados distinguem shutdown Linux/macOS dos eventos Windows da janela.

Alternativa destroy perde draft/filtros ou exige serialização não autorizada; hide sem unregister mantém autoridade oculta. Saída completa por close é alternativa descartada pelo baseline de bandeja.

### D7 — Notificação Windows e identidade de instalação

Prod instalado: AUMID/appId `taskflow.app`, app.setName/productName `TaskFlow App`, atalho NSIS por usuário do mesmo nome e ícone existente copiado aos recursos runtime. Antes de criar presenter, validar atalho próprio e atualizar `toastActivatorClsid` via shell.writeShortcutLink/readShortcutLink. Constante prod `{8B9BA547-6778-4F8E-873F-C3171C4EE08D}`; dev/test usam respectivamente `taskflow.app.dev`/`taskflow.app.test`, nomes `TaskFlow App Dev`/`TaskFlow App Test` e CLSIDs de terminais08E/08F. Definir modo/identidade antes de qualquer presenter. Não reutilizar CLSID estrangeiro encontrado no atalho. Se propriedade/target/ownership conflita, bloquear integração nativa com erro seguro, sem sobrescrever cadastro alheio.

NSIS registra apenas metadados próprios v1 sob HKCU `Software\TaskFlow App\NativeIdentity\v1`: AUMID, CLSID, InstalledExecutable e StartMenuLink efetivamente criado pelo template. Main valida caminho canônico instalado, nome/target/AUMID da shortcut e pertença ao usuário, recusando traversal/reparse/target externo; strings do renderer nunca participam. Adapter restrito usa Windows PowerShell do System32 já presente no Windows11, por spawn windowsHide=true/-NoProfile/-NonInteractive, script fixo e operações enumeradas sobre HKCU via Microsoft.Win32.Registry, sem shell intermediário, script/path livre, ExecutionPolicy bypass ou logs brutos. JSON UTF-8 explícito evita depender da codepage de reg.exe; resposta<=8KiB/deadline5s e recusa de encoding/saída/bloqueio por política, sem fallback inseguro. Leitura de família de versão filtra nomes próprios e não retorna registros alheios. Preparar caminho/CLSID de identidade antes do primeiro presenter. O runtime fixado instala o COM activator por usuário; criar um objeto Notification de bootstrap **sem show** inicializa presenter, não exige toast de teste nem claim. handleActivation será registrado uma única vez. [API Notification](https://www.electronjs.org/docs/latest/api/notification) e [implementação fixada do presenter](https://github.com/electron/electron/blob/v44.5.1/shell/browser/notifications/win/notification_presenter_win.cc).

A propriedade CLSID é suportada nos tipos locais `ShortcutDetails`; NSIS atual só define AUMID. Escolha: preencher propriedade no primeiro lançamento controlado, não escrever um COM helper/plugin novo no Setup. Registrar em evidência installed o antes/depois do atalho e HKCU Classes/CLSID/LocalServer32, incluindo caminhos com espaços/acentos. COM local server ativa o próprio executável; não é serviço do Windows. Atualização manual mantém caminho/identidade e preserva startup; uninstall remove exclusivamente shortcut/metadata/CLSID/Run/StartupApproved próprios, conferindo target/LocalServer32 e constantes antes de apagar. Registro estranho é conservado com aviso seguro; dados do usuário ficam.

Windows PowerShell5.1 faz parte das versões Windows suportadas; não instalar PowerShell7 ou módulo. [Microsoft: ambiente Windows PowerShell](https://learn.microsoft.com/en-us/powershell/scripting/learn/ps101/01-getting-started). Binário System32 foi localizado nesta exploração de planejamento, sem executar script/registro. Ausência/bloqueio pelo ambiente torna somente a integração nativa indisponível com diagnóstico seguro; não bloqueia acesso aos dados locais nem permite contorno da política.

Notifier faz title=título atual, body=prazo pt-BR e identidade/ícone; sem conteúdo completo, botões, resposta, URL ou toastXml customizado. Tag = SHA256 hex minúsculo de JSON UTF-8 canônico `[taskId,reminderId,triggerISO]`, exatamente64 ASCII. Node crypto só main; não concatenar delimitadores ou limitar IDs históricos. isSupported/show apenas informam capability/submissão, não permissão ou visibilidade; failed string vira código fechado NATIVE_NOTIFICATION_FAILED, nunca log bruto. [Notificações Electron](https://www.electronjs.org/docs/latest/tutorial/notifications).

Dev/test usam notifier fake por padrão, sem presenter/registro/atalho de prod. Native harness só mediante modo explicitamente dedicado, nomes/AUMIDs/metadata próprios e cleanup próprio; startup setter indisponível fora de prod instalado. Não habilitar ELECTRON_DEBUG_NOTIFICATIONS ou logs de ativação/conteúdo. Sem dependency nova, API macOS de history/remove como solução Windows ou implementação MSIX/Squirrel.

### D8 — Uma rota de ativação, inclusive cold start e disputa com lock

Escolher apenas Notification.handleActivation para navegação; não anexar handler click com segunda navegação. Validar details em1KiB UTF-8, type=click, raw arguments com exatamente `type=click&tag=<64hex>` (ordem das duas chaves indiferente), sem duplicatas/extras/action/reply/userInputs. Não usar argv/cwd como URL/path/comando. Índice de tags reconstrói de reminders persistidos, inclusive processados; exige correspondência única e marker igual ao trigger corrente. Não criar ledger auxiliar/toastXml: referência removida/instante alterado deixa de resolver; title/status atual podem ser diferentes. Colisão ambígua é recusada.

Lock normal continua antes de storage. Owner registra activation handler antes de compor clientes; bootstrap sem show cria presenter após ready/identidade. COM cold start (`-Embedding` reconhecido somente como modo de lançamento, sem payload de tarefa em argv) pode iniciar owner; manter janela inicialmente oculta até callback ou deadline10s, carregar estado/índice e então abrir/localizar. Deadline sem callback abre gerenciamento com aviso seguro e não inventa tarefa.

Disputa: segundo lançamento manual notifica owner para restore/foco e sai imediatamente, sem abrir banco. Segundo processo COM sem lock é **relay transitório**, sem banco/janela/scheduler: valida mesma identidade instalada, registra handler/bootstrap e espera no máximo10s. Callback validado faz nova requestSingleInstanceLock com additionalData fechado `{version:1,kind:'reminder-activation',tag}`. Se continua sem lock, Electron encaminha ao owner e relay sai; se owner morreu e lock é adquirido, só então compõe storage/lifecycle e resolve tag. Sem sockets novos, serviço ou arquivo de inbox. Owner considera additionalData não confiável, valida shape/tamanho, relê estado e coalesce mesma tag em2s; nunca executa comando de tarefa. Registrar separadamente callback/relay/direct route para comprovar uma navegação. A repetição de request após retorno false está fundamentada no [código fixado de App](https://github.com/electron/electron/blob/v44.5.1/shell/browser/api/electron_api_app.cc); provar corrida COM instalada continua obrigatório. [Activator fixado](https://github.com/electron/electron/blob/v44.5.1/shell/browser/notifications/win/windows_toast_activator.cc).

Localizar restaura/foca janela e obtém estado atual. Evento transporta só tag, guardando no máximo uma intenção pendente; wrapper resolve em leitura coordenada devolvendo revisão global e ordinal da tarefa na ordem canônica de snapshot (IDs SQL, antes dos filtros). Isso evita impor teto a IDs históricos no evento1KiB. Cliente usa snapshot da mesma revisão, tenta convergir até três vezes, depois informa BUSY/stale sem localizar tarefa errada. Provar ordem SQL/paginação/assembler antes de usar ordinal. Alvo removido/tupla obsoleta mostra mensagem focável; nunca recria tarefa.

Se alvo está fora dos filtros, mostrar destaque temporário fora dos resultados com ação Voltar à lista, conservando filtros/ordem/contagens. Se há draft de outra tarefa, conservar form e mostrar alvo em cartão de consulta separado, sem abrir editor destrutivamente; foco no heading do alvo/aviso. Navegação muda contexto e invalida undo/preview antigos, sem modificar dados. Ausência de foco concedido pelo Windows exige indicação visível ao abrir, sem contorno de política do SO.

### D9 — Preferência versionada no próprio Windows

Decisão proposta: **não criar arquivo JSON nem tabela de preferência**. A entrada própria HKCU Run `taskflow.app.startup.v1` e seu StartupApproved são a representação durável do contrato de startupv1. Ausência significa desligado; default não escreve registro. Metadata de instalação identifica recursos, não duplica o boolean de preferência. Backup não transporta esses dados. Isto fecha fonte de verdade e elimina transação impossível JSON↔registro.

Somente gesto explícito chama setLoginItemSettings com `name` próprio, `path=process.execPath` validado instalado, `args=['--taskflow-login']` e `enabled=desired`; opt-in pode enabled=true porque o usuário solicita habilitar. Opt-out remove Run próprio e, após conferir ownership/readback, remove somente seu valor StartupApproved pelo adapter restrito, evitando default enabled=true ou cadastro residual. Ler usando mesmo path/args, considerar somente launchItem com nome/escopo user/path/args correspondentes e enabled; consulta do valor próprio também detecta target estranho que não aparece nessa lista. Não usar executableWillLaunchAtLogin sozinho (pode refletir outra entrada/args). Exibir OFF/ON/DISABLED_EXTERNALLY/UNAVAILABLE/UNKNOWN; não importar outra entrada de máquina/usuário como preferência. [API app](https://www.electronjs.org/docs/latest/api/app).

Setter é idempotente, serializado por gate próprio de operação nativa (não em SQL), revalida sessão/visibilidade antes de efeito, relê resultado. Run e StartupApproved podem falhar separadamente: comunicar observado/UNKNOWN, não alegar rollback, compensar/reabilitar ou persistir valor desejado que o SO não confirmou. Resposta perdida exige releitura, nunca replay automático. Reconsulta no foco/abertura e no máximo60s quando UI ativa; não reescreve ao iniciar. Entrada de versão futura/target estranho bloqueia setter para revisão e permanece intacta.

Só argumento exato de login inicia HIDDEN se Tray válido; manual abre VISIBLE e COM segue D8. Reinstalação após uninstall começa OFF, porque entrada foi removida; upgrade no mesmo caminho mantém configuração/desativação externa. Binário antigo sem suporte ignora entrada própria desconhecida, não a reescreve; SQL/codec seguem compatíveis. Instalação é offline/asInvoker, sem serviço/tarefa agendada. A mudança de D9 deve voltar a review se se descobrir necessidade de formato adicional.

### D10 — IPC fechado e controle de superfície

Catálogo26 =21 existentes +getDesktopStatus/setStartAtLogin/requestQuit/subscribeDesktopEvents/resolveReminderActivation. Create passa4, update5; check3/status4/state3/move2/backup1 e demais1 conservam shapes. Alteração coordenada no mesmo bundle; antigos create3/update4 recusam. Erros de reminders são campos/índices0–9/códigos finitos; demais índices0–19 conservados. Request64KiB/ack8KiB; estado/eventos1KiB e páginas256KiB existentes.

Desktop v1: getDesktopStatus sem opções devolve surfaceSequence/visibilidade/recuperação, capacidade/estado seguro de reminders e estado de startup; setStartAtLogin aceita só desired boolean; requestQuit sem opções; resolveReminderActivation só tag64hex retorna NOT_AVAILABLE ou `{revision,taskOrdinal}`. Nada retorna path/AUMID arbitrário/native options/Task/clock/marker/stack. Erros fechados incluem BUSY/RESOURCE_LIMIT/UNAVAILABLE/NATIVE_OPERATION_FAILED/STATE_UNKNOWN e erros usuais de autorização; campos exatos validados nas duas pontas.

subscribeDesktopEvents é wrapper de callbacks locais com disposer idempotente; invoca somente canais internos finitos de subscribe/unsubscribe, sem canal livre. Uma inscrição por contents vivo/documento local, até oito conforme limite já existente. Frame/origem/URL autorizados antes de inscrever. Eventos v1, sequência positiva monotônica, kinds fechados surface-suspended/surface-active/desktop-status-changed/locate-reminder(tag); sem Tasks/tokens antigos. Listener de controle pode receber suspensão/ativação com sessão de produto retirada, sob guarda específica de contents/mainframe/origem/URL ainda vivos; esse recebimento não autoriza produto ou setter oculto. Reload/crash destrói inscrição de controle. Registrar listeners antes do handshake; buffering limitado à maior sequência e última intenção. Nenhuma chamada que reative sessão é exposta ao renderer.

### D11 — Comunicação e critérios verificáveis

Área secundária acessível no shell para comportamento e iniciar com usuário, sem redesign: “Fechar mantém o TaskFlow na bandeja e os lembretes ativos. Para encerrar, use Sair.”; “Ao retomar ou abrir, pendentes com até 5 minutos de atraso podem ser avisados. Com o aplicativo encerrado, computador desligado ou avisos bloqueados pelo Windows, não há garantia de aviso.”; “Rascunho e filtros permanecem nesta execução; Sair ou falha pode perdê-los. Desfazer e prévias são descartados ao fechar.” Texto final pode ser refinado sem alterar semântica. Estados nativos devem aparecer dentro da janela, sem depender de toast para explicar close.

| Critério | Evidência e oráculo |
| --- | --- |
| M01 | Regras/draft/form: limites0/10/11, presets, tipos/IDs/instantes, prazo/recorrência, datas intactas, fuso/erros por item. |
| M02 | Clock falso: trigger−1/trigger/trigger+300000/+300001, startup/resume/reopen, salto/recuo/fuso e timeout distante; classificação/marker/ausência de efeito exatos. |
| M03 | Barreiras determinísticas: timer→fila→claim→afterReleased→show contra todas as mutações; dado fresco e nenhum candidato antigo antes da submissão. |
| M04 | SQLite/faults/crash-child: antes/depois de claim/COMMIT/submissão, rollback/incerto, notifier failed/unsupported; contagem de tentativas<=1 e markers/revisões após reopen. |
| M05 | DONE/SKIP/END, adiar/remover e undo de série: antiga+gerada atômicas, OFFSET novo/settlement, falha externa não reverte. |
| M06 | CRUD/trash/restore/undo/import APPLIED/UNCHANGED/empty/recovery; sem replay vencido, projeção corrigida, preview conflita e undo não conflita por claim. |
| M07 | X/Alt+F4/minimize/reopen, draft/filtros, guards ocultos, tokens/listeners/pedidos/commit sem ack; bases conservadas e uma nova inscrição. |
| M08 | Tray Abrir/Sair/falha, single instance/manual/COM, crash renderer, quit repetido/logoff; um escritor e saída efetiva. |
| M09 | Conta padrão instalada: identity/CLSID/COM, toast/ícone/prazo, click/Action Center/cold/race, fora de filtro/draft/removida/alterada; DND/disabled/failure sem falso delivery. |
| M10 | Login OFF/ON/externamente desativado, Unicode/path, hidden/manual, erro parcial, upgrade/uninstall/reinstalar/segunda conta; nenhum registro alheio alterado. |
| M11 | IPC26 negativas/shape/frame/URL/versão/bytes/sessão e IDs históricos; teclado/foco/zoom200/DPI/leitor de tela com evidência humana separada. |
| M12 |1000/10000×10, burst/heap/charge/timer1/coalescimento/yields/claimfila e fallback; gates npm/OpenSpec/pacote e relatório rastreável. |

Orçamentos novos propostos para revisão: atraso até início da decisão p95<=1000ms em carga estável, sem suspender/DND ou fila artificialmente saturada; rebuild até5s em1000 e10s em10000×10; fatia pura<=10ms, unidade SQL p95<=100ms de referência, fallback<=60s; CPU médio main<=1% em60s ocioso no equipamento de referência documentado. Janelas da decisão sempre revalidadas e limites de64MiB/16/uma unidade/um timer são verificações estruturais. Registrar hardware/runtime/dataset/bytes/picos/percentis e cenários saturados separadamente, inclusive expiração por fila. Falha desses orçamentos é bloqueio de aceitação nova: revisar proposta, sem relaxar no apply.

D10/a11y/energia/before-images/diálogo backup herdados não viram PASS nesta Change. UI D10 p95688,3ms/heartbeat760,5ms/scan141,7ms e números700/700/250 não aprovados permanecem; não usar orçamento de scheduler para liberar esse gate.

## Risks / Trade-offs

- [Claim durável pode perder aviso] → documentar at-most-once, injetar crash e não criar retry/ledger por conveniência.
- [Windows pode bloquear/retardar toast ou foco] → provar instalado e distinguir solicitação/show de exibição; cancelamento posterior best effort.
- [COM/relay pode disputar registration e lock] → callbacks restritos/coalescimento/timeout/um writer, campanha instalada; falha exige revisão sem adicionar helper/dependency silenciosa.
- [Hide conserva conteúdo em memória] → só execução atual, retirar autoridade e tokens; crash/quit não recuperam texto.
- [Volumes/IDs grandes ou scan concorrente esgotam recursos] → charge64MiB/yields/ciclos limitados/degradação visível, nenhuma truncagem ou loop de claims.
- [Registro Run/StartupApproved não é transação única] → SO como fonte de verdade, readback/UNKNOWN, não compensar ou reabilitar automaticamente.
- [Ambiente bloqueia processo restrito de registro] → integração nativa UNAVAILABLE, CRUD local preservado; provar conta padrão/Unicode e não contornar política nem instalar runtime/módulo alternativo.
- [Reimportar futuro redefine estado] → at-most-once limitado à tupla pendente do estado corrente, sem promessa de histórico deduplicador entre substituições explícitas.

## Migration Plan

1. Apply somente após aprovação explícita; preservar origem e trabalho do usuário. Compor regras/contratos/claim/barreira/scheduler primeiro, integrar mutações e UI/lifecycle, então identidade/startup/notifier e harness.
2. Manter SQL2/codec4/backupv1–v4, sem DDL/migração ou transporte de config. Novos canais/versões e startup/native identityv1 entram no mesmo bundle. Primeira execução prepara somente identidade nativa própria; não opta pelo login.
3. Rodar validate, OpenSpec estrito, package:win sem publicação, verify:package e smoke:packaged com perfil fictício. Teste instalado/Setup/segunda conta/logoff/upgrade exige ambiente e autorização correspondentes; ausência de prova é pendência bloqueante M09/M10, nunca substituída por harness.
4. Atualizar arquitetura/paridade/guia operacional apenas quando implementado; gerar verification.md e submeter à aprovação. Não archive/README/commit/push/PR/merge/release por efeito deste propose.
5. Rollback técnico para binário anterior preserva dados compatíveis; perde scheduler/bandeja, reinstalando guards antigos. Revogar startup explicitamente antes de usar binário que ignora `--taskflow-login`; uninstall retira recursos próprios com ownership, não banco/backup. Não apagar markers para recuperar avisos perdidos. Qualquer schema/dependency/ledger novo ou mudança semântica exige revisão dos artefatos antes de implementação.

## Open Questions

Nenhuma decisão material fica delegada ao apply. As escolhas D1–D11 são propostas para revisão, e só a graça de recuperação e preservação em memória no close já têm confirmação humana específica. Texto exato dos avisos e equipamento/VM/conta fictícia da campanha podem ser definidos depois sem alterar contratos. A comprovação nativa COM/NSIS/StartupApproved continua trabalho de aceitação, não hipótese a declarar resolvida por documentação.
