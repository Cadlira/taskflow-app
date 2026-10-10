# Lembretes e ciclo de vida desktop

## Regras portáveis implementadas

Até dez lembretes podem usar deslocamento em minutos inteiros não negativos (OFFSET) ou
instante absoluto (AT). Os presets são 0, 15, 60 e 1440 minutos; outros valores válidos
também são aceitos. OFFSET subtrai uma duração exata, inclusive ao atravessar mudança de
fuso/DST; não subtrai dias civis. Todos exigem prazo, instantes distintos e representáveis;
AT não pode ultrapassar o prazo e é incompatível com recorrência.

Criação aceita configurações sem identidade. O proprietário gera IDs com no máximo três
tentativas por item. Edição só aceita IDs atuais ou item novo sem ID. Omitir a coleção
conserva-a, `[]` remove-a; `null` não é intenção válida. IDs não são truncados. Configuração
nova/alterada com gatilho menor ou igual ao relógio de execução é recusada. Configuração
intacta conserva representação ISO, segundos/milissegundos e marker atual, mesmo quando
o claim aconteceu depois da base do formulário. Nenhum draft autoriza `processedFor`.

## Recuperação e liquidação são diferentes

A classificação desktop usa a tupla exata tarefa/lembrete/instante ISO e o relógio atual:

| Instante em relação ao gatilho ativo e pendente | Decisão |
| --- | --- |
| -1 ms | Futuro, permanece pendente |
| Igual | Elegível para uma tentativa após claim confirmado |
| +300.000 ms | Elegível, fronteira inclusiva |
| +300.001 ms | Consumo sem aviso |

Terminal vencida é consumida sem aviso; terminal futura não agenda. Ocorrência removida,
alterada ou processada é inaplicável. O desktop não usa a tolerância Chrome de 60 segundos
para identificar alarmes. Startup/reabertura/resume devem aplicar esta classificação;
não devem liquidar indiscriminadamente o backlog antes de examinar sua elegibilidade.

Uma mutação efetiva, restore, undo ou importação usa liquidação pura de gatilhos <=now,
inclusive terminais, sem replay pela janela de graça. Futuro permanece pendente. Um
no-op não gera revisão; toggle independente não se transforma em edição de lembrete.
Backup conserva autoridade do arquivo e nunca usa a graça para reproduzir avisos vencidos.

## Fronteira interna implementada

O processamento interno relê Task, status, reminder, tupla e relógio na unidade coordenada.
Claim e consumo expirado mudam somente revisão global; conservam revisão de conteúdo,
revisão de edição e `updatedAt`. A submissão é solicitada no callback síncrono
`afterReleased`, depois do retorno da unidade e de `onCompleted`, fora da transação e
antes da execução da próxima unidade. Não se permite SQL reentrante neste callback.

Antes de submeter, o adapter reconfere disponibilidade do storage, revisão confirmada,
epoch, estado de execução, reserva e clock na graça. Recuo para antes do gatilho ou avanço
além da graça suprime o efeito, conservando o marker consumido. Rollback/incerto não
autoriza efeito; reabertura validada usa o marker realmente encontrado. Falha externa
depois de commit não é rollback e não causa retry. Crash depois do claim pode perder
aviso. Há no máximo uma tentativa sobre a pendência do estado corrente, sem garantia
visual, histórico global ou transação SQLite+Windows. Substituição explícita por backup
futuro pode redefinir pendência. Remoção de aviso já submetido é somente melhor esforço.

## Estado de composição

A composição inclui agenda, notifier, lifecycle, bandeja, ativação e inicialização
opcional. Os guards provisórios de prazo/status com reminders foram retirados, mantendo
validações, CAS e liquidação. Dev/test usam notifier FAKE; produção exige identidade
instalada e suporte nativo validado antes de consumir para submissão. Uma falha de
identidade deixa lembretes indisponíveis. A campanha instalada local (2026-10-06) está
registrada abaixo e na [verificação aprovada](../openspec/changes/archive/2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop/verification.md), com escopo de usuário único
(segunda conta/Unicode waivados; logoff real não executado — representado por mensagem de
sessão); testes, mocks e build continuam não comprovando o que não foi observado.

O serviço de agenda interno já possui heap removível por tarefa, índice de tags e agenda
única, sem tombstones acumulados ou uma Promise por ocorrência. Rebuild lê páginas de
128 tarefas pelo coordenador, cede entre páginas/fatias e relê o journal antes de publicar.
Três resets/churn impedindo convergência resultam em BUSY; erro/recurso não publica índice
parcial. Charge lógico máximo de 64 MiB inclui a projeção e o journal. A projeção antiga é
solta antes da nova montagem. Fallback de 60 s corrige invalidações perdidas e clock;
timeout distante não vira atraso de 1 ms. No máximo uma unidade interna fica em voo.

