# Evidências intermediárias — TFA-011

## W04 — matriz negativa do par e achados — 2026-10-08

Setup B, app fechado, conta atual; casos com `/S`; binários/dados comparados antes/
depois (pair-negatives.log e reexecuções). Estado após cada caso: registro0.2.1,
exe134ffcd2…, dados intactos.

Refusões exit100 sem mudança de binários/dados: `/allusers`; `/allusers`
+`/currentuser`; `/currentuser` duplicado exato; `/allusers=bad`; `/D` externo;
`/D` duplicado; `/D` vazio; `/D` relativo; `--delete-app-data`; `--force-run`.
Reexecuções com invocação corrigida (argumento único): `/D` externo/duplicado/vazio/
relativo → exit100; **`/D` canônico equivalente → exit0/44s** (reparo permitido sob
a mesma política, sem elevação), conforme o cenário "Override equivalente ao
permitido".

Achados registrados:
1. **Artefato de harness, não defeito do produto:** `Start-Process -ArgumentList
   @('/S','/D=...')` insere espaço após `/D=` na linha de comando (comprovado por
   fixture NSIS própria lendo `GetCommandLineW`: recebida `/D= C:\...`), o NSIS
   ignora o `/D` e o guard extrai valor com espaço → recusa. A invocação correta é
   argumento único `/S /D=<destino>`; fixture e Setup real aceitaram. Nenhum modo
   inseguro observado; a negativa anterior do `/D` canônico fica explicada.
2. **Achado real pendente de decisão:** `/S /currentuser=bad` é aceito e executa
   manutenção (exit0/41s, reparo canônico, sem elevação) — o parser conta a
   substring `/currentuser` sem conferir o limite do token. O protocolo W04 lista
   `/currentuser` malformado como negativo que deve recusar; guard ausente.
   Tasks2.1/7.2 permanecem abertas até correção ou dispensa humana explícita.

## Par 0.2.1 (B) — pacote e manutenção 0.2.0→0.2.1 — 2026-10-08

Commit B `1152e1b7b6f021b1dc619319dde75f0c66863c09` (bump0.2.1 + pin do predecessor;
fonte limpa, source sha256 aeedf4671744b88d346cac8a4d9e969a25cf6abd350923a1d9428d21c72c19b7).
Build selado B: `0.2.1-win-x64-1152e1b7b6f021b1dc619319dde75f0c66863c09-pair-021`;
Setup SHA-256 144d413bed9508499c423859ad779468a5e30f8a6e57e130e4faf71d468e70c7,
153.440.458 bytes; exe 134ffcd2…; ASAR 949fca08…; Reader 893151d6… (idêntico ao
uninstaller instalado). Validate do commit: 108 arquivos/1.411 testes+11 skipped/
volume2/lint/cinco tipos/build exit0 (pair-validate-b.log); verify:package OK e
smoke42PASS/0FAIL (pair021-*). Predecessor0.2.0 fixado em trusted-predecessors.nsh
pelo hash f4e13085… conferido na instalação A.

Upgrade real/silencioso 0.2.0→0.2.1 na conta atual (app fechado): exit0/48,05s;
registro0.2.1; atalho conservado; uninstaller instalado igual ao Reader do B; dados
193 arquivos intactos byte a byte e ACLs de pai/dados intactas (pair-upgrade-b.log).
Reparo da mesma versão0.2.1/silencioso: exit0/55,80s; registro/atalho conservados;
dados/ACLs intactos; Reader instalado igual ao candidato (pair-repair-b.log). Sem
kill, sem elevação e sem transição legada. O Reader do B difere do A: sem o pin o
guard recusaria; o upgrade exit0 comprova o caminho `prior` fixado.

Bundle/retenção (task6.3): seleção exata selada nos dois stages (selection.json,
arquivos centrais e inventário completo conferidos por verify:package); nenhuma
mudança de fonte depois dos hashes (árvore limpa nos commits A/B e após os builds);
stages preservados localmente em `release/candidates` (ignorado), sem upload (R7);
reconstrução futura pode divergir em timestamps/metadados do Setup, sem promessa
byte a byte. OpenSpec estrito da Change/--all19/19/--archived10/10 e git diff
--check PASS. Tasks6.1/6.2/6.3 concluídas com estas evidências.

## Par 0.2.0 (A) — uninstall do estado anterior, instalação e pacote — 2026-10-08

Build selado A: build-id
`0.2.0-win-x64-5a11c6f29670e702e95d9ab1f64e89feed84d15d-pair-020b` (commit5a11c6f…,
fonte limpa, source sha256 82816930993befa4beb747ccf293d22cec96fc328517c728d3276dd5636de64c,
readiness PENDING_INSTALLED_CAMPAIGN). Setup SHA-256
c7d22b05ed8dcdfe21c9920c0db65abbfc8d9fc65947a8584901dfd2ed5ad3ac,
153.440.379 bytes; exe febcdd3a…; ASAR a585d0d9…; Reader f4e13085… (estável desde15;
igual ao uninstaller instalado). Validate do commit: lint/cinco tipos/108 arquivos/
1.411 testes+11 skipped/volume2/build exit0 (pair-validate.log). package/verify/smoke:
`verify:package OK` e smoke42PASS/0FAIL (pair020b-package/verify/smoke.logs).
O primeiro package (run pair-020) falhou por `Toolchain divergente` porque o ambiente
do host exporta `npm_config_user_agent` estaleiro (npm/undefined node/v26.3.0);
corrigido com `unset npm_config_user_agent` antes dos scripts npm. O stage pair-020
não selado permanece preservado como histórico; não foi apagado.

