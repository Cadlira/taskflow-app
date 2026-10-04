# Verification — TFA-002

**Change:** `preparar-fundacao-desktop-e-validar-instalacao-por-usuario`
**Schema:** spec-driven · **Data:** 2026-10-04 · **Branch:** `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`
**Escopo verificado:** apply da TFA-002 até a prova em conta padrão neste PC Windows 11 x64 autorizado, sem archive, commit, push, PR, merge ou release.
**Relatório:** gerado por `openspec-verify-change`; requer aprovação explícita antes do archive (AGENTS.md, item 42).

## Summary

| Dimensão | Status |
| --- | --- |
| Completeness | 32/33 tasks (1 pendente com causa: 6.5); 18 requisitos ADDED cobertos |
| Correctness | 18/18 requisitos com implementação confirmada; 40/47 cenários confirmados; 7 parciais/bloqueados |
| Coherence | Design D1–D7 seguido (revisões de G4 e ACL registradas); padrões consistentes; sem segredos/dados reais |

## Completeness

- **Task Tracking:** `tasks.md` presente e agregado pela CLI; 32/33 concluídas. **7.3** (roadmap atualizado) foi concluída com a revisão anterior; **5.4** foi concluída nesta rodada com o run hospedado da CI.
- **Pendente:**
  - **6.5** — instalação/diagnóstico/manutenção na **segunda conta padrão** não executados. **Correção de premissa (2026-10-04):** a máquina **não contém** contas padrão fictícias criadas pelo usuário; as únicas contas não-administradoras são contas técnicas de sandbox (`CodexSandboxOffline`/`CodexSandboxOnline`), sem credenciais acessíveis. O usuário autorizou criar uma conta padrão fictícia dedicada para a prova; a execução fica pendente dessa criação. Registrado como BLOCKED com causa, sem bypass.
- **Specs:** 3 capacidades novas (`desktop-foundation`, `windows-per-user-installation`, `desktop-build-validation`), 18 requisitos ADDED, 47 cenários. A CLI valida a Change com `--strict` (sem REMOVED/RENAMED).

## Correctness — mapeamento requisito → evidência

