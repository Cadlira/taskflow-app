# Design

## Context

Motivação em [proposal.md](proposal.md). TFA-006 integrada em `9e8a05a2d84874f25d9f429ecc120e81c7ec0acc`; branch própria da TFA-007. SQL2, codec4, bridge17, estado v2, mutações v3, undo por documento e coordenador já existem. Todas as decisões deste documento são **propostas para revisão**, sem aprovação humana inferida.

Evidências consultadas e consequências:
- [Leitor da origem](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-file.ts:193) migra v1–v4; [validador](C:/QSI/Workspaces/taskflow-extension/src/domain/task-integrity.ts:84) é mais estrito que o codec histórico. A validação mantém extras em recurrence e não detecta duas portadoras de série.
- [Serviço da origem](C:/QSI/Workspaces/taskflow-extension/src/application/backup/backup-service.ts:102) omite seriesId/recurrence/subtasks na comparação. Sondagens sintéticas da exploração reproduziram três falsos verified:true; não transportar esse comparador nem o scheduler Chrome.
- [Substituição](C:/QSI/Workspaces/taskflow-app/src/application/storage/task-storage-unit.ts:235) faz CAS global e preserva trash, com UNCHANGED sem revisão nova. [Coordenador](C:/QSI/Workspaces/taskflow-app/src/main/storage/coordinator.ts:255) executa/publica antes da próxima entrada: acrescentar conclusão serializada nesta fronteira, evitando um await externo que libere a próxima ação antes da invalidação.
- [UndoRegistry](C:/QSI/Workspaces/taskflow-app/src/application/undo/undo-registry.ts:254) tem epoch e invalidateAll(), mas [estado](C:/QSI/Workspaces/taskflow-app/src/contracts/state.ts:1) não transporta época. Só eventos por revisão SQL não resolvem UNCHANGED ou resposta elegível atrasada.
- [Prévia](C:/QSI/Workspaces/taskflow-extension/src/components/backup/BackupManager.vue:117), labels, download e testes da origem foram lidos; reaproveitamento seletivo depende de revisão. HEAD da extensão a763e7a0d646c664ecd4f979528bc2c3589fa8c4, somente leitura.

## Goals / Non-Goals

**Goals:** tornar a decisão apresentada vinculante; separar validação de arquivo, estado persistido e resultado de commit; conferir conteúdo completo e propagar invalidação transitória sem falsificar mutação; manter portabilidade do núcleo e arquivos no main.

**Non-Goals:** trocar SQLite/codec, emular Chrome, dar arquivo/path ao renderer, recuperar banco que não abre, manter undo de importação, ampliar produto para scheduler/bandeja ou usar worker nesta implementação. Duas superfícies são recursos fictícios do harness, sem nova janela de produto.

## Decisions

### D1 — Formato portável e projeção estrita

Reutilizar por cópia revisada apenas backup-file, regras de task-integrity e fixtures/testes portáveis. Domínio/aplicação não importam Vue/Pinia/Electron. Criar portas de leitura/salvamento, relógio e preparação; main fornece adapters nativos, tokens e coordenação. Não copiar ChromeTaskRepository, composição Chrome, scheduler, fake-browser/WXT ou download Blob para o produto.

Envelope exportado exatamente format/formatVersion/exportedAt/app/tasks; formatVersion4, app.version do app atual e exportedAt canônico do snapshot capturado. Leitura conserva sourceFormatVersion antes da cadeia: v1 converte lastTriggeredFor subtraindo offset; v2→v3 apenas habilita modelo; v3→v4 insere subtasks:[]. Não aceitar formato futuro, migração ausente ou corrigir valor legado inválido. Sem inventar séries/IDs/passos.

Projetor explícito para Task, reminder, recurrence discriminada e subtask; unknowns são ignorados sem persistir/exportar, inclusive recurrence aninhada. Ausência não vira null/empty string. Ordem de listas conhecidas é mantida. Validação estrita do backup conserva limites/relacionamentos da origem; não aplicar normalizadores de formulário nem a regra de edição until>=dueAt retroativamente ao backup histórico aceito pela origem. A proteção de portadora final é adicional D5.