Até 16 reservas são obtidas antes do claim elegível. Capacidade cheia conserva pendência
e reavalia em até 1 s. Callback ou deadline de 10 s libera a tentativa sem retry. Cancelar
o handle disponível após mudança é melhor esforço; liberar referências num deadline
não prova que o Windows terminou seu trabalho nem que o aviso foi exibido.

Medição inicial no Node 24.21.0/SQLite 3.53.4, Intel i5-13420H, fixtures UUIDs/10 OFFSET:
1.000 tarefas: rebuild 107,6 ms, SQL p95 15,2 ms, charge 5.760.000 bytes;
10.000 tarefas: rebuild 629,9 ms, SQL p95 6,94 ms, charge 57.600.000 bytes,
RSS 272.089.088 bytes. É prova inicial do núcleo/SQLite, não benchmark do Electron
empacotado, CPU ociosa de 60 s ou campanha instalada. M12 completo continua pendente.

## Evidências iniciais

`tests/domain/reminder-draft.test.ts` cobre presets, limites, parâmetros, identidades,
precisão, configuração intacta e quatro fronteiras. `tests/main/reminder-processing.test.ts`
usa SQLite real temporário para revisões, disputa, reentrância, clock pós-claim, estado
suspenso, capacidade e falhas de commit/rollback/conclusão/submissão.
`tests/main/reminder-mutation-matrix.test.ts` cruza mutações/mutações de série/lixeira/undo/
backup com a agenda real: liquidação sem aviso retroativo, reset de backup sem replay,
lixeira interrompendo claim, cópia sem marker e coleção vazia sem timer órfão. Esses testes
não abrem perfil real ou registram identidade Windows.

## Janela, energia e controle

Com tray válido, X/Alt+F4 oculta a janela e retira a admissão de produto. Draft, filtros e
base Vue ficam em memória; ofertas de undo, confirmações, prévias e respostas da sessão
antiga são invalidadas. Minimizar conserva a sessão. Abrir admite outra sessão e obtém
snapshot atual sem trocar automaticamente a base do draft. Sair encerra o serviço e drena
a conexão; não há avisos com o processo encerrado. Sem tray válido a janela não fica
oculta sem saída: o fechamento encerra e a falha conhecida recupera a janela. Crash do
renderer pode perder seu draft em memória. Suspend retira a admissão e pausa claims ainda
não iniciados; resume reconstrói a projeção e aplica a graça inclusiva, inclusive oculto.
Logoff/desligamento não garantem tempo para concluir uma escrita nem entrega visual.

O controle desktop tem status/inscrição/eventos v2 por role; startup/saída/resolução seguem v1. Controle oculto pode
receber eventos e ler estado; não readmite produto, não define clock nem fornece caminho.
Create v4 e update v5 transportam apenas intenção de reminders; status v4/check v3,
state v3, move v2 e backup v1 conservam seus contratos. Na TFA-009 o catálogo congelado é manager35/Quick Add14;
veja [contratos de captura/atalhos](capture-shortcuts-ipc.md) e [política das duas janelas](quick-add-and-shortcuts.md). Ativação valida somente tag SHA25664, relê marker corrente e devolve revisão
global/ordinal na ordem SQL. A consulta temporária conserva formulário e filtros; uma
referência removida/alterada fica indisponível. Relay COM usa lock, deadline 10 s e nenhum
storage enquanto não for dono; esta rota ainda exige prova instalada, inclusive corrida.

## Ativação, relay e retorno à lista

O handler de ativação é único (`Notification.handleActivation` para COM estruturado/cold start,
e o evento in-process `click` de cada notificação alimentando a mesma rota com coalescimento
de 2 s — no Electron 44.5.1/Windows o clique com o app aberto não passa pelo COM), sem
navegação dupla. O payload aceito é somente `type=click&tag=<64hex>` (ordem livre, sem
duplicatas, extras, action/reply/userInputs). A tag SHA25664 da tupla canônica é relida do
estado persistido, inclusive ocorrências processadas; referência removida/alterada fica
indisponível e colisão ambígua é recusada, sem recriar tarefa.

**Cold start COM:** `-Embedding` é apenas modo de lançamento (nenhum payload de tarefa em
argv). O owner abre a janela oculta e espera callback validado ou deadline de 10 s antes de
compor storage/índice; sem callback, o gerenciamento abre com aviso seguro, sem inventar
tarefa. **Relay transitório:** segundo processo COM sem lock não abre banco/janela/scheduler,
valida a identidade instalada, registra o handler e espera no máximo 10 s; callback validado
com `{version:1,kind:'reminder-activation',tag}` dispara novo `requestSingleInstanceLock` —
se o owner vive, o Electron encaminha e o relay sai; se o lock é adquirido, só então o relay
compõe storage e resolve. Coalescimento de 2 s mantém uma intenção pendente; não há socket,
inbox, arquivo ou comando de tarefa pelo relay.