| Requisito | Evidência principal |
| --- | --- |
| Shell local autocontido e acessível | `src/renderer/src/App.vue`, `src/renderer/src/stores/foundation.ts`; testes `tests/renderer/foundation-view.test.ts`; smoke e launches no exe instalado (título “TaskFlow App”, prova verificada, erro seguro). |
| Renderer sem autoridade irrestrita | `src/preload/index.ts` (bridge única), `tests/architecture/layer-boundaries.test.ts`; smoke com payloads inválidos e catálogo limitado. |
| Autorização e validação diagnóstica | `src/main/ipc/foundation.ts` (schema exato, versão 1, 1 KiB, webContents/main frame/origem, BUSY), `tests/main/ipc-foundation.test.ts`; probes no renderer real (INVALID_REQUEST). |
| Recursos locais e navegação restrita | `src/main/protocol.ts` (taskflow://app, CSP, traversal/host/symlink), `src/main/index.ts` (negação de navegação/janelas/webviews/permissões), `electron.vite.config.ts` (CSP dev); `tests/main/protocol.test.ts`; pacote ignora env de desenvolvimento (smoke com `ELECTRON_RENDERER_URL`). |
| Identidade e perfis independentes | `src/main/profile.ts`, `src/main/index.ts` (appId/AUMID, userData/sessionData, `--foundation-test`); `tests/main/profile.test.ts`; smoke e prova instalada (test vs prod; `--user-data-dir` recusado). |
| Ownership antes do armazenamento | `src/main/index.ts` (single instance lock antes do banco; fechar encerra); smoke (segunda instância sem prova; fechamento sem residual). |
| Prova transacional fictícia | `src/main/foundation-proof.ts` (`node:sqlite`, marcador único, rollback, reopen, fingerprint), `tests/main/foundation-proof.test.ts`; smoke e exe instalado (fingerprint `862191a56034e6d2d67ccf99a08c23e7268778b0db9271d5820cc2f635965d70`). |
| Instalação offline exclusiva por usuário | `build/installer.nsh` + `package.json` (NSIS one-click per-user, asInvoker, sem helper/updater/serviço, ACE AppContainer no root instalado); instalação real sem admin/UAC; ACL conferida (somente `(OI)(CI)(RX)` para `S-1-15-2-1`). |
| Destino efetivo limitado ao usuário | Guards de destino (canonicidade, perfil, reparse, HKCU anterior); recusas com exit 2 sem efeitos; `/D` canônico aceito. |
| Argumentos não ampliam o escopo | `/allusers` recusado isolado/combinado; `/currentuser` e `/S` sob as mesmas restrições; malformados/duplicados recusados (matriz F06). |
| Efeitos registrados somente no usuário atual | `verify:package --installed-root`; escopo verificado: HKCU + atalho do usuário; sem HKLM/Program Files/ProgramData/atalhos públicos/serviços. |
| Manutenção preserva identidade e dados | Upgrade fictício 0.1.0→0.1.1, uninstall e reinstalação com fingerprint estável; desinstalação remove binários/registro/atalhos e mantém `%LOCALAPPDATA%\TaskFlowApp`; destino adulterado recusado (exit 2). |
| Toolchain e dependências reproduzíveis | `package.json`/`package-lock.json` com versões exatas; Node/npm do ambiente fixados; engines/peers/licenças no inventário; `npm ci` limpo; `npm audit` 0. |
| Gates bloqueiam pacote inválido | `npm run lint/typecheck/test/build/validate`; propagação de falha; `verify:package` com testes negativos próprios (`tests/tools/verify-package.test.ts`). |
| Conteúdo runtime restrito e completo | ASAR com 12 arquivos na allowlist; sem `node_modules`/addon/updater/segredos; notices Electron/Chromium; exe x64. |
| Smoke executa integração do pacote | `scripts/smoke-packaged.mjs`: prova, reabertura, segunda instância, fechamento e negativas (payload, preload, ASAR corrompido, hang, override) — 10 PASS. |
| CI produz artefatos internos sem distribuir | `.github/workflows/ci.yml` (Windows, Node/npm/actions por SHA, `permissions: contents: read`, `--publish never`, artefatos com retenção 14 dias, sem assinatura). **Execução pendente (5.4).** |
| Aceitação independente em conta padrão | Matriz F01–F09 no PC autorizado (tabela em `docs/desktop-foundation-validation.md`): F01–F05, F07–F09 PASS; F06 15 PASS + 3 BLOCKED; evidências sanitizadas em `%TEMP%\opencode\tfa002-evidence`. |

## Correctness — cenários não confirmados integralmente

| Cenário | Situação | Causa/registro |
| --- | --- | --- |
| Segunda conta Windows (perfis) e “Outra conta instala o app” | **BLOCKED** | Não existem contas padrão fictícias na máquina (premissa corrigida em 2026-10-04); as contas não-admin presentes são técnicas do sandbox. Criação de conta dedicada autorizada pelo usuário e pendente de execução; task 6.5. |
| Destino padrão com caracteres não ASCII | **BLOCKED** | O destino canônico deste PC não contém espaços/acentos e não há root redirecionado autorizado. |
| Known Folder redirecionado | **Não verificado na prática** | Código recusa fora do perfil/reparse; redirecionar o perfil exigiria alteração administrativa não autorizada. A cadeia local foi conferida (sem reparse). |
| Instalação all-users legada | **BLOCKED** | Exigiria criar HKLM/instalação de máquina (admin); não autorizado e não contornado. |
| Run de revisão da CI | **Confirmado** | Run 37202267073 (PR #2): 12/12 passos success, incluindo gates, `package:win`, `verify:package`, `smoke:packaged`, hashes e upload de artefatos. Hashes do run: Setup `e9d95a0272a536ef9fc801151f48ebaada2746661e9bccb69763494d7180d4af`; asar `c47c2c966c7e2a7c8d368825705be5f841a42895413b1c7dbb7eaeee45f8cbe4`; exe `c84c4d42edbeb5345281506e30a9bcef2105e1e27e5e861a139b5950969fd8c0`. `CI-NOTES.txt` registra o limite do runner administrador. |
| Perfis “não se contaminam” (modo dev) | **Parcial** | test/prod comprovados no pacote/instalado; `npm run dev` não executa neste PC por política de ACL do sandbox, registrada sem contorno. |
| Matriz padrão completa | **Parcial** | F04/F05/F07/F08 executados; subcasos F06 e a segunda conta permanecem BLOCKED. |

## Coherence

- **Design Adherence:** D1 (matriz com G4 revisado para `node:sqlite` embarcado), D2 (shell/protocolo/diagnóstico único), D3 (identidade/perfis/ownership), D4 (NSIS per-user com guards e ACE única), D5 revisado, D6 (gates/CI/smoke), D7 (F01–F09). As duas revisões materiais aprovadas pelo usuário em 2026-10-04 estão refletidas de forma coerente em proposal/design/specs/tasks/docs/roadmap.
- **Code Pattern Consistency:** estrutura `src/main` (+`ipc/`), `src/preload`, `src/renderer`, `src/contracts`; testes espelhando as áreas; scripts `.mjs` de build/verificação; sem `any`; lint/typecheck limpos. Sem desvios relevantes.
- **Segurança/dados:** nenhum segredo, dado real ou credencial em artefatos, logs ou repositório; extensão e seu Git permaneceram somente leitura (nenhuma escrita/build/teste neles); nenhum commit/push/PR/merge/release.

## Issues by Priority

### CRITICAL

1. **Task 6.5 incompleta — prova na segunda conta não executada.** A máquina não contém conta padrão fictícia utilizável; o usuário autorizou criar uma conta dedicada. Recomendação: criar a conta padrão fictícia, executar instalação/diagnóstico/manutenção nela seguindo o runbook e registrar PASS/FAIL/BLOCKED com o isolamento de perfis/registro/atalhos; ou aceitar formalmente a pendência antes do archive.

### WARNING

1. **Premissa de ambiente corrigida:** o registro anterior de “duas contas padrão fictícias” não corresponde à máquina; a prova F04 executada usou token filtrado de conta do grupo Administradores (sem elevação) e **não substitui** uma conta sem participação no grupo. A conta dedicada (6.5) deve cobrir esse critério à risca.
2. **Cenários BLOCKED de F06 e da segunda conta** listados acima permanecem sem evidência prática; não tratar como aprovados.
3. **Modo dev neste PC limitado pela política de ACL** do sandbox; documentado no runbook, sem `--no-sandbox` ou alteração de ACL fora do escopo aprovado.
4. **Identidade provisória:** `CompanyName` usa “TaskFlow App” como placeholder e o pacote não é assinado; finalização em TFA-011.

### SUGGESTION

1. O run de CI emitiu aviso de depreciação do Node 20 nas actions fixadas (executadas forçadas em Node 24); atualizar os SHAs para as majors mais novas em manutenção futura, sem urgência.
2. O aplicativo 0.1.0 permanece instalado no PC de prova (estado final da prova) e o artefato 0.1.1 segue em `release/` para referência; removê-los é decisão do usuário fora desta Change.
3. README factual será atualizado após o archive autorizado (AGENTS.md, item 38); status/datas ficam no roadmap.

## Final Assessment

**1 critical issue found (task 6.5 não concluída).** Corrigir/concluir antes do archive. Não verificados na prática: segunda conta (premissa corrigida), caracteres não ASCII no destino, Known Folder redirecionado e instalação all-users legada; o modo dev neste PC é limitado pela política de ACL (registrado). A CI foi validada com sucesso (run 37202267073) e não substitui a conta padrão. Todo o restante dos 18 requisitos e cenários foi confirmado com testes, inspeção do pacote e prova em conta padrão (token não elevado), sem segredos, dados reais ou alterações na origem. O relatório aguarda **aprovação explícita** para prosseguir ao archive (item 42 do AGENTS.md).