Exportação deve passar pelo mesmo leitor e comparar a projeção conhecida resultante, antes de abrir temporário. Dados históricos aceitos pelo codec mas inválidos para backup geram LOCAL_DATA_NOT_EXPORTABLE com campos/códigos/índices seguros, no máximo cinco, sem conteúdo. Não produzir arquivo parcialmente exportável nem elevar limites/normalizar texto automaticamente. Alternativa de novo formato mais permissivo alteraria compatibilidade e fica fora desta proposta.

Validação continua conferindo a coleção inteira, mas seu coletor retém somente os primeiros cinco issues seguros e a contagem dos restantes; não construir lista ilimitada de mensagens/objetos inválidos para depois cortá-la. Os códigos locais substituem mensagens livres da origem, sem alterar critérios de validade ou copiar conteúdo do arquivo.

### D2 — Bytes, encoding e recursos antes de efeitos

Limite simétrico **20*1024*1024 bytes** no arquivo completo, incluindo envelope/indentação e BOM de entrada quando existir. Igualdade aceita; excedente FILE_TOO_LARGE. Exportação gera UTF-8 sem BOM; importação aceita UTF-8 estrito com no máximo um BOM inicial opcional, rejeita sequências inválidas/UTF-16 e JSON vazio. Não usar string.length ou tamanho informado por renderer.

Selecionar um arquivo regular, abrir um único handle de leitura e limitar a coleta a max+1; conferir tipo/size, inclusive após abrir, e detectar excedente durante a leitura mesmo que o arquivo cresça. Links que resolvam a arquivo regular escolhido podem ser lidos; o handle efetivo deve ser regular. Named pipes/dispositivos/diretórios são recusados. Não seguir mudanças de caminho ao confirmar: a cópia lida D4 é a autoridade. Falha de I/O usa FILE_READ_FAILED, separada de INVALID_JSON/INVALID_ENCODING.

**Recursos propostos:** um job nativo de backup ativo globalmente (dialog/leitura/exportação), sem fila adicional; concorrência recebe BUSY, inclusive mesma sessão. Confirmações são enfileiradas no coordenador existente, não seguram essa trava durante a espera do usuário. Até oito preparações, uma por documento, sob orçamento lógico global **128 MiB de backup**, independente dos 64 MiB de undo. Toda referência/candidato/job de backup entra no charge enquanto existir.

Antes de JSON.parse, varredura léxica limitada conta valores, chaves e profundidade, verifica strings/escapes e reserva charge `3*fileBytes + 128*nodeCount + 4096`; profundidade máxima **64**, até **262144 nós** (cada chave, container ou valor escalar conta). Excedente RESOURCE_LIMIT, sem confundir com arquivo inválido. Durante leitura, reservar os buffers incrementalmente; converter essa reserva no charge de parse sem contar a mesma referência duas vezes. O scanner não substitui JSON.parse nem valida o domínio. UNKNOWNs também contam para impedir objetos enormes sem valor funcional.

Preparação retida usa `2*canonicalTaskBytes + 128*knownNodeCount + 4096` (JSON UTF-8 das tarefas permitidas; mesmo contador de nós). Charge de parse e preparação se sobrepõem durante projeção até liberar Buffer/string/objeto original; admitir somente se couberem juntos. Snapshot de exportação, string/Buffer serializados, expectativa de verificação e clones/candidatos também contam. Planejar/reservar antes de alocar; liberar referências em finally. Serialization contabiliza bytes incrementalmente antes da string/Buffer completos, recusando >20 MiB sem truncar.

Charge é orçamento lógico, não garantia de heap V8. Medir heap/RSS/pico/latência e ciclos de liberação separadamente, sem chamar GC forçado de prova de produção. Fatiar varredura/projeção puras fora da transação quando possível, cedendo execução; JSON.parse e unidade SQL não têm timeout interruptível. Não estabelecer limite arbitrário de número de tarefas nem teto do codec; arquivo válido pode receber RESOURCE_LIMIT com dados intactos. Testar teto com estruturas permitidas e adversariais.

O banco já mediu 23,9 MiB de payload; isso não mede backup. Manter 20 MiB resolve a assimetria, mas pode impedir exportação de coleção legítima grande: informar integralmente, manter dados e submeter eventual ampliação com novos números/provas à revisão. Não gerar arquivo que o próprio app recuse por tamanho.