Uninstall do estado anterior (binários0.2.0 + registro estaleiro0.1.0): remoção
própria com uninstaller conferido igual ao Reader (f4e13085…), launcher0 e conclusão
efetiva verificada; dados193 arquivos intactos byte a byte, ACLs de pai e dados
intactas, atalho e registro removidos (pair-uninstall25.log).

Instalação limpa normal (sem `/S`) do A na conta atual: exit0/21,97s; registro0.2.0,
InstallLocation canônico, atalho criado; uninstaller instalado igual ao Reader;
dados/ACLs intactos; payload instalado conferido contra o manifesto
(`verify:package --installed-root OK`, pair020b-verify-installed.log). ACL do root
com AppContainer `S-1-15-2-1:(OI)(CI)(RX)` (SDDL `(A;OICI;0x1200a9;;;AC)`) e
pai/dados sem essa ACE. A instalação limpa registrou0.2.0, resolvendo a divergência
anterior como estado estaleiro (registro removido no uninstall). Task6.1 atendida
para o A; task6.2 aguarda a preparação do B.

## R4 — registro de escopo e verificação (task1.3) — 2026-10-08

Autorização vigente: manutenção (Setup/upgrade/uninstall/reparo) somente na conta
atual; falhas simuladas restritas a fixtures/cópias fictícias no escopo dessas
operações, sem falha de energia real nem alteração de componentes globais/política.
Segunda conta excluída por decisão humana — não é PASS; isolamento entre contas
permanece não demonstrado. Logoff/login real e powercut não foram autorizados
especificamente e permanecem BLOCKED/dispensa humana específica.

Verificação por leitura em2026-10-08: Windows11HomeSingleLanguage,10.0.26200,x64;
token não elevado, grupo Administrators ausente (InAdministratorsGroup=False),
UAC EnableLUA=1 e zero processos TaskFlowApp; root binário per-user do projeto
(LocalAppData\Programs\TaskFlowApp) com exe/uninstaller presentes, raiz de dados
presente e sem reparse no root nem nos ancestrais verificados. SIDs/usuário completos
não são publicados. Não comprovados e portanto não PASS: ausência de Node/npm no
destino, ambiente offline e perfil com espaços/Unicode — subcasos W02/W15 permanecem
BLOCKED. Task1.3 concluída quanto ao registro; preview25 segue instalado, sem nova
operação de manutenção nesta atualização.

## Estado instalado descoberto antes da campanha do par — 2026-10-08

Antes do uninstall do preview25, a leitura do registro (views 64/32) mostra
`InstallLocation` correto e **`DisplayVersion`0.1.0**/"TaskFlow App 0.1.0", enquanto
os binários instalados conferem com o preview25 0.2.0: `TaskFlowApp.exe`
febcdd3a…, `app.asar` a585d0d9…, `Uninstall TaskFlowApp.exe` f4e13085… (igual ao
Reader do candidato) com FileVersion0.2.0; `NativeIdentity` sem versão preenchida.
O histórico anterior registrava registro0.2.0; a divergência atual não é explicada
por esta sessão e fica registrada para revisão. O uninstaller instalado confere
byte a byte com o `candidate-uninstaller` do par, permitindo a remoção própria
verificada; nenhuma transição legada nova é executada e nenhum dado é apagado.

## Decisão 4.2 e autorização do par — 2026-10-08 (continuação)

Usuário: **“1 - Aceita a limitação documentada”** e **“2 - autorizado”**.

- Task4.2 concluída: procedência dos seis plugins NSIS comprovada byte a byte contra
  os pacotes oficiais; termos publicados incorporados ao notice; a limitação do
  SpiderBanner (sem licença publicada) está explícita no recurso entregue, sem
  inferência de licença e sem remover integração/UI.
- Autorizados **commits do par limpo0.2.0→0.2.1** (dois commits/hashes distintos na
  branch), seguidos de `package:win`/`verify:package`/`smoke:packaged` dos dois lados
  e da campanha W01–W15 no escopo R4. A autorização **não** inclui
  push/PR/merge/archive/upload/distribuição/CI nem TFA-012. Preparação em andamento
  nesta continuação; resultados registrados abaixo quando executados.

## Plugins NSIS — procedência resolvida e termos incorporados (task4.2) — 2026-10-08

