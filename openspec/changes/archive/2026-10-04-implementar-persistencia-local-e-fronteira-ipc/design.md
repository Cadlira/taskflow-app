# Design

## Context

A motivação e o recorte estão em [proposal](C:/QSI/Workspaces/taskflow-app/openspec/changes/implementar-persistencia-local-e-fronteira-ipc/proposal.md). Esta é uma proposta ainda não aprovada. O pedido de 2026-10-04 escolhe persistência e IPC de leitura/subscriptions; não autoriza antecipar criar/editar/status.

Baseline consultado: [arquitetura D2–D4 e fundação implementada](C:/QSI/Workspaces/taskflow-app/docs/architecture.md), [paridade](C:/QSI/Workspaces/taskflow-app/docs/parity-matrix.md), [testes](C:/QSI/Workspaces/taskflow-app/docs/test-strategy.md), arquivos arquivados das TFA-001/002 e specs consolidadas. A TFA-002 fixou Electron 44.5.1/Node 24.21.0 e aceitou `node:sqlite` RC depois da inviabilidade do addon nessa prova. A prova fictícia não configura nem comprova o banco de produto. Não muda o contrato per-user.

Inspeção somente leitura da extensão, HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`:

| Evidência | Consequência para o desenho |
| --- | --- |
| [Porta TaskRepository](C:/QSI/Workspaces/taskflow-extension/src/application/task-repository.ts) e [TaskTrashRepository](C:/QSI/Workspaces/taskflow-extension/src/application/task-trash-repository.ts) | Callbacks condicionais e unidade de trabalho são internos; não cruzam IPC. Erros de armazenamento precisam preservar razão sem depender de protótipo remoto. |
| [ChromeTaskRepository](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/chrome/chrome-task-repository.ts): fila por instância, mutação de ambas as coleções | Fila copiada por adapter não coordena janelas/scheduler. Move/restore precisam de commit único e restore pode encontrar `ID_EXISTS`. |
| [TaskService](C:/QSI/Workspaces/taskflow-extension/src/application/task-service.ts): leitura anterior ao save em update/status | Serializar apenas save conserva decisão stale. A unidade futura deve abranger leitura, decisão e commit. Não migrar o serviço inteiro nesta Change. |
| [ReminderService](C:/QSI/Workspaces/taskflow-extension/src/application/reminder-service.ts) e [undo](C:/QSI/Workspaces/taskflow-extension/src/domain/task-undo.ts) | Claim condicional persistido antes do efeito externo; `processedFor` não muda `updatedAt`. Revisão de conteúdo não deve mudar por claim interno. Scheduler/undo funcional ficam fora. |
| [Codec tarefas](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/storage/stored-task-collection.ts), [lixeira](C:/QSI/Workspaces/taskflow-extension/src/infrastructure/storage/stored-trash.ts) e [integridade](C:/QSI/Workspaces/taskflow-extension/src/domain/task-integrity.ts) | Versões 1–4 e invariantes precisam ser testadas por cópia revisada futura. Nem todos os limites de formulário são limites históricos do armazenamento. |

O diagnóstico atual tem schema exato de 1 KiB, main frame/webContents/URL e gate `BUSY`; a nova autorização também exige origem real e identidade do documento. O teste arquitetural existente precisará cobrir módulos Node em todo o núcleo portável. Nenhum código dessas adaptações foi escrito nesta proposta.

## Goals / Non-Goals

**Goals:** tornar durabilidade e coordenação testáveis sem UI de gerenciamento; manter dados completos e erros observáveis; oferecer estado coerente a superfícies autorizadas; estabelecer uma fronteira que futuros produtores internos usem sem writers paralelos.

**Non-Goals:** criar casos de uso de gerenciamento remotos, migrar `TaskService`/scheduler inteiros ou homologar recorrência/undo/notificação; ler perfis Chrome; criar infraestrutura de backend, worker antecipado ou recovery por backup. Preservar dados recorrentes e marcadores existentes é compatibilidade, não implementação das ações futuras. O shell continua diagnóstico.

## Decisions

### D1 — SQLite embarcado e configuração de produto

Selecionar `DatabaseSync` de `node:sqlite` do runtime fixado, uma conexão de produto por processo proprietário. Usar `journal_mode=DELETE`, `synchronous=EXTRA`, `foreign_keys=ON`, extensão desabilitada, SQL parametrizado e `BEGIN IMMEDIATE` em toda mutação/migração. Ler de volta PRAGMAs efetivos; resultado divergente bloqueia abertura, sem degradar configuração. Lock wait de 100 ms, sem loop infinito ou retry cego. Não habilitar `journal_mode=OFF/MEMORY`, `synchronous=OFF/NORMAL`, SQL livre ou mecanismos alternativos.

| Opção | Avaliação |
| --- | --- |
| JSON com envelope único tarefas+lixeira+revisões | Evita driver e pode reutilizar formato próximo dos codecs. Exige escritor único, temporário no mesmo volume, flush, substituição, recuperação de temporário/backup e validação antes de substituir; reescreve toda a coleção por commit. Dois arquivos independentes não tornam move/restore atômicos. |
| SQLite DELETE/EXTRA — selecionado | Transação entre tabelas e metadados, locks e rollback journal fornecem primitives adequadas; o runtime embarcado já evita addon/dependência adicional. EXTRA adiciona sincronização de diretório ao remover journal em DELETE. Precisa de prova no filesystem/runtime de destino. |
| SQLite WAL/FULL — alternativa não selecionada | Pode melhorar leitura concorrente, mas há um único escritor e o IPC aqui não exige conexões concorrentes. Introduz `-wal`/`-shm`, checkpoints e recovery adicionais. Mudança exige revisão, versão SQLite/correções verificadas e testes dos auxiliares/checkpoints. |

Fontes: [atomic commit SQLite](https://sqlite.org/atomiccommit.html), [synchronous](https://sqlite.org/pragma.html#pragma_synchronous), [WAL e correções de WAL-reset](https://sqlite.org/wal.html). A durabilidade depende de filesystem, dispositivo e cumprimento dos flushes. Kill de processo testa interrupção de processo; não prova perda de energia. A prova da TFA-002 confirma rollback/reopen apenas. Em JSON, `writeFile` com flush não resolve sozinho a publicação/recuperação ([Node fs](https://nodejs.org/api/fs.html)); no Windows, o flag de write-through de `ReplaceFileW` não é suportado ([Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)).

A [documentação versionada Node 24.21.0](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md) identifica API RC, execução síncrona e timeout de lock. Não aplicar APIs de versões mais novas por inferência. Registrar `sqlite_version()`, Electron/Node e PRAGMAs no teste real do pacote; comparar com correções SQLite publicadas. Se o runtime fixado não satisfizer o contrato, bloquear o gate e revisar artefatos, sem trocar runtime/driver por conveniência.

### D2 — Caminho, schema e fidelidade

Produto: `<userData>/data/taskflow.sqlite`; raiz existente `%LOCALAPPDATA%/TaskFlowApp/profiles/{dev,test,prod}/user-data`. Diagnóstico continua em `foundation-proof/proof.sqlite`; cache/sessão em `session-data`. Reutilizar o resolvedor de perfil já comprovado, sem novo override em produção, mudança de ACL, identidade ou instalador.

Schema SQL inicial **1**, separado de codec **4** e backup **v1–v4**:

| Entidade | Dados propostos |
| --- | --- |
| metadata singleton | assinatura TaskFlow App, SQL schema version, revisão global inteira persistida; redundância de `user_version` deve concordar com metadata |
| tasks | `id` PK, `payload_version`, `payload_json`, `content_revision` positiva |
| trash | `id` PK própria, mesmos metadados/payload e `deleted_at` validado |

As tabelas NÃO compartilham uma restrição de ID único: um ID pode existir simultaneamente em tasks e trash, e restore deve retornar `ID_EXISTS`, preservando ambos. Validar correspondência ID/payload, versão, metadados, datas e invariantes; nenhuma linha inválida é omitida para produzir aparente sucesso. Consultas usam ordem estável para transporte; ordem de subtarefas/tags/reminders no payload é conservada. Índices/metadados não são campos do backup.

`payload_json` representa um item na versão indicada, sem envelope de coleção duplicado por linha. A integração do codec recompõe o envelope versionado necessário ao decoder portável; na lixeira inclui `deleted_at` do metadado validado. Não inferir codec pela versão SQL. Um save sem alteração lógica é no-op, sem converter payload histórico por conveniência; nova representação v4 é gravada quando há alteração efetiva ou migração explicitamente registrada.

Preservar `id`, `title`, `description`, `requester`, `assignee`, `status`, `priority`, `dueAt`, `reminders` AT/OFFSET e `processedFor`, `seriesId`, `recurrence`, subtarefas ordenadas, `tags`, `sourceUrl`, `createdAt`, `updatedAt`, `completedAt`; distinguir ausência de valor e normalizações verificadas nos codecs. V1–v4 decodificam para modelo atual; novas gravações codificam v4. Não prometer propriedades desconhecidas que os codecs da origem já descartam. Não regravar registros só por ler. O codec validará escrita e leitura; encoder que apenas envelopa não é validação suficiente.

Copiar no apply somente tipos/validações/codecs portáveis e símbolos necessários, após revisão; não copiar adapters Chrome, configurações de IA, dados reais ou ações de funcionalidades futuras. DTO de saída é uma projeção validada do estado, não autoridade para receber `Task` livre do renderer.

### D3 — Abertura, falhas e migração

Adquirir ownership antes de abrir qualquer banco. Classificar o destino antes de criar schema ou mudar PRAGMAs persistentes:

| Situação | Resultado proposto |
| --- | --- |
| Arquivo inexistente, diretório/perfil conhecido, sem indício de criação anterior | Criar banco e schema/metadata/revisão 0 numa transação inicial; validar, confirmar e então publicar estado vazio. |
| Arquivo existente de zero bytes, SQLite sem assinatura/schema, ou criação interrompida sem metadata válida | Bloquear com `INCOMPATIBLE_DATA`, preservar arquivo; não tratar como perfil novo, completar DDL ou remover automaticamente. Recuperação explícita futura. |
| SQLite válido e produto identificado/compatível | Autorizar conexão, verificar versão/schema/integridade e payloads, aplicar configuração e habilitar coordenação. |
| Schema SQL/payload futuro, inconsistência de assinatura/metadados ou payload inválido | `INCOMPATIBLE_DATA`, sem DDL/migração adivinhada, rewrite ou descarte. |
| Arquivo truncado/corrupção estrutural detectada | `CORRUPTED_DATA`, preservar arquivos; nenhuma recuperação automática por reset. |
| Abertura/I/O/lock/configuração indisponível | `STORAGE_UNAVAILABLE`; preservar dados e permitir nova abertura após correção da causa. |

Preflight não usa `CREATE TABLE IF NOT EXISTS` para mascarar arquivo incompatível. Verificar integridade estrutural com `quick_check`, assinatura/schema esperado e todos os payloads/metadados; fixtures incluem arquivo SQLite de outra aplicação. A recuperação normal de hot journal é responsabilidade do motor SQLite e pode requerer escrita antes de consultas; não apagar journal nem tentar interpretar rollback por conta própria. Isso difere de DDL ou migração da aplicação. Não copiar o `.sqlite` isolado durante transação para anunciar backup consistente.

Não existe schema SQL de produto anterior implantado. Não inventar uma migração de `foundation-proof` ou da extensão. Implementar executor interno para migrações explicitamente registradas: verificar versão origem, validar pré-condições, migrar dados+schema+metadata em uma transação, validar destino e só então commit/revisão/evento. Exercitar rollback/interrupção em fixture isolada de migração, sem publicar schema SQL 2 fictício no produto. Payloads v1–v4 são compatibilidade de codec; não autorizam importação de arquivos. Uma futura migração concreta será proposta na Change correspondente.

Falha antes de commit: rollback, nenhuma revisão/evento de sucesso. Se rollback ou confirmação falhar de modo que o resultado seja incerto, invalidar conexão e estado disponível, reabrir/validar antes de aceitar nova operação; não continuar numa conexão possivelmente divergente. Depois de commit confirmado, transporte/efeito externo não reverte o banco. Falha transitória recuperável não envenena a fila. Recuperação aqui significa rollback do motor, reopen validado e erro seguro; escolha/restauração de backup e UI de reparo ficam fora.

### D4 — Unidade de trabalho e revisões

Uma fila e uma conexão de produto pertencem ao main. Todos os futuros produtores — comandos de UI, restore/undo, importação, recorrência e lembretes — devem entrar no mesmo coordenador. Não oferecer conexão ou adapter escritor paralelo. A unidade executa read/decide/validate/commit sobre o estado atual; callbacks são internos, síncronos e sem efeitos externos. Evitar enqueue recursivo e transação aninhada: a unidade recebe portas limitadas da transação, não chama a fila novamente.

Primitives desta Change: list/get; save/saveMany/replaceAll/delete; move/restore/delete/empty/purge de lixeira explícitos; atualização e reversão condicionais internas; claim de ocorrência. São suporte e testes de armazenamento; não migram serviços/UX desses recursos nem expõem comandos no IPC. Leituras e snapshots não fazem purge; a política de retenção/expurgo funcional da lixeira será integrada em TFA-006.

Revisão global `g` é incrementada exatamente uma vez por commit que altera estado observável. No-op/recusa/rollback não incrementam nem notificam. `content_revision` de cada item usa um valor alocado dessa sequência global quando conteúdo de usuário muda; recriação de ID não reutiliza revisão antiga, evitando ABA. Claim altera `processedFor` e `g`, mas conserva `content_revision` e `updatedAt`. Valores são inteiros SQLite não negativos, sem wrap; IPC usa string decimal canônica para não perder precisão JS. Limite do inteiro bloqueia escrita com erro seguro, nunca reinicia contagem.

Restore/recriação e substituição que reintroduza um ID alocam revisão de conteúdo nova mesmo se o payload se parecer com o antigo; CAS também verifica existência/coleção. A revisão guardada na lixeira não é reutilizada para autorizar um draft anterior à exclusão. Move conserva os dados, mas registra a transição na revisão global; isso não implementa undo funcional.

Primitives condicionais de edição usam revisão de conteúdo esperada, validam na mesma transação e preservam `processedFor` atual para ocorrências inalteradas. Importar/substituir coleção exige base global esperada no contrato interno; não cria a importação nesta Change. Não aceitar save stale como protocolo de edição: save/replaceAll são primitives internas sob coordenação, e futuros casos de uso devem decidir dentro da unidade. Timestamp continua campo do domínio, não controle de concorrência.

Claim interno valida tarefa ainda ativa, ocorrência/prazo/reminder esperados e ausência do mesmo `processedFor`; dois claims competindo resultam em apenas um commit. Se edição vencer, claim antigo pode ser inaplicável; se claim vencer, edição não apaga marcador. A futura semântica de undo deve comparar conteúdo/pré-condições e conservar processamento de lembrete; não implementar token/UndoPlan ou garantir undo agora.

Eventos são produzidos apenas depois do commit confirmado e fora da transação. Notificação Windows/IA/clipboard e qualquer await externo ficam fora da fila crítica. Claim antes do notifier futuramente permite no máximo uma tentativa, com perda possível após claim/crash; entrega exactly-once não é prometida. Perda de resposta após commit exige snapshot/resync; não repetir mutação cegamente.

### D5 — Contrato de estado e snapshots

Catálogo fechado de estado v1, separado de `foundation:verify:v1`:

| Operação pública | Request exato / resultado |
| --- | --- |
| `getStateSnapshot` | `{ version: 1 }` ou `{ version: 1, cursor }`; primeira página ou continuação vinculada à sessão/revisão |
| `subscribeState` | `{ version: 1 }`; inscrição idempotente por documento, revisão base e primeira página do snapshot inicial |
| `unsubscribeState` | `{ version: 1, subscriptionId }`; remove só inscrição da mesma sessão; repetição local é idempotente |

Sucesso é união `{ version: 1, status: 'ok', ... }`; erro é `{ version: 1, status: 'error', code }`, sem texto arbitrário. DTO de página contém `revision`, fragmentos tipados tarefas/lixeira, cursor opaco ou conclusão. Fragmentação de um registro maior que a página preserva bytes/conteúdo e só permite decodificação/publicação após reunião e validação completa. Cursor/subscriptionId são gerados pelo main, opacos, até 128 bytes, sem path/SQL/repository serializado. Ordem estável por coleção/ID, sem consulta/filtro livre.

Não manter uma transação de leitura aberta esperando renderer. Cada página é lida pelo coordenador, na revisão base, com leitura e checagem coordenadas; se `g` mudou, devolver `SNAPSHOT_STALE` sem publicar o restante como snapshot completo. Nenhuma versão antiga parcial vira estado visível. Continuations não são usadas após erro/TTL/navegação. Isso evita cópia integral de coleção congelada e retenção prolongada de locks. Alternativa de snapshot completo congelado exigiria memória proporcional a toda coleção e serialização extensa no main; não é selecionada.

Inscrição + primeira página + revisão base ocorrem num turno coordenado. O preload instala seu listener fixo antes de invocar subscribe e buffers de eventos enquanto aguarda resposta/monta páginas. Callbacks locais do renderer ficam no preload/renderer, não são argumentos de invoke. Evento `state:changed:v1` contém apenas versão, subscriptionId e revisão global; significa invalidar e obter novo snapshot, não replay de patches de tarefas. Evento `state:unavailable:v1` comunica código seguro quando a sessão de dados perde validade, sem inventar estado vazio. Entregar eventos só após commit e autorização de envio.

Depois do snapshot completo na revisão `r`, descartar eventos `<= r`, coalescer maior revisão pendente e ressincronizar. Buffer mantém apenas a maior revisão por inscrição, pois eventos são invalidações; não descarta dados ou comandos. Revisão antiga/duplicada é ignorada; salto, evento fora de ordem, snapshot stale, perda de resposta ou reconexão exige resync. No máximo três reconstruções imediatas por ciclo; sob churn contínuo, retornar `BUSY`, conservar último estado completo marcado stale e retomar quando houver invalidação ou nova solicitação. Não retry automático de escrita.

Um evento pode se perder sem aparecer um salto. Por isso o wrapper reconcilia por snapshot ao retomar foco e a cada 30 s enquanto inscrito, além do handshake e dos eventos; não depende exclusivamente do transporte. Nenhuma UI nova ou scheduler de lembretes é criada. Unsubscribe/navegação/reload/crash/fechamento removem listener, inscrição, cursors e qualquer trabalho/resposta pendente do documento.

### D6 — Autorização, documentos e erros

Reutilizar o registro de superfícies no main e adicionar uma geração opaca por documento. Antes de enfileirar, antes de acessar dados na execução e antes de enviar resultado/evento, conferir: webContents registrado e vivo; frame vivo idêntico ao main frame; identidade do frame/documento e geração de sessão corrente; `WebFrameMain.origin` igual à origem esperada; URL real correspondente à rota local autorizada. Origem herdada por about:blank/blob ou URL semelhante não substitui os outros testes. Pacote aceita apenas `taskflow://app` conforme resolvedor existente; dev aceita somente a origem loopback declarada no modo dev. Conferir a origem real do protocolo no runtime empacotado, falhando fechado se divergir.