### D3 — Diálogos, gravação e ciclo nativo

Adapter no main usa showOpenDialog/showSaveDialog associados à BrowserWindow do ticket, filtro JSON e dontAddToRecent no Windows; save pede confirmação nativa de sobrescrita. Nome padrão preserva taskflow-backup-YYYY-MM-DD-HHmm.json no horário local. Dialog não grava. Validar ticket/contexto antes do diálogo, depois da escolha, antes de cada efeito e na saída. I/O fora da unidade SQL; não manter transação enquanto usuário escolhe destino.

Exportar usa snapshot puro de todas as tarefas capturado **depois** do save dialog, com revisão e relógio consistentes. Exportação preventiva a partir da prévia é subação do mesmo contexto de backup: conserva preparação/base/contagem, sem confirmar ou renovar TTL. Se tasks/trash mudaram, confirmação continua conflitando. Exportar não limpa ofertas de outras sessões.

Evitar destinos dentro do userData/sessionData/runtime do app (incluindo banco/journal), diretórios/dispositivos e destinos symlink/reparse conhecidos. Resolver/canonicalizar pai efetivo e comparar limites reais, sem simples startsWith que confunda diretórios irmãos. Implementação/testes não escrevem na extensão ou em perfis reais; não distribuir caminhos de workspace como regra fixa de produto.

Criar temporário aleatório exclusivo (wx) no mesmo diretório, escrever bytes completos, FileHandle.sync(), fechar e fazer uma única rename/substituição suportada/testada no Windows. Nunca remover ou truncar o destino antes disso; erro antes da substituição conserva original, e cleanup remove somente temporário próprio. Não fazer fallback copy/delete se rename falhar. Após confirmação da substituição, falha de cleanup/verificação é resultado de arquivo salvo com aviso, não FILE_WRITE_FAILED dizendo que o original permanece.

Capturar fingerprint de destino existente (identidade, tamanho e timestamps) após a escolha e verificar antes da substituição; mudança observada retorna DESTINATION_CHANGED, sem sobrescrever. Fingerprint não é lock/CAS de terceiros: há janela residual entre última conferência e rename; não prometer ausência de corrida contra outro escritor nem durabilidade de energia. Releitura exata de bytes do destino limitada a20MiB verifica o salvo; mudança externa/falha posterior gera SAVED_WITH_WARNING, sem segunda gravação/restauração automática do arquivo anterior.

Cancelamento do diálogo retorna cancelled sem erro/arquivo/dados alterados. Se sessão encerra antes da substituição, limpar temporário e não efetuar rename; depois da substituição, o arquivo permanece e nenhuma resposta vai ao novo documento. Não bloquear fechamento indefinidamente em diálogo; invalidar job e limpar quando a API retorna, limitando drain de I/O fora da transação com cancelamento cooperativo. Timeout não desfaz um rename concluído.

Referências primárias: Electron dialog e Node24 fs já verificadas na exploração; APIs devem ser confrontadas com electron.d.ts do Electron44.5.1 e Node24.21.0 existentes no apply, sem instalar dependências.

### D4 — Preparação imutável, consentimento e contexto

Após abrir/ler/migrar/validar, capturar **snapshot de base atual** puro coordenado (globalRevision + localTaskCount; trash não é enviada no resumo), validando preflight. Preparação vincula clone/projeção imutável, documento/ticket, contextSequence, revisão global, sourceFormatVersion, normalized4, exportedAt, appVersion e counts. Não usar snapshot do renderer, nome do arquivo ou hash como autoridade de consentimento.

Token aleatório24bytes/base64url32caracteres, diferente de tokens de undo/confirm; TTL **5 minutos monotônicos desde publicação**, sem renovação por foco/exportação. Uma preparação por documento; escolher novo arquivo, cancelar prévia, trocar contexto/área, navegação/reload/crash/fechamento ou expiração libera anterior/reservas. Só token válido próprio é tomado e consumido uma vez ao confirmar, inclusive conflito/falha; DTO/token alheio inválido não consome o legítimo. Cancelamento próprio repetido é idempotente sem revelar existência de token alheio. TTL é somente de backup; oferta de undo continua sem prazo.