Consulta oficial sem bypass baixou os pacotes dos autores e comparou byte a byte as
DLLs x86-unicode efetivamente incorporadas: SpiderBanner996a259e… =
`SpiderBanner_plugin.zip` (zip45c79a02…); WinShell9be85b98… = `WinShell.zip`20121005
(zip34e111f8…); nsisunzc31b590c… = `NSISunzU.zip` de Gringoloco/base Saivert
(zip8c2b7ad6…). Termos: o nsisunz publica licença integral (texto e créditos agora
no notice, verificado idêntico ao readme oficial linha a linha); o WinShell declara
Freeware na página do autor, sem texto adicional; o SpiderBanner não publica texto
de licença em nenhuma fonte oficial consultada (wiki e pacote; fórum403, sem bypass).
`build/nsis/THIRD-PARTY-NOTICES.txt` atualizado (SHA-256
dc9ef68eee69aae1d40f8bf5673a8c268c29ceeea7beee57ca5815d4de00b128) com URLs,
hashes e a limitação explícita; o resource do pacote e o inventário/verify continuam
exigindo bytes iguais ao recurso revisado. O preview25 carrega o notice anterior
(9cdcdfa8…) e permanece histórico; o par final limpo deve ser construído após
autorização com o recurso atualizado. Task4.2 segue aberta somente para a decisão
humana sobre a limitação do SpiderBanner; nenhuma licença foi inferida e nenhuma
integração/UI foi removida. Verificações desta mudança: testes/tools 9 arquivos/77
testes PASS (inclui payload-inventory/proveniência/inspeção NSIS; logs plugins42-*.log),
eslint do script alterado PASS, OpenSpec estrito da Change/--all19/19/--archived10/10
PASS e git diff --check PASS. A mudança do recurso invalida apenas o bytes-equality
do preview25 contra a fonte atual; stages históricos não foram alterados ou resselados.

## Pacote25 — 2026-10-08

Validate25 PASS: lint, cinco typechecks, 108 arquivos/1.411 testes +11 skipped,
dois testes de volume e build. Package25 e verify:package PASS, build-id
0.2.0-win-x64-f91ce401c8648a8d0aa984975c72885f9c023ee6-nsis-preview-25.
Fonte dirty explícita, fingerprint
2fcf39566c7bf44dbd162603bb77380b741cbe125c1edf20ace55bdcc0c15899;
não é o par final limpo. App/ASAR conservam os hashes24; Setup SHA-256
b34e6daa5a4c3c368e893634bc9fe55baffc57e465d379ac06c4e32c7d2e19cb,
153.438.809 bytes; candidate-uninstaller conserva o Reader15/24
f4e13085c910d729f4f448bb8bfbf06cbdebdd4fb3d373dc2a1e7500e8c08d89.
Os três manifests PE foram verificados asInvoker/uiAccess=false.

Notices NSIS entregues em resources/NSIS-THIRD-PARTY-NOTICES.txt, bytes iguais
ao recurso revisado, SHA-256
9cdcdfa85b1d8310b78d853d047618481e64c9bf436934cbc8be005ef6c20797.
Inventário/verify exigem o recurso e sua igualdade; task4.2 permanece parcial
pelos termos/procedência externos ainda pendentes. Smoke completo25 PASS,
exit0/42 verificações, sem flags de redução dos gates. UI10.000: montagem4.054,25ms,
p95consultas949,05ms, subtarefas328,2ms, heartbeat920ms, dentro dos limites.
Reparo normal15→25 PASS parcial W09, na conta atual, /S e preflights; começou
2026-10-08T23:51:23.8549162Z, durou52s, exit0, registro0.2.0, binários presentes.
Comparação privada da árvore completa de dados: intacta; ACL dos dados e do pai
dos binários: intactas. Sem abertura de prod/seed sobre perfil existente.
Inspeção instalada25 PASS, exit0: payload/notices/ícones e manifests conferidos;
não é prova de upgrade entre versões distintas nem fecha as matrizes restantes.
Conta atual agora preview25; nenhuma operação ativa neste checkpoint de5% restante.
Logs locais ignorados: validate25.log, package25.log, verify25.log, smoke25.log,
repair25.log e installed25.log
em .tmp/tfa011-tests. Stages históricos não foram alterados/resselados.

## Decisão atual após esclarecimento — 2026-10-08

Usuário respondeu **“Sim, aprovo”** à recomendação de manter o instalador NSIS
simples, sem controlador PowerShell adicional, e documentar o retorno de erro da
desinstalação automática como limitação conhecida. IR3 aprovada nessa opção.
Proposal/design/spec/tasks/protocolo/guia alinhados; não foi acrescentado código
ou comando registrado novo. Guardas/retenção/ownership permanecem; Setup e
predecessor executado de cópia verificada com _?= propagam não zero. O launcher
normal não oferece contrato de automação por exit code. A aceitação exige observar
resultado efetivo e demais provas, sem converter a exceção em PASS. Conta atual
continua preview15; nenhum novo Setup/uninstall executado nesta atualização.
Registros abaixo anteriores à aprovação IR3 conservam suas datas/histórico.

Notices conhecidos do instalador preparados integralmente no recurso
build/nsis/THIRD-PARTY-NOTICES.txt (NSIS/COPYING, MIT templates, StdUtils LGPL2.1 e
esclarecimento), com fontes/SHA dos textos e termos externos ainda pendentes
explicitados. ExtraResources e inspeção/inventário ampliados; negativa de ausência/
divergência acrescentada. Task4.2 continua parcial: não há declaração de revisão
completa de todos os plugins. Novo pacote25 necessário para provar o recurso;
pacotes históricos não foram modificados/resselados. Fonte do app preservada.

## Retomada após renovação do limite — 2026-10-08