Invalidar geração em início de navegação/reload (inclusive mudança de documento na mesma URL), destruição de frame, `render-process-gone` e fechamento. Work autorizado que ficou na fila não acessa DB se sua sessão expirou; uma transação interna já confirmada permanece, mas não envia dados ao novo documento. Resposta de invoke após reload é tratada como transporte invalidado, não como autorização reutilizável. Não modificar sandbox, contextIsolation, CSP, resolvedor, bloqueios de navegação/janelas/webviews/permissões. HTTP/HTTPS externo fica na TFA-004.

Validar schemas estritos, plain objects, discriminantes, enums, keys extras, strings/cursors/revisões e limites em runtime, também na saída recebida pelo preload. Tipo TS não autoriza request. Mesmos guards protegem diagnóstico, preservando seus resultados/limite de 1 KiB e `BUSY` concorrente independente da fila de produto. Fontes: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [origem real de frame](https://www.electronjs.org/docs/latest/api/web-frame-main#frameorigin-readonly) e [limites da serialização de erro IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).

União pública de estado: `INVALID_REQUEST`, `UNAUTHORIZED`, `BUSY`, `SESSION_CLOSED`, `SNAPSHOT_STALE`, `RESOURCE_LIMIT`, `INCOMPATIBLE_DATA`, `CORRUPTED_DATA`, `STORAGE_UNAVAILABLE`. `CONFLICT` e `ID_EXISTS` são resultados internos, sem canal de mutação remoto agora. A porta portável mantém razões de armazenamento por discriminante; o main traduz para códigos fechados. Não retornar `Error`, stack/cause, SQL, paths, conteúdo em falhas ou confiar em `instanceof` através de invoke. Log permitido só código/fase/métricas/versões de runtime, sem dados pessoais, IDs de tarefas ou payloads.

### D7 — Limites síncronos e encerramento

Orçamentos iniciais propostos para revisão nesta Change:

| Recurso | Limite / gate |
| --- | --- |
| Request de estado/diagnóstico | 1 KiB UTF-8 serializado; enums/shape/cursors exatos |
| Resposta de estado | 256 KiB UTF-8 serializado por página, incluindo envelope/escaping; registro maior é fragmentado, nunca cortado |
| Evento de invalidação/erro | 1 KiB; coalescer maior revisão por inscrição |
| Estado transitório por documento | Uma inscrição e um cursor ativo; cursor 30 s sem atividade, renovado a cada página; máximo 8 documentos registrados no harness, sem criar feature de múltiplas janelas |
| Fila | 64 entradas no total, máximo 8 por sessão; timeout de espera 2 s antes de iniciar; excedente recebe `BUSY` sem efeito |
| SQLite lock | 100 ms; `SQLITE_BUSY/LOCKED` não dispara retry infinito |
| Benchmark alvo | 1.000 e 10.000 tarefas + 100 itens de lixeira, Unicode/campos completos e conjunto serializado de pelo menos 20 MiB |
| Latência síncrona | p95 <= 100 ms por página/mutação representativa; validar também pior caso de `saveMany` de 10.000 itens, sem dividir seu commit; startup/preflight <= 5 s no perfil de referência registrado |
| Shutdown | Fechar admissão, invalidar sessões e drenar fila admitida; canceláveis ainda não iniciadas podem receber encerramento seguro. Registrar drain alvo 5 s, sem forçar saída durante commit |

Não limitar quantidade total persistida ao dataset do benchmark nem rejeitar campo historicamente válido só pelo limite novo de formulário. Não truncar snapshots, omitir registros ou fragmentar `saveMany` em commits para cumprir tempo. Excesso de request/fila é rejeição antes de efeito; pressão de recursos de leitura retorna `RESOURCE_LIMIT`, conserva o banco e último estado completo, sem fingir sucesso vazio. Paginação pode percorrer coleção maior; não há limite total de bytes do snapshot. Coleções excessivas para a memória da máquina são uma limitação explícita, não autorização para perda de dados.

`DatabaseSync` bloqueia o event loop; orçamento de latência é gate medido, não timeout capaz de interromper syscall/COMMIT síncrono. Registrar hardware/dataset/tamanho/percentis/maior bloqueio e heartbeat do main no pacote. Se o gate falhar, revisar para worker interno proprietário (mesmas unidades/revisões/guards) antes de implementar essa mudança material; não instalar worker/driver como fallback. Não afirmar responsividade por passar teste unitário em Node externo.

Fechamento provisório ainda encerra app, sem bandeja/serviço. Parar admissão antes de fechar conexão, invalidar entregas e concluir/reverter unidades; reabrir só após ownership. Testes de kill usam processo/perfil exclusivamente fictícios com barreiras identificadas, jamais processo do usuário.

### D8 — Evidência e rastreabilidade

| Critério do roadmap | Requisitos e verificação futura |
| --- | --- |
| P01 | Fidelidade/isolamento; round-trip completo, reopen e comparação integral |
| P02 | Atomicidade de unidades/saveMany/move/restore/colisão; falhas entre writes |
| P03 | Interrupção sincronizada de processo proprietário antes/durante transação, antes/depois do COMMIT e antes da resposta/evento; reopen com estado antigo ou novo inteiro |
| P04 | Abertura/codec/migração; v1–v4, versões futuras, payload inválido/duplicado, SQLite estranho/vazio/truncado, rollback/interrupção de migração |
| P05 | Lock externo, I/O/open/flush/commit, permissão e disco cheio reais controlados ou fault injection identificado; sem falso sucesso, fila recuperável |
| P06 | Dois documentos no mesmo main e produtores internos, barreiras determinísticas, CAS e ABA, sem sleeps/timestamp |
| P07 | Claim duplo/edit/remoção/prazo/status; conservar marcadores e revisão de conteúdo |
| P08 | Handshake/páginas/eventos perdidos ou fora de ordem/no-op/erro/unsubscribe/reload/crash e reconciliação periódica |
| P09 | Matriz negativa IPC, schemas/limits/sender/frame/origin/document/session e tentativas de acesso a dados antes do guard |
| P10 | Ownership antes dos dois bancos; shutdown com unidade ativa e fila, segundo processo sem abertura |
| P11 | Produto/bridge no Electron empacotado, perfil fictício, versões/PRAGMAs/reopen/negativas, sem instalar ou depender de Node externo |
| P12 | Orçamentos acima, lint/typecheck/test/build, package verification/smoke pertinentes, arquitetura e OpenSpec estrito |

O harness poderá usar fixtures/canais internos de teste no main em modo restrito, nunca adicionar writer/test IPC ao preload de produção. O teste de banco de produto não fica condicionado a uma UI de tarefas. `package:win` pode gerar o pacote necessário no apply; não executar o instalador ou publicar. Gates existentes não comprovam os testes novos. Relatório futuro `verification.md` deve distinguir simulação, processo real, pacote real e pendências; aprovação humana é necessária antes de archive.

## Risks / Trade-offs

- [Main bloqueado por validação/SQLite] → páginas e fila limitadas, espera finita, benchmark no runtime; worker exige revisão se necessário.
- [Snapshot reiniciado sob churn] → nunca publicar estado misto, coalescer revisão e manter último estado stale; reconciliação e `BUSY` explícitos.
- [Arquivo vazio após criação interrompida] → bloqueio preservando evidência; não há recuperação automática de inicialização neste recorte.
- [Commit sem resposta] → estado confirmado continua persistido; ressync antes de nova decisão, sem replay de escrita.
- [Erro confundido com perfil novo] → classificação/assinatura/integridade antes de DDL; indisponibilidade nunca vira coleção vazia.
- [Claim apagar edição ou invalidar undo futuro] → read/decide/commit e revisão de conteúdo separada; testes determinísticos sem scheduler.
- [Evento ao documento errado] → gerações, limpeza e reautorização de saída; reload da mesma URL também invalida.
- [Prometer durabilidade absoluta] → registrar configuração e nível real de evidência; kill/rollback não provam energia ou hardware.

## Migration Plan

1. Após aprovação explícita e novo pedido de apply, implementar somente este recorte e testes com perfis fictícios. Nenhuma migração da extensão/prova ou instalação no computador corporativo.
2. Produto novo cria schema SQL 1 transacionalmente. Banco existente passa por preflight; codec v1–v4 é compatível, schema SQL futuro/estranho bloqueia. Migrações registradas são atômicas e falham preservando origem.
3. Validar gates, produto no pacote e limites; registrar configurações/evidências/limitações. Divergência material exige revisão, não fallback.
4. Rollback de transação/migração conserva estado anterior. Downgrade de aplicativo diante de schema desconhecido recusa abertura, não converte silenciosamente. Reversão de código não autoriza excluir dados.
5. Gerar verificação após apply e submetê-la à aprovação. Archive/integração/distribuição permanecem ações futuras autorizadas separadamente.

## Open Questions

Nenhuma decisão material de recorte foi adiada. A revisão humana deve aprovar ou ajustar D1–D7, inclusive schema/path, bloqueio de arquivo vazio e orçamentos. Medições de latência, versão SQLite efetiva e mapeamento exato de eventos de navegação do runtime são evidências a obter no apply, sob os contratos definidos; se exigirem mudar a abordagem, interromper o ponto afetado para revisar artefatos. Hardware do perfil de referência e nomes de helpers/testes podem ser registrados sem alterar o contrato.