UI entra no backup limpando oferta própria por clear/contextSequence, mantendo uma única inscrição de estado. Prepare/export/cancel no mesmo fluxo são operações do contexto de área, com seus próprios gates; não relaxar slot de mutação de tarefa/undo. Duplicatas de confirm não são no-op autorizado. Cancelar confirmação modal retorna à mesma prévia/token, sem gravar; cancelar **prévia** consome/libera token. Renovar após conflito/expiração exige nova escolha/leitura/prévia, nunca consentimento elevado automaticamente.

Resumo somente sourceFormatVersion1..4, formatVersion4, exportedAt, appVersion, fileTaskCount, localTaskCount, baseRevision, restoreToken, expiresInMs300000. Todos os counts inteiros seguros. Preparar shape completo<=8KiB antes de publicar: app.version histórica muito longa recebe RESOURCE_LIMIT sem corte/reflexão parcial. No máximo cinco erros com taskIndex/field/code/subtaskIndex ou reminderIndex pertinentes e extraIssueCount, sem valor/título/URL/path nem mensagem de validator livre.

Prévia distingue versões, data pt-BR, contagens, substituição irreversível e dados não incluídos. Zero tarefas é arquivo válido que removerá todas as tarefas ativas, com aviso explícito. Botão de confirmar abre o modal; requisição só após confirmação humana. Se estado ficar stale/indisponível ou revisão divergir, bloquear confirmação e explicar necessidade de nova prévia. Mesmo sem detectar na UI, main confere na unidade.

### D5 — Plano final e transação única

Confirmação consome token próprio, passa expectativa global para read/decide/validate/commit e revalida ticket/contexto ao iniciar a unidade. Se base mudou, BACKUP_BASE_CHANGED, nenhuma escrita; devolver somente currentRevision segura. Mudanças em qualquer tarefa, trash ou claim interno avançam global e invalidam a base. Arquivo não é relido.

Plano final = tarefas preparadas após liquidação pura dos gatilhos<=clock lido uma vez na execução + **todas** as entradas de trash atuais intactas. Verificar portadora com recurrence em qualquer status e por coleção: no máximo uma por seriesId. Duplicidade entre importadas ou com trash recusa SERIES_CONFLICT; não expurgar, retirar regra, filtrar vencidas de trash ou confundir homônimos. Duplicidade preexistente exclusivamente em trash também bloqueia essa substituição integral, conservando leitura/dados; nenhum reparo automático.

IDs de tarefa únicos dentro do arquivo; ID compartilhado com trash é permitido e restore futuro mantém ID_EXISTS. Não gerar IDs/ocorrências/subtarefas nem invocar serviços normais de fechamento/create. Não preservar markers do estado substituído por merge: a autoridade é o arquivo; somente liquidação pura dos pendentes vencidos modifica processedFor. Conservar timestamps, status, âncoras/until/ordens e marks do arquivo. Nenhum scheduler ou remindersPending que simule agendamento.

Reutilizar replaceAllTasks e validação de codec4: inserir/alterar/remover só tasks num commit; conservar metadata de linhas idênticas e atribuir content/edit=g às novas/alteradas. Global avança uma vez se efetivo. Payload/timestamps históricos vêm do arquivo; revisões do arquivo/renderer não existem. Removidas não vão para trash. Se final é idêntico, UNCHANGED sem revisão/evento SQL, mas com barreira transitória D7. Validar/reservar plano e resposta antes da primeira escrita; erro depois de começar a aplicar lança rollback, não retorna recusa com efeitos parciais.

### D6 — Comparação completa e conclusão por fase

Expectativa é a projeção conhecida do plano liquidado. Comparar coleções por ID, exigindo conjuntos exatos e nenhum duplicado; manter ordem de tags/reminders/weekdays/subtasks. Comparação estrutural completa trata ausência distinta de null e inclui:
id/title/description/requester/assignee/status/priority/tags/dueAt/sourceUrl/createdAt/updatedAt/completedAt/seriesId;
recurrence frequency/parâmetros/anchorAt/until;
reminder id/type/offsetMinutes ou at/processedFor;
subtask id/title/done.
Metadata SQL é verificada separadamente (global/content/edit coerentes e trash inteira). Não usar ordem de rows SQL ou sameTask incompleto da origem.