Usuário autorizou continuar. Diagnóstico do FAILdirtyOffer: harness ignorava
retornofalse do click helper quando botão permanecia desabilitado por refresh
de surface-active após reabertura. Harness test agora aguarda disponibilidade
observável do botão e registra dirtyCaptureReady/dirtyCaptureInvoked; timeout de
10s e assertion dirtyOffer conservados. Sem alteração de renderer/fluxo/IPC.
Novo pacote/smoke exigidos; PASSisolado15 permanece histórico, não prova a correção.

Validate16 PASS: lint, cinco typechecks, 104 arquivos/1.365 testes +11 skipped,
dois testes de volume e build. Preview16 package/verify PASS; smoke completo FAIL:
dirtyCaptureReady=true, dirtyCaptureInvoked=false, dirtyOffer=false. A consulta
separada ainda permitia refresh entre disponibilidade e gesto. Harness refinado
para esperar/clicar na mesma execução e verificar uma única leitura; timeout e
assertion da oferta conservados. Sem alteração de renderer/fluxo/IPC.

Inspeção instalada reforçada: recursos gerados exigem hashes/tamanhos de
candidate-uninstaller.exe e resources/taskflow.ico. Negativas de adulteração,
ausência e falta de procedência: nove testes de inventário PASS. Novo tooling
captura o trace -V4 da própria compilação com defines/comandos reais, verifica
ordem das guardas/ausência de kill/elevação e inclui hashes do compilador/plugins
usados no manifesto. A tentativa -PPO foi descartada: no NSIS fixado, falhou em
StdUtils::TestParameter mesmo em fixture mínima. Sem alteração de node_modules.

Previews17/18 não compilaram por integração do tooling (--import requer file URL
no Windows; entrada pública do builder necessária para evitar ciclo interno).
Preview19 falhou em -PPO; preview20 não foi empacotado por lint de bundles locais
gerados em .tmp, agora explicitamente ignorados. Preview21 compilou o Setup,
mas não foi selado: trace -V4 não registra RequestExecutionLevel. Parser ajustado
para exigir o manifest PE real asInvoker/uiAccess=false como prova quando essa
linha estiver ausente; nível admin explícito continua recusado. Leitura do trace
real21 + PE passou. StdUtils reduz verbosity: seu helper de parâmetros foi
revisado/fixado por hash e sua DLL terá procedência distinta no relatório. Build
Preview22 compilado/selado e verify:package PASS; relatório e ordem efetiva em
[nsis-build-inspection.md](nsis-build-inspection.md). Saídas históricas não foram
resseladas. Smoke integral22 PASS, 42 verificações sem flags de redução. Entries
confirmou dirtyCaptureInvoked/dirtyOffer/dirtyCaptureSingleRead; catálogo43/14 e
sandbox do Quick Add conservados. Produto/IA fake/volume/negativas/Sair PASS.

Preparação local de recuperação/retenção: 13 testes focados PASS (11 inspeção
NSIS, dois walkthrough/oráculos), typecheck:tests PASS. Walkthrough conserva
originais, exclui ai.json e compara DTOs/revisões/SQL2/codec4/markers/shortcuts;
regressão de marker em snapshot antigo é detectada, SQL1 recusa SQL2 intacto e
journal órfão permanece sem criação de banco. Prova versionada
`node scripts/probe-maintenance-profile.mjs` PASS: Electron44.5.1, prepare133ms e
verify76ms, DPAPI real/mesma conta, cifra sem texto simples, futuro/ilegível
recusados intactos, zero rede. Fixtures próprias restritas; nenhum segredo,
configuração, SID ou hash de credencial exportado. Não é prova de manutenção
instalada nem isolamento entre contas. Lint PASS.

Validate22 PASS: lint, cinco typechecks, 106 arquivos/1.378 testes +11 skipped,
volume2 e build. Inspeção instalada15 repetida somente por leitura com o tooling
reforçado PASS: todas as entradas do payload correspondem ao seu inventário,
uninstaller gerado corresponde ao Reader do Setup15 e uninstallerIcon.ico ao
ICO inventariado. Nove testes de inventário PASS incluem negativas externas/
ASAR/ausência/reparse/notices/bytes e recursos gerados sem procedência. Task4.1
concluída para a implementação; não é prova do hash final instalado.

Inspeção de ícones reforçada: derivação SVG→ICO preserva bytes; cinco PNGs
16/24/32/48/256 comparados por hash com RT_GROUP_ICON/RT_ICON no exe, Setup e
Reader-uninstaller reais22, verify:package PASS. Três testes detectam grupo/frame
ausente, ICO truncado/sobreposto/tamanho errado e corrupção em ICO/PE. Novas
negativas de configuração fictícia sob nome JS permitido PASS; scanner recusa
ASAR externo ou entrada interna antes de imprimir conteúdo. 51 testes focados
(IPC/harness/ícones/inventário) PASS; três novas negativas de conteúdo estão
incluídas. Lint/tipos anteriores de ícone PASS; gates completos novos pendentes.

Revisão task4.4 encontrou diagnóstico foundation:verify:v1 ainda executável em
prod, embora o product-harness já fosse restrito a test. Handler agora exige
perfil test antes da autorização/prova; main passa o perfil efetivo. Testes prod
e dev confirmam UNAUTHORIZED antes de tocar sessão/prova. Contrato/catálogo43/14
conservados, sem bridge nova. Validate23 PASS:107 arquivos/1.386 testes +11 skipped,
volume2/lint/cinco typechecks/build. Preview23 package/verify/smoke integral42 PASS,
sem flags de redução. Task4.4 concluída; os bytes/provas desse preview não foram
modificados. Exe SHA-256 febcdd3a1fd3a2ebfe1686da07461eb87b631d1a8f9ff4930cf8ece490080a5d;
ASAR a585d0d90f9d2adaa3a0f5073c03772b64ef945c0c2a353eb28b5208b48a03b0;
Setup 3a1140298d64e138cec7e405fa4199ac672fc2508d345144a7824bbb13dbb1db.

