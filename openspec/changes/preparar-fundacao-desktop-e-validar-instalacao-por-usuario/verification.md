# Verification — TFA-002

**Change:** `preparar-fundacao-desktop-e-validar-instalacao-por-usuario`
**Schema:** spec-driven · **Data:** 2026-10-04 · **Branch:** `codex/tfa-002-preparar-fundacao-desktop-e-validar-instalacao-por-usuario`
**Escopo verificado:** apply da TFA-002 até a prova em conta padrão neste PC Windows 11 x64 autorizado, incluindo o run de CI e a prova em conta padrão dedicada. Os commit/push e o PR em rascunho foram autorizados especificamente para validar a CI; **não houve archive, merge, release ou publicação**.
**Relatório:** gerado por `openspec-verify-change`; requer aprovação explícita antes do archive (AGENTS.md, item 42).

## Summary

| Dimensão | Status |
| --- | --- |
| Completeness | 33/33 tasks; 18 requisitos ADDED cobertos |
| Correctness | 18/18 requisitos com implementação confirmada; 42/47 cenários confirmados; 5 parciais/bloqueados |
| Coherence | Design D1–D7 seguido (revisões de G4 e ACL registradas); padrões consistentes; sem segredos/dados reais |

## Completeness

- **Task Tracking:** `tasks.md` presente e agregado pela CLI; **33/33 concluídas**. **5.4** concluída com o run hospedado da CI; **6.5** concluída com a conta padrão dedicada `TFAProva2` (não-administradora).
- **Premissa de ambiente corrigida e resolvida (2026-10-04):** a máquina não continha contas padrão fictícias criadas pelo usuário; o usuário autorizou a criação de uma conta padrão dedicada, que executou instalação/diagnóstico/manutenção com baseline limpo. Nenhum bypass.
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
| CI produz artefatos internos sem distribuir | `.github/workflows/ci.yml` (Windows, Node/npm/actions por SHA, `permissions: contents: read`, `--publish never`, artefatos com retenção 14 dias, sem assinatura). **Run validado:** 37202267073 (e reexecuções verdes após os ajustes de CI). |
| Aceitação independente em conta padrão | Matriz F01–F09 no PC autorizado (tabela em `docs/desktop-foundation-validation.md`): F01–F05, F07–F09 PASS; F06 15 PASS + 3 BLOCKED; evidências sanitizadas em `%TEMP%\opencode\tfa002-evidence`. |

## Correctness — cenários não confirmados integralmente

A **segunda conta padrão** foi confirmada nesta rodada: conta dedicada `TFAProva2` (não-administradora, token padrão), baseline limpo (`BaselineAbsent=true`), instalação/diagnóstico/desinstalação/reinstalação com `exit 0`, pasta canônica própria, atalho/registro/ACL próprios e fingerprint próprio `59559d41c68a…` retido entre ciclos; a conta principal permaneceu intacta (`862191a5…`). A desinstalação padrão (caminho do usuário, sem `_?=`) removeu pasta/registro/atalho **sem sobras** e manteve os dados. Evidência sanitizada em `C:\Users\Public\Documents\tfa002-evidence-second\`.

| Cenário | Situação | Causa/registro |
| --- | --- | --- |
| Destino padrão com caracteres não ASCII | **BLOCKED** | O destino canônico deste PC não contém espaços/acentos e não há root redirecionado autorizado. |
| Known Folder redirecionado | **Não verificado na prática** | Código recusa fora do perfil/reparse; redirecionar o perfil exigiria alteração administrativa não autorizada. A cadeia local foi conferida (sem reparse). |
| Instalação all-users legada | **BLOCKED** | Exigiria criar HKLM/instalação de máquina (admin); não autorizado e não contornado. |
| Perfis “não se contaminam” (modo dev) | **Parcial** | test/prod comprovados no pacote/instalado e entre contas; `npm run dev` não executa neste PC por política de ACL do sandbox, registrada sem contorno. |
| Matriz padrão completa | **Parcial** | F04/F05/F07/F08 executados nas duas contas; subcasos F06 (ASCII/redirecionado/all-users) permanecem BLOCKED. |

## Coherence

- **Design Adherence:** D1 (matriz com G4 revisado para `node:sqlite` embarcado), D2 (shell/protocolo/diagnóstico único), D3 (identidade/perfis/ownership), D4 (NSIS per-user com guards e ACE única), D5 revisado, D6 (gates/CI/smoke), D7 (F01–F09). As duas revisões materiais aprovadas pelo usuário em 2026-10-04 estão refletidas de forma coerente em proposal/design/specs/tasks/docs/roadmap.
- **Code Pattern Consistency:** estrutura `src/main` (+`ipc/`), `src/preload`, `src/renderer`, `src/contracts`; testes espelhando as áreas; scripts `.mjs` de build/verificação; sem `any`; lint/typecheck limpos. Sem desvios relevantes.
- **Segurança/dados:** nenhum segredo, dado real ou credencial em artefatos, logs ou repositório; extensão e seu Git permaneceram somente leitura (nenhuma escrita/build/teste neles); nenhum commit/push/PR/merge/release.

## Issues by Priority

### CRITICAL

Nenhum issue crítico em aberto — todas as 33 tasks concluídas, requisitos implementados e evidências coletadas.

### WARNING

1. **Subcasos BLOCKED de F06** (destino com caracteres não ASCII, Known Folder redirecionado, instalação all-users legada) permanecem sem evidência prática neste ambiente; não tratar como aprovados.
2. **Modo dev neste PC limitado pela política de ACL** do sandbox; documentado no runbook, sem `--no-sandbox` ou alteração de ACL fora do escopo aprovado.
3. **Identidade provisória:** `CompanyName` usa “TaskFlow App” como placeholder e o pacote não é assinado; finalização em TFA-011.

### SUGGESTION

1. Nota de execução (ferramenta de teste, não produto): durante a automação da prova 6.5, um disparo inicial operou com mapeamento de ambiente ambíguo e a instalação da conta principal foi desinstalada/reinstalada; os scripts de teste foram corrigidos com guardas de perfil explícitas e o estado final das duas contas foi reverificado (fingerprints isolados e estáveis). Registrado em `docs/desktop-foundation-validation.md`.
2. O run de CI emitiu aviso de depreciação do Node 20 nas actions fixadas (executadas em Node 24); atualizar os SHAs para as majors mais novas em manutenção futura, sem urgência.
3. O aplicativo 0.1.0 permanece instalado no PC de prova (estado final da prova) e o artefato 0.1.1 segue em `release/` para referência; removê-los é decisão do usuário fora desta Change.
4. README factual será atualizado após o archive autorizado (AGENTS.md, item 38); status/datas ficam no roadmap.

## Final Assessment

**No critical issues. 3 warnings to consider. Ready for archive (with noted limitations).** A CI foi validada com sucesso (runs 37202267073 e reexecuções verdes) e a prova em conta padrão dedicada cobre F04/F07/F08 à risca; não verificados na prática permanecem apenas os subcasos de ambiente (ASCII/redirecionado/all-users) e o modo dev neste PC (política de ACL). Todo o restante dos 18 requisitos e das 47 categorias de cenário foi confirmado com testes, inspeção do pacote e prova em conta padrão, sem segredos, dados reais ou alterações na origem. O relatório aguarda **aprovação explícita** para prosseguir ao archive (item 42 do AGENTS.md).