Dentro da unidade, reler a projeção efetivamente gravada e comparar antes de COMMIT; mismatch lança falha de verificação e rollback. Acrescentar ao coordenador uma conclusão **síncrona, somente leitura/in-memory**, que recebe outcome e acesso limitado ao estado confirmado após commit/rollback e **antes de publicação/próxima entrada**. Nunca reenfileirar unidade dentro dela, aguardar filesystem ou escrever SQL no callback. Sucesso APPLIED/UNCHANGED aciona barreira D7 nessa fase mesmo se a resposta/sessão se perder depois. Uma Promise.then externa não garante essa ordem.

Releitura após commit ocorre na conclusão serializada; deve comparar com a expectativa e revision, antes de outro produtor. Mismatch/leitura falha depois de commit confirmado não pode ser rollback: resultado ok com verification:PENDING, conservar commit, marcar estado stale/bloqueado e exigir reopen validado. Falha técnica na própria conclusão também não reverte commit; executar contenção transitória, invalidar ofertas antes de nova admissão e registrar apenas código seguro. Se não é possível garantir barreira, bloquear admissão até reconciliação/reinício.

| Fase/outcome | Resultado público / conduta |
| --- | --- |
| Cancelamento de seleção | status:cancelled, sem efeito |
| Validação/token/base/recurso/rollback confirmado | status:error + código + commitState:NOT_APPLIED |
| Commit confirmado APPLIED ou no-op completo | status:ok + outcome + revision + restoredCount + verification:VERIFIED/PENDING + undoEpoch |
| COMMIT ou rollback incerto | status:error + STORAGE_UNAVAILABLE + commitState:UNKNOWN; conexão bloqueada/reopen |
| Resposta perdida após possível efeito | UI informa resultado não confirmado, ressync e nova decisão; nenhum replay |

Após reopen por resultado incerto, aplicar **barreira conservadora de recuperação de estado** (nova época e ofertas limpas) antes de retomar ações, sem classificar a importação como sucesso nem atribuir revisão falsa. Falha com rollback confirmado/cancelamento não usa essa barreira nem invalida outras sessões. Token consumido nunca é reconstruído a partir do banco.

Provas de reopen no pacote verificam conteúdo completo e metadata; kill antes/durante/depois do commit encontra antigo/novo integral. Kill/rename não comprovam falha de energia. Fluxo normal permanece bloqueado por schema/payload futuro/corrupção; não importar para um banco que não abriu nem trocar seu arquivo para forçar recuperação.

### D7 — Época pública e integração do desfazer

Usar epoch já existente no UndoRegistry, inteiro positivo seguro1..MAX_SAFE_INTEGER; acrescentar guarda de overflow/reserva da próxima época **antes de efeito**. Epoch é transitória do processo, sem SQL, Task, backup ou logs; reinício cria novas sessões e nenhuma oferta velha sobrevive.

Conclusão serializada de restore APPLIED/UNCHANGED chama invalidateAll(), consome nova época e invalida preparações/confirm tokens/candidatos de backup anteriores das demais sessões. Própria preparação já está consumida. Recibos/confirm/candidatos antigos de undo não publicam. Epoch deve ser capturada na mesma conclusão que publica oferta elegível e no seu ack, não relida depois de outro backup.

Estado v3 carrega undoEpoch em snapshot/página e eventos de alteração; cursor pertence ao par (revision,undoEpoch), com SNAPSHOT_STALE se um deles mudar. Evento fechado undo-invalidated:v1 {version:1,subscriptionId,undoEpoch,reason:BACKUP_RESTORED|STORAGE_RECOVERED} usa a mesma inscrição e callback local de subscribeState, sem wrapper/listener de produto adicional. Evento não contém revision nova nem dados/paths; estado alterado usa seu evento v3 normal. No-op somente emite a invalidação transitória.

Cliente registra/bufferiza os dois tipos antes do handshake; coalesce maior revision e maior epoch separadamente. Snapshot de revisão SQL igual mas época maior atualiza barreira. Reconciliação no foco/até30s recupera evento de época perdido, incluindo último evento sem commit seguinte. Nova época remove imediatamente oferta/confirm antigo e cerca pendências da UI; não desfaz filtros/draft arbitrariamente.