Prova isolada do launcher NSIS: fixture sem Delete/RMDir/registro/perfil/app,
SetErrorLevel111/Quit em un.onInit. Launcher normal /S retorna0; execução direta
com _?= retorna111. Nenhuma manutenção real realizada. IR3 registrada em
[silent-uninstall-review.md](silent-uninstall-review.md) e enviada à revisão humana;
nenhuma exceção ao contrato aprovada. A negativa real15 permanece não executada.

Proveniência reforçada preparada: campos de OS/build, versões/toolchain/runtime,
checksums fixados, manifests, componentes, NSIS/guardas/plugins e ícones validados.
Seleção agora compara cada entrada externa do payload ao inventário, além dos11
arquivos centrais selados. Testes detectam adulteração/adição de recurso com recibos
centrais intactos. Build24/verify PASS: campos OS10.0.26200/Windows11HomeSingleLanguage,
toolchain24.21.0/11.21.0, runtime/SQLite, source antes/depois e inventário conferidos.
23 testes de proveniência e15 de seleção PASS no validate24-retry. Task3.4 concluída;
fonte dirty explicitamente INVALID_CANDIDATE_DIRTY_SOURCE, sem par final limpo.
Não resselar históricos. Manifests
anteriores sem os campos OS novos não satisfazem esse validator atual; suas provas
históricas referem-se ao contrato/tooling usado no respectivo build.

Validate24 inicial: lint/cinco tipos PASS; suíte1.409 PASS/11 skipped e timeout5s
no teste que reprocessa o PE completo do Electron. Esse teste de tooling agora
usa ambiente Node e timeout localizado30s, mantendo todas as comparações de
CompanyName/manifest/ícones/demais recursos. Validate24-retry exit0:108 arquivos/
1.410 PASS+11 skipped, volume2/lint/cinco tipos/build PASS. OpenSpec Change estrito
e git diff --check PASS. Log da falha conservado; sem mudança de orçamento do produto.

Preview24 app/ASAR iguais aos23; Setup SHA-256
881d477403a9b90d73ff7151d9038860b260044498c568678fec02b1614701be,
153.423.728 bytes; Reader-uninstaller f4e13085c910d729f4f448bb8bfbf06cbdebdd4fb3d373dc2a1e7500e8c08d89.
Source SHA-25694b4ac0c7b8f57ef4b475ee87760f51674c3b15f0291441b875f0d7d6feef8b5.
Smoke24 integral exit1: apenas heartbeatWithinBudget reprovou, 10.000 tarefas
2.617ms contra2.500ms aprovados; montagem4.644,3ms/p95 consultas642,97ms passaram.
Entries dirtyOffer/singleRead e IA fictícia PASS. Fonte/limites/flags não alterados;
repetição integral dos mesmos bytes exit0/42 PASS, heartbeat10.000=655,4ms,
montagem4.480,04ms/p95 consultas612,48ms. Primeira falha conservada; causa não
isolada. Não houve alteração de fonte/bytes/flags/limites entre as duas execuções.
Não usar smoke23 como substituto da aceitação de24 nem converter a falha em WARN.

Revisão dos componentes NSIS restantes registrada em
[nsis-components-review.md](nsis-components-review.md), com DLLs usadas/hashes/fontes
primárias/limites de obtenção dos termos. Task4.2 segue parcial; nenhum texto de
licença foi inventado ou atribuído a plugin externo por herança da licença NSIS.

Guia operacional consolidado e conferido contra lifecycle, guards, erros,
WriteUninstaller, flags --updated e cleanup próprio. Inclui salvar/Sair, recusa
silenciosa, transição legada somente revisada, fonte/unsigned/políticas,
preflight intacto versus falha parcial, retenção/reinstall OFF/backup seletivo.
Matriz por instrução explicita evidência histórica e NOT_RUN/BLOCKED. Nenhum
upgrade de previews arbitrários ou par final é anunciado como disponível. O
retorno isolado do launcher NSIS não é aceitação; negativa /S /allusers no
uninstaller15 bloqueada pela revisão automática por risco se guarda falhar,
autorização específica solicitada e pendente. Tarefas documentais2.7/5.1 concluídas;
guardas/retorno/campanha instalados seguem tarefas próprias, sem waive implícito.

Atualizado em 2026-10-08. **Apply em andamento; não constitui aceitação final.**
Tasks: 21/41 confirmadas pela CLI (1.1, 1.2, 1.3, 1.4, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4). Fonte dirty; par privado
limpo 0.2.0→0.2.1 ainda não preparado. Transição manual IR2 executada; tentativa de
instalação do preview 13 concluída, após falhas dos previews 11/12.
Aprovações: approval.md, IR1, IR2 e IR3.

## Ambiente e limites