**Localizar/retorno:** a consulta usa a revisão global e o ordinal canônico (SQL/paginação);
o cliente tenta convergir até três vezes e informa BUSY/stale sem selecionar alvo errado.
Alvo fora dos filtros aparece em destaque temporário com “Voltar à lista”, preservando
filtros/ordem/contagens; draft de outra tarefa permanece no formulário e o alvo surge em
cartão de consulta com foco. Referência sumida mostra mensagem focável.

**Distinção de evidência:** testes de contrato/main cobrem parse/coalescimento/ordinal; o
harness cobre close/quit/lembretes no pacote. Na campanha instalada local (2026-10-06) o
relay `-Embedding` com owner vivo saiu pelo deadline de 10 s sem residual, um toast real
foi publicado no Windows (histórico do AUMID `taskflow.app`) e o **clique→localizar foi
provado** na revisão final (atualização 4 da verificação arquivada; a rota in-process foi
corrigida e o clique abriu a consulta com foco). O logoff/login real não foi executado
(semântica representada por mensagem de sessão) e a segunda conta/Unicode por conta foram
waivados — mock, build e harness **não** comprovam o que não foi observado.

**Atualização TFA-012 (2026-10-10, candidato C instalado):** startup opt-in/out observado
com **readback exato** do registro (`taskflow.app.startup.v1="…\TaskFlowApp.exe"
--taskflow-login`; OFF remove; reinstall começa OFF); lembrete real com OFFSET 0 consumiu o
gatilho com **marker `processedFor` exato** (uma tentativa); close ocultou para a bandeja e
Sair encerrou sem residual. Permanecem **NOT_RUN**: exibição/clique visual do toast (gesto
humano) e suspensão/offline reais (sem autorização específica). Detalhes em
[desktop-homologation-results.md](desktop-homologation-results.md).

### Campanha instalada local — 2026-10-06 (autorizada: Setup/desinstalação, sem logoff/segunda conta)

Executada sobre o pacote da Change, em upgrade de instalação pré-existente:

- **Upgrade** (Setup one-click `/S`) preservou dados/produto e a entrada de desinstalação;
  primeiro launch prod passou a preparar identidade (AUMID/CLSID próprios no atalho e
  `LocalServer32`), com `reminderCapability: NATIVE`.
- **Startup opt-in/out** pelo wrapper no app instalado: ON grava o Run próprio exato; OFF
  remove Run e `StartupApproved`; estado externamente desabilitado é respeitado e o opt-out
  limpa o valor; reinstalação começa OFF; `--taskflow-login`/logoff humano ficam pendentes.
- **Lembrete real**: tarefa com prazo +30 s e OFFSET 0 → marker exato no gatilho e
  notificação publicada no histórico do Windows; DND/exibição visual e clique ficam para
  confirmação humana.
- **Relay COM**: processo `-Embedding` encerrou em ~11 s sem residual nem janela.
- **Uninstall** removeu binários/atalho/metadados/CLSID/Run próprios e preservou o banco;
  **reinstalação** preservou dados e iniciou OFF.
- **Três defeitos reais encontrados e corrigidos** (unit + reempacotado + reinstalado):
  1) atalho NSIS expõe `toastActivatorClsid` como string vazia e o guard tratava como
     estrangeiro (identidade nunca preparava em instalação real);
  2) `setLoginItemSettings` no Windows usa `openAtLogin` (`enabled` é macOS-only) — o Run
     nunca era gravado;
  3) `launchItems` do Electron 44.5.1 não reporta `args` no Windows — a leitura passou a
     confirmar nome+args pelo Run canônico do adapter e usar o launchItem só para o estado
     habilitado.
- **Residual registrado:** falha transitória do adapter no primeiro launch pós-install
  (scan do exe novo) deixa a sessão sem capacidade nativa até reabrir — sem retry; mitigação
  candidata é retomar a preparação no foco (não implementada; requer revisão de design).

### Roteiro humano pendente (close/minimize/quit/energia)
Não executado nesta sessão; exige ambiente Windows pertinente e não é substituído por
testes/mocks (roteiro completo de acessibilidade/zoom/leitor de tela em
[a11y-manual-checklist-tfa008.md](a11y-manual-checklist-tfa008.md)):

1. Com tray válido, X/Alt+F4 oculta sem encerrar; reabrir por **Abrir** restaura janela e
   draft/filtros; ofertas de desfazer e confirmações antigas não ressuscitam.