Acks que podem trazer oferta passam a updateTask/changeTaskStatus v4 e moveTaskToTrash v2 com undoEpoch obrigatório, inclusive no-op/move não retida. Oferta só aparece quando contexto é atual, snapshot completo>=ack.revision e ack.undoEpoch===epoch conhecida. Ack com época antiga nunca recria oferta; época maior exige reconciliação antes de ofertar. Clear/contextSequence continuam v1; create/check v3 e demais wrappers v1 não ofertam e preservam versões. Nenhum outro resultado passa a ofertar undo.

Alternativas: evento por SQL deixa UNCHANGED invisível; só esconder botão permite ack antigo; limpar recibo sem epoch não basta para output/cliente; versionar todas as mutações ampliaria alteração sem necessidade. Evolução por operações elegíveis é suficiente, com versões anteriores recusadas e pacote coerente.

### D8 — Catálogo, schemas e segurança

**21 wrappers:** verifyFoundation; getStateSnapshot/subscribeState/unsubscribeState; createTask/updateTask/changeTaskStatus/setSubtaskDone/openTaskSource; clearUndoOffer/prepareTrashConfirmation/moveTaskToTrash/restoreTrashItem/deleteTrashItem/emptyTrash/prepareTrashView/undoLastTaskAction; exportBackup/prepareBackupRestore/confirmBackupRestore/cancelBackupRestore.

Estado/paginação/subscription v3; diagnóstico/origem1, create/check3, update/status4, move2, sete outros de contexto/trash/undo1; backup1. Recusar estado1/2, update/status1/2/3 e move1; não manter aliases de canais antigos. Main/preload/renderer migram juntos. Shapes existentes de intenção permanecem; epoch só acrescentada aos resultados elegíveis.

| Wrapper backup v1 | Request exato além de version:1 | Resultado específico |
| --- | --- | --- |
| exportBackup | contextSequence | cancelled; ou ok: outcome:SAVED/SAVED_WITH_WARNING, taskCount, revision; ou error:code |
| prepareBackupRestore | contextSequence | cancelled; ou ok:resumo D4; ou error:code + issues? + extraIssueCount? |
| confirmBackupRestore | contextSequence,restoreToken | tabela D6 (revision/restoredCount/outcome/verification/undoEpoch no ok) |
| cancelBackupRestore | contextSequence,restoreToken | ok:cancelled:true; ou error:code |

Cancelar token próprio já consumido/expirado é idempotente, mas alheio inválido retorna BACKUP_PREVIEW_INVALID sem tocar outra preparação. Nenhum request aceita path, JSON, File/bytes, Task, sessionId, appVersion, clock, predicate ou opções de diálogo. Erros pertencem à operação; confirm não recebe erro de arquivo posterior à prévia.

Requests backup64KiB, respostas8KiB; estado/diagnóstico/eventos1KiB, páginas256KiB, fila64/8por sessão, espera2s, lock100ms, oito documentos, cursor30s e reconciliação30s permanecem. Prévia não usa IPC para 20MiB. Resposta curta reservada antes do efeito; campo extra/versão/DTO malformado recusa antes de acessar storage/arquivo/token. Preload valida entrada/saída e fecha a superfície.

Novos códigos fechados: FILE_TOO_LARGE, FILE_READ_FAILED, INVALID_ENCODING, INVALID_JSON, NOT_TASKFLOW_BACKUP, INVALID_FORMAT_VERSION, NEWER_FORMAT_VERSION, INVALID_STRUCTURE, INVALID_TASKS, LOCAL_DATA_NOT_EXPORTABLE, FILE_WRITE_FAILED, DESTINATION_CHANGED, DESTINATION_NOT_ALLOWED, BACKUP_PREVIEW_INVALID, BACKUP_PREVIEW_EXPIRED, BACKUP_BASE_CHANGED, BACKUP_VERIFICATION_FAILED (rollback pré-commit). Reutilizar state errors/STALE_CONTEXT/SERIES_CONFLICT pertinentes. CommitState só em confirm; falha antes do commit NOT_APPLIED, incerto UNKNOWN. PENDING é sucesso durável com aviso, não código de rollback. Issues têm field/código finitos e índices, sem textos arbitrários.