Windows 11 Home Single Language x64 build 26200, token não elevado, Administrators
ausente, UAC ativo, somente conta atual. Nenhuma conta criada. Ambiente de build tem
Node/npm; ambiente limpo sem essas ferramentas, espaços/Unicode e segunda conta
não comprovados. Segunda conta excluída explicitamente pelo usuário, não PASS.
Sem logoff/login real, falha de energia, publicação, commit/push/PR ou archive.

## Gates e pacote

Atualização preview13: validate fora do sandbox com Node24.21.0/npm11.21.0
retornou0: lint, cinco typechecks, 103 arquivos/1.363 testes PASS +11 skipped,
2 testes de volume PASS e três entradas de build PASS. Sem packaging concorrente;
supera a falha EPERM anterior na fixture de IA. OpenSpec estrito/diff --check PASS.
Regressão posterior de argumentos NSIS: quatro testes PASS; tentativa no sandbox
falhou no cache antes dos testes e foi reexecutada com TEMP/TMP no workspace.

- Trinta testes focados de staging/inventário/inspeção/preflight passaram.
- Lint e cinco typechecks passaram após ampliação do recibo de seleção.
- Suíte: 1.361 PASS, 11 skipped, uma falha EPERM em rename de configuração de IA
  fictícia. Reexecução isolada desse arquivo e staging: 29 PASS; suíte integral
  precisa nova execução sem a compilação concorrente. Não houve mudança de IA.
- OpenSpec Change estrito 1/1 e git diff --check passaram nesta continuação.
- Preview 7: package:win, verify:package e smoke completo (42 PASS) passaram.
  App x64; Setup/uninstaller x86; três manifests asInvoker/uiAccess=false.
- Preview 8: package:win/verify:package passaram, recibo ampliado a dez arquivos.
  App/ASAR idênticos ao preview 7; alterações apenas no tooling/NSIS/inventário.
- Preview 9: Setup compilou, mas probe SQLite expirou em 10 segundos. Saída não
  selada e não executada. Prazo desse probe de build ampliado a 30 segundos;
  snapshot de fonte anterior ao build agora será persistido e selado.

| Bytes | Preview 7 | Preview 8 |
| --- | --- | --- |
| exe SHA-256 | daf305f370fc19f4af911595cd4a5243183cbbfaef204ee27e3ef0430e0c5e6e | mesmo hash |
| ASAR SHA-256 | 4fa6d9663501a0580e598ba9690ff8cc014caf737758b4515037b50a43af56b1 | mesmo hash |
| Setup SHA-256 | 9972d318da1c1bff6f356a734973497686e93753abb9c27d445b4356bfb23dd0 | d1bee6b61ad169f86a5bd17bc8972b49d353749674b1692928527a3d193f73da |

Os previews têm versão 0.2.0/base f91ce401c8648a8d0aa984975c72885f9c023ee6,
runs nsis-preview-7/8/9; readiness INVALID_CANDIDATE_DIRTY_SOURCE. Não satisfazem
W01/W09 finais. O formato de seleção evoluiu; não adaptar/selar saídas históricas
para conseguir escolhê-las pela CLI atual. Builds novos usam saídas exclusivas.

## Recusa diante do legado — prova parcial W05

Preview 7, 2026-10-08T10:39:17.4796724Z, Setup /S retornou 2 em 11.956,68 ms.
Hashes de todos os binários e perfis antes/depois comparados somente em memória:
iguais. Registro continuou 0.1.0. Consultas diretas: identidade 0, processos 0,
predecessor 32 (falha de consulta). Nova consulta direta x86/x64 retornou 31.

Preview 8 /S retornou 132 (falha de consulta de predecessor), registro 0.1.0
preservado. Resultado demonstra recusa segura; **não comprova especificamente a
ramificação de versão legada nem predecessor compatível**. Código revisado para
recusar versão não permitida antes de leitura dos hashes e distinguir falhas de
consulta por etapa 321/322/324/325. Preview 10 compilou/selou/inspecionou onze
arquivos do recibo e /S retornou 131, mantendo registro 0.1.0. Setup SHA-256:
bfbc7767b4c0796b7984e2a4af6f65c76b3794dbfda4bac2aab755785b5a4f8f.
App/ASAR continuam idênticos ao preview 7. Probes agora selecionam Registry64
explicitamente, independentemente do PowerShell x86 do stub NSIS.

## Transição manual IR2 — execução autorizada

2026-10-08T11:03:17.3294089Z: versão 0.1.0, root/ancestrais sem reparse,
zero processos próprios e identidade válida revalidados. Executado exclusivamente
o uninstaller antigo próprio /S, sem passar pelo Setup novo ou trocar seus bytes.
Launcher retornou 0 em 1.170,69 ms; comparação de perfis em memória nesse momento
foi igual. A remoção ainda não havia terminado: não tratar retorno do launcher
como conclusão. Consulta posterior confirmou exe, uninstaller, registro de
instalação e NativeIdentity ausentes; sem processo residual encontrado.

Hash final dos perfis após encerramento do processo separado não foi comparado
ao baseline que estava só na memória do launcher. Não converter esse limite em
PASS final de retenção; nova campanha usa baseline persistente em memória até
conclusão efetiva. IR2 é transição excepcional do legado, não upgrade seguro.
Startup pode ter sido removido conforme limite aprovado; não foi autoativado.

