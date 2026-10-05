# Relatório de verificação — TFA-007 (migrar backups e importar dados da extensão)

Relatório gerado ao final do `opsx:apply` para **revisão explícita antes do archive**. Não declara
aprovação humana e não arquiva, consolida, commita, publica ou integra nada. Cobre aderência aos
artefatos aprovados (proposal/design/sete deltas/tasks), as 45 tasks, os critérios B01–B14, os
gates executados e as pendências.

## Verification Report: migrar-backups-e-importar-dados-da-extensao

### Summary

| Dimensão | Status |
| --- | --- |
| Completeness | **45/45 tasks**; 7 deltas / 45 requisitos (18 ADDED em `desktop-task-backup` + 27 MODIFIED/ADDED nos seis demais) |
| Correctness | **45/45 requisitos com implementação e evidência**; cenários B01–B14 rastreados (ver tabela); 157 cenários dos deltas cobertos por testes de núcleo/main/renderer/harness |
| Coherence | Decisões D1–D10 seguidas; padrões do projeto mantidos; pendências herdadas separadas (D10/a11y/before-images/energia/diálogo nativo) |

- Change: `migrar-backups-e-importar-dados-da-extensao`; schema `spec-driven`; OpenSpec 1.14.0.
- Branch `codex/tfa-007-migrar-backups-e-importar-dados-da-extensao`, base
  `9e8a05a2d84874f25d9f429ecc120e81c7ec0acc` (PR #6); artefatos aprovados em 2026-10-05.
- Origem `C:\QSI\Workspaces\taskflow-extension` intacta em
  `a763e7a0d646c664ecd4f979528bc2c3589fa8c4` (worktree limpo; nenhum build/teste/escrita).
- SQL 2, codec 4, backup 4, bridge 21, estado v3, update/status v4, move v2 e backup v1 no mesmo
  pacote; nenhuma dependência nova e lockfile inalterado.

## Aderência aos artefatos

| Artefato | Aderência |
| --- | --- |
| proposal | Formato v1–v4 com versão original; 20 MiB simétricos; diálogos/I-O no main; prévia imutável (base/token/TTL/consumo único); substituição somente de tarefas em unidade; fases/NOT_APPLIED/UNKNOWN; invalidação global por época; estado v3/update-status v4/move v2/catálogo 21 com backup1; identidade/teclado/estados; documentação. Sem mesclagem, extração do Chrome, SQLite, histórico, criptografia, scheduler, bandeja, IA ou redesign. |
| design D1 | Cópia revisada com envelope exato, migrações sem correção silenciosa, projeção explícita (unknowns descartados, inclusive `recurrence`), export validado pelo leitor, coletor de 5 issues + contagem. |
| design D2 | 20 MiB em bytes reais; leitura por handle no limite+1; UTF-8 estrito/BOM único; scanner 64/262 144 antes do parse; ledger 128 MiB com charges/liberação; um job global; 8 preparações; 64 MiB de undo intactos. |
| design D3 | Diálogos nativos vinculados (adapter Electron; stub só no harness); snapshot após save; proteção de destino; temporário exclusivo/sync/close/rename único; fingerprint/readback; SAVED/SAVED_WITH_WARNING/DESTINATION_CHANGED; janela residual e energia documentadas. |
| design D4 | Preparação imutável com token 24 bytes/base64url, contexto, revisão global, TTL 5 min, uma por documento; consumo único; cancel idempotente próprio; abandono modal preserva; export preventiva conserva base/TTL; DTO ≤ 8 KiB. |
| design D5 | Plano com importadas + toda a trash; portadora única por série (qualquer status) com SERIES_CONFLICT; IDs/timestamps/ordens/âncoras preservados; liquidação pura ≤ now; CAS global; UNCHANGED sem revisão SQL. |
| design D6 | Comparação completa por ID antes do COMMIT; conclusão síncrona somente leitura/in-memory antes de publicar/próxima unidade; VERIFIED/PENDING/NOT_APPLIED/UNKNOWN com contenção/reopen sem replay. |
| design D7 | `invalidateAll` com época positiva segura (guarda de overflow) inclusive em UNCHANGED; estado/páginas/eventos v3 com `undoEpoch` e cursor do par; `undo-invalidated:v1` na mesma inscrição; acks elegíveis com época; create/check3 e demais wrappers preservados. |
| design D8 | 21 wrappers exatos; schemas fechados; budgets 64 KiB/8 KiB/1 KiB/256 KiB; erros fechados; `commitState` só em confirm; guards de sessão/ticket/contexto na admissão/execução/fronteiras/entrega; renderer nunca envia path/JSON/Task/sessão/relógio. |
| design D9 | Área Backup por header/vazio, Voltar/exportar/selecionar; fases loading/preview/restoring/exporting/success/stale/blocked; confirmação irreversível; aviso de arquivo vazio; export preventiva; foco/busy/aria-disabled/Escape; contagens independentes de filtros; guia e roteiro manual. |
| design D10 | B01–B14 como cenários/tasks; fixtures v1–v4 copiadas; negativas de cada campo/lista; harness com arquivo/serviços/I-O/SQLite reais e duas superfícies; medições; gates npm/OpenSpec/pacote; pendências herdadas separadas. |

## Tasks (45/45)

- 1.1–1.5: fixtures v1–v4 e resultados canônicos; cadeia de migrações com versão original;
  validação integral com coletor limitado e projetores; comparador completo; documentação.
- 2.1–2.5: leitura por handle com limite/encoding; scanner e reserva antes do parse; ledger de
  128 MiB com charges e liberação; serialização limitada validada pelo leitor; documentação.
- 3.1–3.6: diálogos/gate/adapters; snapshot após destino e proteção; gravação atômica; fingerprint e
  readback; cancelamento/encerramento; fases/janela residual/roteiro nativo.
- 4.1–4.7: preparação/token/TTL; consumo único e cancel idempotente; plano/portadora; replaceAll
  verificado; conclusão serializada; resultados por fase e contenção; documento do fluxo.
- 5.1–5.7: época no sucesso; estado v3; evento `undo-invalidated`; v4/v2 nos acks; quatro wrappers e
  catálogo 21; guards nas fases; documentação de catálogo/epoch.
- 6.1–6.6: área de Backup; prévia completa; modal/Escape/busy/foco; ofertas por época; guia e matriz
  de paridade; roteiro humano com pendência registrada.
- 7.1–7.5: harness de produto com arquivo/serviços reais e duas superfícies; fault points de
  gravação/transação; diálogo nativo separado (pendente); medições; evidência operacional.
- 8.1–8.4: gates npm/OpenSpec; pacote/verify/smoke sem Setup nem publicação; este relatório;
  roadmap para revisão.

## B01–B14 — evidência

| ID | Evidência |
| --- | --- |
| B01 | `tests/application/backup-file.test.ts`: fixtures v1–v4 canônicas, versão original/normalizada, `lastTriggeredFor−OFFSET`, migração ausente/futura/inválida, subtasks legadas, recusas integrais. |
| B02 | `backup-comparison.test.ts`: perda/alteração isolada de cada campo/parâmetro/marker e de `subtask id/title/done/ordem`; reordenação da coleção não gera falso erro; limites em `backup-file.test.ts`. |
| B03 | `tests/main/backup-file-access.test.ts` (limite exato/+1, multibyte, crescimento/stat, não-regular, UTF-16/BOM repetido/UTF-8 malformado); `backup-resources.test.ts` (64/262 144, adversariais). |
| B04 | `backup-serializer.test.ts` (sem BOM, limite antes do completo, validação pelo leitor, sentinelas descartadas) e `backup-export-service.test.ts` (todas as tarefas, filtros irrelevantes, destino protegido). |
| B05 | `backup-restore-service.test.ts`, `backup-restore-registry.test.ts`, `tests/renderer/backup-manager.test.ts` (prévia/zero tarefas/cancel/export preventiva/TTL/seleção repetida). |
| B06 | serviço (base mudada, token alheio/repetido/expirado, arquivo alterado sem releitura) + registro (troca/cancel/expiração/liberação). |
| B07 | `backup-restore-plan.test.ts` (APPLIED/tasks:[]/UNCHANGED/CAS/metadata/rollback de verificação). |
| B08 | `backup-restore-plan.test.ts` (trash integral, portadora duplicada/na lixeira, homônimos, ID_EXISTS pela política de restore). |
| B09 | `tests/main/storage-coordinator-completion.test.ts`, store/cliente/estado e harness de duas superfícies com `undo-invalidated` em UNCHANGED. |
| B10 | `backup-restore-plan.test.ts`: pendentes ≤ now liquidados; futuros/marcas/timestamps intactos; sem geração/scheduler. |
| B11 | serviço: `BACKUP_VERIFICATION_FAILED` (NOT_APPLIED), commit incerto (UNKNOWN + barreira/reopen), sem replay; conclusão no coordenador com PENDING. |
| B12 | `backup-file-write.test.ts`/`backup-destination.test.ts` (write/sync/rename/cleanup/fingerprint/readback) e fault points no harness; diálogo nativo real pendente manual. |
| B13 | `backup-contract.test.ts`, `tests/main/ipc-backup.test.ts`, `bridge-catalog.test.ts` (21 wrappers), medições de teto/adversariais/orçamento e harness. |
| B14 | `npm run validate` (lint, 5 typechecks, 834+11 skipped, build), OpenSpec estrito e componente Backup; zoom200/DPI/leitor de tela pendentes no roteiro humano. |

## Gates executados (runtime fixado Node 24.21.0/npm 11.21.0)

- `npm run validate`: lint, typecheck (5 projetos), **834 testes aprovados + 11 skipped em 62
  arquivos** e build main/preload/renderer — **aprovado**.
- OpenSpec 1.14.0 estrito: Change **1/1**; `--all` **11/11**; `--archived` **6/6** — aprovado.
- `npm run package:win` (NSIS x64, `--publish never`, sem assinatura) — aprovado, sem Setup
  executado e sem publicação.
- `npm run verify:package`: ASAR 12 arquivos na allowlist; `asInvoker`/`uiAccess=false` no app/Setup/
  desinstalador; hashes SHA-256 registrados — aprovado.
- `npm run smoke:packaged -- --ci-runner` (perfil fictício): **OK com o gate D10 de UI reportado
  como pendente**, mesmo tratamento de TFA-004/005/006. O cenário `backup` do pacote passou com
  **18/18 verificações** (export SAVED/arquivo validado/sem temporários; APPLIED VERIFIED e
  reconfirmação inválida; UNCHANGED com revisão estável e `undo-invalidated` na segunda superfície;
  base obsoleta; SERIES_CONFLICT com lixeira preservada; export-fail pré/pós-rename correto).
  Sem o flag, a execução local reprova **somente** no gate herdado D10 (não pertencente à TFA-007).
- Medições: teto 20 475 967 bytes/4 762 tarefas/214 303 nós (~99 ms encode, ~46 ms scan, ~74 ms
  validação); `limite+1` FILE_TOO_LARGE; profundidade 65 e ~280 mil nós recusados antes do parse;
  8×16 MiB aceitos e nona recusada com liberação a zero; restauração 1 000/10 000 + 100 trash em
  ~9/~71 ms (maior bloqueio ~38/~274 ms); bench do pacote com mutação p95 3,84 ms e página p95
  6,33 ms.

## Descobertas e limites

- A sobreposição parse+preparação de um arquivo no teto com ~214 mil nós excede os 128 MiB
  (`RESOURCE_LIMIT` com dados intactos); composições com menos nós cabem. É o comportamento
  aprovado do design (charges sobrepostas só quando couberem) e está documentado; ampliar o
  orçamento exige revisão com novas provas.
- Diálogo nativo real do Windows e roteiro humano de teclado/zoom/DPI/leitor de tela permanecem
  como evidência manual separada (registrados como pendência; o stub do harness nunca é chamado de
  nativo).
- Energia não comprovada: `sync`/`rename`/kill não certificam queda de energia; a janela residual
  entre fingerprint e substituição está documentada.
- D10 herdado (p95 688,3 ms; heartbeat 760,5 ms; varredura 141,7 ms; números 700/700/250 não
  aprovados), acessibilidade humana e before-images extremas continuam pendentes.
- Nenhuma troca de SQLite/codec, nenhum perfil real usado e nenhuma extensão auxiliar criada.

## Issues por prioridade

Nenhum issue **CRITICAL**.

**WARNING** — itens herdados, não bloqueantes para a TFA-007 e não resolvidos por ela:
- Gate D10 de UI segue reprovando no smoke local (p95 787,68 ms e heartbeat 745,9 ms em 10.000
  tarefas); orçamento 700/700/250 não aprovado. Recomendação: manter o gate retido e resolver com
  decisão/medição próprias, sem relaxar budget.
- Evidência nativa do diálogo e acessibilidade humana não executadas. Recomendação: executar o
  roteiro de `docs/backup-migration-guide.md` antes de declarar aceitação nativa.
- Cobertura das barreiras de “conclusão/resposta” é de unidade/integração (coordenador/sessões),
  não um cenário empacotado dedicado. Recomendação: considerar um cenário de fault point de
  conclusão em Change futura, se necessário.

**SUGGESTION**:
- O README ainda descreve o catálogo com 17 operações; a atualização factual pertence à etapa
  pós-archive (AGENTS.md item 38), quando autorizada.

### Final Assessment

No critical issues found in the checks that ran. 3 warning(s) and 1 suggestion(s) to consider;
pendências herdadas (D10/a11y/before-images/energia/diálogo nativo) permanecem separadas. **Ready
for review** — archive, consolidação, README pós-archive, commit/push, PR/merge, distribuição e
TFA-008 aguardam autorização explícita do usuário após a aprovação deste relatório.