Auth webContents/mainframe/ticket/URL/origem/contexto em admissão, execução, fronteiras de dialog/I/O e saída. Validação antecede acesso, consulta/consumo de token e abertura de arquivo. Recheck imediatamente antes de efeito não desfaz um efeito autorizado já iniciado. Resposta tardia não vai ao documento novo. Hooks/hashes/faults do harness ficam fora da bridge normal.

### D9 — UI, consentimento e documentação

Uma área Backup na janela principal, acessível pelo header e vazio, com Voltar, Exportar tarefas e Selecionar backup. Reaproveitar componentes/CSS/labels úteis da origem, sem redesign; adaptar textos "atualize a extensão" para "atualize o app". Loading/rejected/preview/restoring/exporting/success/stale/blocked distinguem fase; cancels não são erros.

Entrada na área limpa oferta própria; Voltar/cancelar prévia libera preparação e conserva filtros/ordem. Exportar da prévia mantém sua base/token/TTL como subação D3. Confirmar modal irreversível não tem undo; Escape/abandono retorna foco ao botão pertinente sem consumir preparação. Arquivo vazio explica remoção de todas as tarefas ativas. Substituição não transporta lixeira, credenciais/configuração ou desfazer; trash atual permanece e pode impedir portadora duplicada.

Busy usa aria-disabled e handlers que impedem dupla ação mantendo foco, inclusive enquanto diálogo nativo está aberto. Título da área recebe foco na entrada, seleção cancelada retorna ao seletor, rejeição/confirmação stale foca alerta, sucesso foca anúncio/Voltar; voltar à lista usa Nova tarefa/Criar primeira/Limpar filtros conforme estado, nunca body. Mudanças externas não apagam draft de outra área, mas invalidam confirmação/oferta pertinente. Filtros podem esconder importadas: contagem da prévia e resultado não depende de filtros.

Manual: exportar pela extensão inalterada, guardar original, exportar dados atuais do app opcionalmente, selecionar/validar/revisar/confirmar e conferir tarefas no app. Reimportação manual é outra substituição consentida, não rollback automático. JSON sem criptografia pode conter dados pessoais das próprias tarefas; não ler/exportar credenciais ou adicionar configurações de provedor, não logar conteúdo/path/títulos/tokens.

Documentação operacional, arquitetura, catálogo, guia de migração e matriz de paridade só junto da implementação; README factual após archive autorizado conforme AGENTS38. Estado/datas/próximos passos pertencem ao roadmap.

### D10 — Verificações, métricas e rastreabilidade

B01–B14 tornam-se cenários em sete deltas e tasks:
| IDs | Capability / grupos |
| --- | --- |
| B01,B02,B04,B10 | backup: formato/projeção/fidelidade; tarefas1,2,4 |
| B03,B12 | backup: arquivo/encoding/limites/salvamento; tarefas2,3,7 |
| B05,B06 | backup,IPC,management: consentimento/base/tokens; tarefas4,6,7 |
| B07,B08,B11 | backup,persistence,recurrence: unidade/plano/falhas; tarefas4,7 |
| B09 | undo,IPC,foundation: barreira/época/late ack; tarefas5,7 |
| B13 | IPC,backup: catálogo/guards/recursos/produto; tarefas2,5,7 |
| B14 | management,foundation,backup: foco/doc/gates; tarefas6,8 |

Copiar/revisar fixtures1–4 e testes portáveis; substituir mocks Chrome por desktop. Negativas de fidelidade alteram/removem cada campo/parâmetro/lista, inclusive opcionais/markers/subtasks; teste só de quantidade não basta. Sentinelas fictícias no envelope/objetos aninhados e configurações/trash/metadata não entram no export. Tarefas normais continuam completas.

Ampliar harness/fault-points/crash-child existentes, perfil fictício, adapters reais de arquivo/SQLite/bridge21, duas superfícies, UNCHANGED/epoch perdida/late ack, preflight/reopen/token/resource. Seleção determinística de arquivo no harness pode substituir somente o diálogo, jamais o service/I/O, e é evidência distinta de **diálogo nativo real Windows** com teclado/cancel/overwrite. Registrar roteiro/evidência manual no pacote para este último; não chamar stub de prova nativa.