## Primeira instalação nova — FAIL parcial W02

Preview 11, 2026-10-08T11:10:09.6347025Z, Setup /S retornou 2 em 17.145,44 ms;
root de binários, exe/uninstaller e registro de versão permaneceram ausentes.
Perfis e ACLs do diretório pai e da raiz de dados comparados antes/depois só em
memória: iguais. Nenhum produto foi aberto. Não declarar instalação bem-sucedida.
Setup SHA-256 250978c56726adfca65495f5ae9bb4bdb02c59c26138eb355d4897ad5b1909b1.

Investigação em andamento: códigos de guardas/extração/registro/remoção ampliados
por fase para localizar a recusa sem logs privados. Corrigido também o salto relativo
da extração ZIP: expandir TFA_FAIL altera o número de instruções; condição estruturada
substitui StrCmp +3. Não executar um preview antigo para contornar as guardas.

## Pendências materiais e execução seguinte

Preview 12, 2026-10-08T11:21:57.3605866Z, Setup /S retornou **201 (extração)**
em 16.705,67 ms. Perfis, ACL do pai e ACL da raiz de dados permaneceram iguais
nas comparações em memória. Root parcial presente, exe ausente; não declarar PASS.
Setup SHA-256 c66c1346fae2e4faa7b3a52c88e4dd8074a084aeb63f9bc4f188703bfb8891e0.

Causa localizada no código primário do builder26.17.0, NsisTarget.js:
isBuildDifferentialAware é true por padrão, e buildAppPackage escolhe 7z nesse
caso; as defines ZIP_COMPRESSION/COMPRESSION_METHOD ainda seguem useZip. A
configuração useZip=true sem differentialPackage=false gerava payload 7z para
extractor ZIP. Configuração corrigida e wrapper reprova essa combinação antes
de criar stage. Sem edição de node_modules, updater ou alteração do runtime.
O preview seguinte deve provar extração e instalação; a correção não é prova.

Preview 13 compilou/selou e verify:package passou. Setup /S executado na conta
real não elevada em 2026-10-08T11:31:59.3349003Z: exit0, 25.859,56 ms; exe,
uninstaller e registro 0.2.0 presentes. Hashes de toda a raiz de dados, ACL do pai
e ACL da raiz de dados permaneceram iguais em memória até término do Setup.
Setup SHA-256 1974f15d88fdc317e948a4fc247ea19b75bcc2af176aa56d250961e0af6d3a15.
Inspeção instalada passou: todos os bytes do payload coincidem com o inventário
selado, sem extras salvo recursos gerados declarados; três manifests asInvoker.
Uninstaller instalado coincide com candidate-uninstaller.exe extraído por Reader.
Não houve abertura do produto nem comparação lógica/DPAPI. Prova parcial W02/W08;
fonte dirty, host com Node/npm e sem campanha offline/Unicode/segunda conta.

Reparo com o mesmo Setup13, 2026-10-08T11:34:34.2411210Z: **FAIL129**, 39.614,57 ms.
Dados e ACLs de pai/raiz de dados iguais; exe/uninstaller/registro0.2.0 presentes,
mas atalho do Menu Iniciar ausente depois. Não declarar preflight intacto nem PASS
de reparo: houve mutação parcial. Consultas diretas identidade x86/x64 retornam0
quando atalho ausente é permitido fora de pós-instalação. Causa no install-util:
flags do predecessor estavam em $0, sobrescrito pelos probes nsExec::ExecToStack
(stdout), antes de ExecWait. --updated/--keep-shortcuts não eram conservados.
Argumentos agora copiados a variável exclusiva antes das revalidações. A prova
seguinte deve usar uninstall próprio aprovado/novo preview; não aceitar bytes
novos como reparo de versão igual sem procedência do uninstaller.

Uninstall próprio13 /S, 2026-10-08T11:38:42.4462636Z: launcher0 e conclusão
efetiva verificada por ausência de binários e registro, 12.514,82 ms no total.
Root/exe/uninstaller ausentes, registro de versão ausente. Baseline da raiz
inteira de dados comparado em memória após conclusão: igual; ACLs do pai e dados
iguais. Sem remoção manual. Não prova isolamento entre contas, startup ou DPAPI.
Conta atual está sem o aplicativo instalado; próxima instalação usa novo preview.

### Preview14 — instalação, reparo e negativas

Setup SHA-256 e2cc72caa3bda3ea6f4a84d5d1186cfff2c92a5b395231097650f66d3e9f1a1d.
Build/seleção/verify passaram. Instalação /S em2026-10-08T11:45:21.3332849Z:
exit0/25.873,26ms, versão0.2.0/exe/uninstaller presentes. Reparo com exatamente
o mesmo Setup em2026-10-08T11:46:28.4164011Z: exit0/38.365,67ms, mesmos recursos
presentes e atalho do Menu Iniciar conservado. Raiz inteira de dados, ACL do pai
e ACL dos dados iguais até término em ambas as execuções. W09 permanece parcial:
sem comparação lógica/DPAPI/startup/upgrade0.2.1 e sem fonte limpa.

