# Evidência do produto empacotado — TFA-007 (backup e importação)

Registro operacional do apply da TFA-007 no produto fictício empacotado. Dados e perfis usados são
exclusivamente fictícios; nenhum perfil real, banco real ou extensão foi tocado. A origem
`C:\QSI\Workspaces\taskflow-extension` permaneceu intacta em
`a763e7a0d646c664ecd4f979528bc2c3589fa8c4`.

## Runtime e pacote

- Electron 44.5.1, Node embarcado 24.21.0, Chrome 152.0.7977.130, x64; SQLite 3.53.4 embarcado.
- Schema SQL 2, codec 4, formato de backup 4, bridge 21; PRAGMAs efetivos
  `journal_mode=delete`, `synchronous=3` (EXTRA), `foreign_keys=1`, `busy_timeout=100 ms`.
- `npm run package:win` (NSIS one-click x64, `--publish never`, sem assinatura) concluído sem
  publicar nem executar Setup; `release/win-unpacked` e o `Setup.exe` de prova foram gerados.
- `npm run verify:package` OK: ASAR com 12 arquivos na allowlist, sem addon/updater/segredos;
  manifestos do executável, Setup e desinstalador em `asInvoker`/`uiAccess=false`.
- Hashes SHA-256: `TaskFlowApp.exe` `72d3c0a2b6bd62e3f4b102f5968fc6fdeeb62e9335883c500ae6b353814fb398`;
  `app.asar` `92e92d2fb8bea54f4a9022a27cd986cca154975e6436e4ff0654b2ac8bbedf28`;
  `Setup` `853ec2a48886b9e96ebecf5f22d9461265a66061665104a80f3fa069de567bc5`.
- `npm run smoke:packaged -- --ci-runner` (perfil fictício, sem executar Setup nem publicar):
  **OK com o gate D10 reportado como pendente**, mesmo tratamento registrado para TFA-004/005/006.
  Sem o flag, a execução local reprova **somente** no gate herdado D10 de UI (não bloqueante no
  runner); nenhuma falha pertence à TFA-007.

## Cenário `backup` do harness (pacote real)

`BACKUP {"ok":true}` com 18/18 verificações, usando serviços/storage/I-O/SQLite reais e **diálogo
stub** (o marcador registra `dialog:"stub"`; nenhum diálogo nativo foi aberto):

- Exportação: `outcome:SAVED`, arquivo aceito pelo próprio leitor, contagem igual, sem `.tmp`
  residual no diretório.
- Prévia/confirm: `APPLIED`/`VERIFIED`, `undoEpoch` 1→2, revisão 509, re-confirmação com o mesmo
  token → `BACKUP_PREVIEW_INVALID`.
- `UNCHANGED`: revisão SQL mantida, `undoEpoch` 2→3; a segunda superfície inscrita recebeu
  `undo-invalidated` com a época nova **sem** aumento de revisão e sem eventos extras.
- Base obsoleta: `BACKUP_BASE_CHANGED`/`NOT_APPLIED` sem perda (2 tarefas, 1 na lixeira).
- Portadora duplicada: `SERIES_CONFLICT`/`NOT_APPLIED` com a lixeira preservada.
- `backup|export-fail|temp:after-write` (e demais pontos pré-rename): `FILE_WRITE_FAILED` com
  destino anterior preservado; `rename:after`/`readback:before`: `SAVED_WITH_WARNING` (efeito já
  concluído não é revertido). Executados em Electron real no apply do harness.
- Barreiras de crash do coordenador (transação/COMMIT/publicação/claim/move/restore/revert)
  continuaram verdes no pacote com o estado inteiro antes/depois.
- O cenário não usa hooks no preload normal; a escolha stub substitui somente o diálogo.

## Medições (B03/B13/B14)

Script fora do repositório no runtime fixado (Node 24.21.0) e bench do harness empacotado:

- Teto: arquivo de 20 475 967 bytes (4 762 tarefas, 214 303 nós) codificado em ~99 ms, varrido em
  ~46 ms e validado em ~74 ms; `limite+1` → `FILE_TOO_LARGE`; charge de parse 88 862 781 bytes e de
  preparação 65 613 484 bytes — a sobreposição das fases **não cabe** nos 128 MiB para esse formato
  (RESOURCE_LIMIT com dados intactos; composições com menos nós cabem).
- Adversariais: profundidade 65 → `RESOURCE_LIMIT` em <1 ms; ~280 mil nós (1,57 MB) → `RESOURCE_LIMIT`
  em ~22 ms, antes do parse.
- Orçamento: oito reservas de 16 MiB aceitas, nona recusada, liberação de volta a zero; 64 MiB de
  undo e lockfile inalterados.
- Volumes (coordenador/SQLite reais, perfil fictício): restauração de 1 000 e 10 000 tarefas com
  100 entradas de lixeira preservadas em ~9 ms e ~71 ms de unidade (maior bloqueio síncrono
  ~38 ms e ~274 ms).
- Bench do pacote: 10 000 tarefas/23,9 MiB de payload; mutação p95 3,84 ms, página p95 6,33 ms,
  preflight 273,99 ms, `saveMany` 492,02 ms, drain 86,06 ms; recibos liberados (usedBytes 0).

## Pendências herdadas e limites (não resolvidos por esta Change)

- **D10 de UI (gate retido):** montagem 440/3 033 ms, p95 95,7/**787,68** ms, subtarefas
  25,4/212,4 ms, heartbeat 86,1/**745,9** ms (1k/10k) na rodada `--ci-runner`; os números
  700/700/250 seguem **não aprovados**. Nenhum budget foi relaxado e nada foi truncado,
  virtualizado ou movido para worker.
- **Diálogo nativo real do Windows:** não executado; roteiro separado em
  [backup-migration-guide.md](backup-migration-guide.md), registrado como pendência e nunca
  apresentado como PASS (o harness usa stub).
- **Acessibilidade humana** (teclado real, zoom 200%, DPI, leitor de tela) e **before-images
  extremas**: campanhas herdadas continuam pendentes.
- **Energia:** `sync`/`rename`/kill não comprovam queda de energia; a janela residual entre o
  fingerprint e a substituição está documentada.
- **Banco inacessível/corrompido:** o preflight permanece protegido; não há reset, troca de SQLite
  ou recuperação destrutiva nesta Change.

## Rastreabilidade

B01–B04/B10 (formato/projeção/liquidação): testes do núcleo portável. B05/B06 (consentimento/base/
tokens): serviço/registro/UI. B07/B08/B11 (unidade/portadora/fases): plano/serviço/coordenador.
B09 (época): store/cliente/estado + harness de duas superfícies. B12 (arquivo/Windows): adapters e
fault points; diálogo nativo pendente. B13 (catálogo/recursos/produto): contrato/IPC/harness.
B14 (UI/gates): componente + `npm run validate` + OpenSpec estrito + smoke.