Gates no apply: npm run validate, OpenSpec estrito, package:win --publish never, verify:package e smoke:packaged sem Setup. Medir parse/projeção/export/import/readback inteiro com arquivos no teto, ASCII/Unicode/escaping/muitos nós/trashed portadora e oito preparações. Registrar charge/heap/RSS/pico/latência/maior bloqueio/heartbeat/cleanup. Não prometer interromper commit por timeout, dividir commits, truncar, virtualizar ou introduzir worker.

Orçamentos existentes de referência (página/mutação p95<=100ms/preflight<=5s, UI2s/5s, filtro/ordem500ms/heartbeat250ms) não são relaxados; registrar também duração integral da operação em lote, que não equivale ao benchmark de mutação pontual. Falha material nova exige revisão da abordagem antes de concluir, sem inventar um PASS por ter obtido arquivo ou commit. D10 herdado688,3/760,5/141,7ms, números700/700/250 não aprovados, acessibilidade humana e campanha de before-images extremas permanecem separados; não resolvê-los nesta Change por conveniência.

## Risks / Trade-offs

- [Arquivo compatível excede recursos/20MiB] → recusa explícita integral, dados intactos; teto não muda codec; ampliar só com revisão e provas.
- [Histórico do codec não cabe no backup estrito] → erro seguro de exportação sem normalização/omissão; compatibilidade histórica limitada conscientemente.
- [Prévia usa base antiga ou arquivo trocado] → cópia imutável + globalCAS + token por documento/contexto/TTL.
- [Portadora na lixeira conflita] → validar estado final por coleção e recusar sem expurgo/retirada de regra.
- [COMMIT confirmado vira falso erro/undo ressuscita] → conclusão serializada, resultado por fase, epoch nos snapshots/eventos/acks elegíveis e ressync.
- [Memória de JSON adversarial/8preparações] → scanner/charge antes de parse/clone,128MiB globais, um job nativo e liberação medida.
- [Terceiro altera destino entre conferência/rename ou energia falha] → detectar alterações observáveis, ler/verificar resultado e documentar janela residual; sem promessa de CAS externo/durabilidade de energia.
- [Job nativo termina após fechamento] → tickets/cancelamento cooperativo/cleanup, sem enviar ao documento novo ou repetir efeito.
- [Prova fake dialog/CI confundida com Windows nativo] → separar execução real de adapter, stub de escolha e roteiro humano no pacote.
- [Banco inacessível impede importar] → manter preflight/arquivos intactos; recuperação própria fora do escopo.

## Migration Plan

1. Após aprovação e novo pedido de apply, implementar núcleo/adapters/contratos/clientes/UI/testes em conjunto; manter SQL2/codec4/backup4/runtime/lockfile. Não instalar dependências ou migrar perfis Chrome.
2. Estado v3 e acks elegíveis novos migram no mesmo pacote. Não oferecer compatibilidade de IPC entre processos/pacotes misturados; versões antigas recusadas. Epoch/preparações são transitórias e não migradas.
3. Dados antigos são lidos sem rewrite; importação só por consentimento explícito. Snapshot antigo pode ser exportado apenas se satisfaz contrato20MiB/validação/recursos; caso contrário nenhuma alteração.
4. Reverter código antes da implantação não muda dados. Após importação, downgrade SQL2 pode ler tarefas, mas não desfaz substituição nem restaura undo/lixeira ausentes do arquivo. Recuperação de conteúdo anterior exige backup próprio e nova importação consentida em versão compatível; sem rollback automático.
5. Completar tasks/gates/evidências, executar openspec-verify-change e gerar verification.md **nesta Change**. Aguardar aprovação explícita do relatório antes de archive/consolidação/README. Commit/push/PR/merge/distribuição e TFA-008 exigem autorização correspondente.

Nenhuma decisão material é delegada ao apply:20MiB,128MiB/64/262144,TTL5min,contratos/época,base global,verificação/fases e destino são escolhas concretas para revisão. Rótulos e localização de componentes podem ser ajustados sem mudar sentido/foco; resultado incompatível de benchmark ou descoberta que altere comportamento exige revisão coerente dos artefatos.