Dez negativas W04 do Setup14 entre11:47:34Z e11:48:28Z: /allusers, combinação de
modos, /currentuser duplicado, /allusers=bad, /D externo, /D duplicado, /D vazio,
/D malformado, --delete-app-data, --force-run. Todas exit100; duração do processo
423,66–556,66ms; todos os binários e dados iguais, ACLs de pai/dados iguais,
registro0.2.0 e exe/uninstaller presentes. Comparações em memória, sem imprimir
paths/perfis/conteúdo. Não houve simulação de HKLM/Known Folder/reparse/ownership;
tasks2.1/7.2 permanecem parciais. Conta atual está com preview14 instalado.

Metadados PE13/14: FileVersion0.2.0 em app/Setup/uninstaller, ASARpackage0.2.0,
copyright existente conservado. App herda CompanyName="GitHub, Inc." do Electron;
Setup/uninstaller têm campo vazio. **Pendência3.1, sem atribuir GitHub ao produto.**
Hook afterPack agora limpa CompanyName em todas as línguas antes da edição final
do builder, sem inventar author/publisher. Teste em cópia PE somente em memória
PASS: mantém manifest e todos os recursos fora de VersionInfo. Verificador passa
a recusar campo empresarial não vazio. Exige novo build/inspeção, não alterar
bytes selados históricos nem reinterpretar seu resultado como aceitação final.

Preview15 compilado/selado/verify PASS. Metadados dos três PEs conferidos:
FileVersion0.2.0, ProductVersion0.2.0 no stub e0.2.0.0 no app, copyright existente
conservado e CompanyName vazio. Package/lock/ASAR/runtime0.2.0 concordam; diff
do lock somente versão top/root, sem upgrade de dependências; IDs/CLSID/paths/startup
conservados. Task3.1 concluída, independente de aceite instalado final.
App SHA-256 e662ab1c686d8d531abe49979d7ae9cf9594634dae5c0f242ddf4f5e76d4c20d;
ASAR continua4fa6d9663501a0580e598ba9690ff8cc014caf737758b4515037b50a43af56b1;
Setup SHA-256 c417c1cb0cdfb954e56551d8d35efe0d9621d9b46f15dfe8bebaf5158483fd17.
Uninstaller15 coincide com instalado14 por hash, permitindo reparo sem bypass.

Reparo15 na conta atual, 2026-10-08T11:55:49.4241735Z: exit0/42.009,57ms,
exe/uninstaller/registro0.2.0 presentes; raiz de dados e ACLs de pai/dados iguais.
Inspeção instalada15 PASS: bytes do payload coincidem com inventário, generated
resources separados, manifests asInvoker e CompanyName vazio. App instalado
atualmente é preview15; não houve abertura do produto com dados reais.

Smoke integral15 **FAIL** em Quick Add `dirtyOffer`; outros checks do cenário
entries passaram (catálogos43/14, sandbox, isolamento, captura global, zoom).
ASAR idêntico ao preview7, cujo smoke integral histórico passou; isso não converte
o resultado atual em PASS. Benchmark de armazenamento deste run passou, mas
etapas posteriores ao entries não completaram. Investigação no oráculo em
src/main/harness/entries-harness.ts:73–75; reexecução somente --entries-only
solicitada com fixture nova, preservando log original. Task4.4 desmarcada.

Reexecução15 --entries-only concluiu **exit0/smoke:packaged OK**, dirtyOffer=true,
catálogos43/14/sandbox/Sair e negativas de preload/ASAR/hang passaram. Não houve
alteração de runtime ou oráculo. Sugere intermitência a investigar; não substitui
smoke integral. Log entries15-recheck.log, original smoke15.log preservado.
Handoff ao chegar5% restante do limite de5h: continuation-prompt.md. Nenhum build,
Setup ou recheck ficou em execução pela sessão. Conta atual mantém preview15.

## Revisão documental e workflow

Guia confrontado com config/probes/source: origem local e seleção exata por stage,
hash não prova publisher, `private` npm não prova privacidade/custo, runner admin
não prova conta padrão, sem promessa de determinismo. R7 suspende upload; diff
CI conserva actions por SHA, contents:read, --publish never, seleção compartilhada;
nenhum Setup executado pelo workflow, segredo de assinatura ou builder-debug
publicado. Não houve disparo de CI. Retenção é local no escopo aprovado.

Guia distingue notices existentes e scanner limitado, PowerShell/icacls do SO,
ASAR sem cifragem e prova visual pendente. Exclusão manual é operação separada,
perfil/root/ownership/Sair confirmados, cache e IA retidos, perda explícita,
backup apenas tarefas e revogação no provedor separada. Não executada exclusão.

Compilar/inspecionar novo preview com Registry64 e guarda anterior ao cleanup;
revalidar zero processos/root/ownership, instalar 0.2.0 e validar manutenção.
Não instalar silenciosamente um candidato não selado nem forçar encerramento.

Notices Vue/Pinia/transitivas e Electron incorporados; revisão de notices dos plugins
NSIS ainda parcial. COPYING do NSIS e LGPL/clarificação StdUtils disponíveis;
proveniência/licença de SpiderBanner ainda não resolvida (página oficial indisponível).
Não inferir licença universal dos plugins nem marcar task 4.2 completa.

Provas humanas/visuais/DPI/COM/toast/startup/falhas e par limpo com dois commits
distintos permanecem pendentes. Sem autorização de commit por inferência. A aprovação
de IR2 não altera a recusa automática do 0.1.0 nem o torna predecessor seguro.