2. Minimizar e perder foco não retiram sessão nem limpam transientes.
3. **Sair** encerra de forma idempotente; reabrir não recupera draft/desfazer.
4. Suspender/retomar o Windows (ou equivalente autorizado) recompõe a projeção e aplica a
   graça inclusiva; logoff/desligamento pode interromper escrita/aviso, sem garantia.
5. Remover/derrubar a tray recupera a janela ou leva a saída segura, sem processo invisível.

## Identidade e inicialização opcional

Produção empacotada valida metadata NSIS v1, alvo e propriedade do atalho/AUMID/CLSID
antes de preparar o presenter. Paths resolvidos, reparse points, família futura e COM
estrangeiro recusam preparação. O adapter usa PowerShell do Windows com operações fixas,
saída UTF-8 limitada a 8 KiB e deadline de 5 s. Não instala módulo, helper ou serviço.
O ícone existente é recurso do pacote. Bootstrap Notification não chama show.
Windows pode suprimir/retardar toasts (Assistente de Foco/DND, notificações desativadas,
política do ambiente): `isSupported`/show comprovam capacidade/solicitação, não exibição,
e a falha vira código fechado, sem falso delivery.

Inicialização com o usuário começa OFF por ausência de Run próprio. Só opt-in explícito
instalado escreve; registro do SO é a única fonte durável. Desativação externa é exibida
sem reativação automática. Setter reconfere identidade/sessão, tem gate e readback; falha
parcial fica UNKNOWN/erro, sem compensação ou retry automático. Login usa argumento fixo
e abre oculto somente com tray válido; abertura manual fica visível. Foco e intervalo de
60 s reconsultam sem escrita. Upgrade preserva estado; uninstall trata somente recursos
cuja propriedade foi confirmada e preserva dados. Upgrade/uninstall e startup opt-in/out
foram comprovados na campanha instalada de 2026-10-06 (single-user); **conta realmente
padrão/VM** e **segunda conta/Unicode por conta** permanecem dispensados por decisão
humana (sem PASS), e o logoff/login real não foi executado — não inferir essas parcelas
das provas existentes.

## Gates de 2026-10-06

Node 24.21.0 e npm 11.21.0. `npm run validate` passou com lint, cinco typechecks, suíte
funcional de 73 arquivos (933 aprovados + 11 ignorados) e build. Os 11 ignorados são
variantes condicionais de fuso (`runIf` em `task-recurrence-tz`/`date-time-tz`), não
supressão de cobertura. A medição M12 roda em configuração dedicada (`npm run
test:volume`), agora parte do `validate`, para manter a carga estável exigida pelo
orçamento D11; executá-la dentro da suíte paralela já produziu p95 falso acima de 100 ms
(177,6 ms) contra 8,5–14,5 ms com a máquina estável. Os limites do teste não mudaram.

Medições do núcleo (Node 24.21.0/SQLite 3.53.4, i5-13420H, fixtures UUID/10 OFFSET):
1.000 tarefas: rebuild 92,5 ms, SQL p95 13,7 ms, charge 5.760.000 bytes;
10.000 tarefas: rebuild 787,9 ms, SQL p95 13,6 ms, charge 57.600.000 bytes. É prova do
núcleo/SQLite, não benchmark do Electron empacotado, CPU ociosa de 60 s ou campanha
instalada; M12 completo continua pendente.

Pacote fresco (`package:win --publish never`) validado por `verify:package` (allowlist,
ícone de runtime idêntico, manifestos asInvoker): Setup `55f4f27f…`, exe `3878da05…`,
ASAR `173bfec3…`. `smoke:packaged --skip-bench` passou no pacote (perfil fictício, ACE aprovada
só na cópia): close/quit reais com tray (close oculta; Sair encerra; WM_CLOSE não encerra),
migração SQL1→2 com revisão exata sob kill, bridge 27 verificações, crash/drain,
UI real de tarefas/recorrência/lixeira/backup, recuperação/claim de lembretes no startup
(graça/expiração/terminal/futuro, at-most-once, corrida claim×mutação com CAS e duas
superfícies) e negativas. Bench de limites e UI 1.000/10.000 (D10) foram pulados **nesta
rodada**; o smoke **integral** rodou depois no build final da mesma Change, com o orçamento
D10 revisado (atualização 4 da verificação arquivada); `--skip-bench` não equivale ao gate
completo e `--ci-runner` não foi usado. Nos cenários explícitos de harness o scheduler é suspenso (probes de
revisão/digest determinísticas), exceto no `reminders`, e cada cenário encerra por Sair.

A validação OpenSpec estrita passou para a Change, 12 itens de --all e sete archives.
Este bloco registra os gates daquela rodada de 2026-10-06; a campanha instalada e o smoke
integral posteriores estão na verificação arquivada. Nada aqui relaxa os gates
D10/a11y/energia nem comprova o que não foi observado no Windows real.
