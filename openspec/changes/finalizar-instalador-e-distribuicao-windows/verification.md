# Verificação — TFA-011

Data: **2026-10-09**. Change: `finalizar-instalador-e-distribuicao-windows`, schema `spec-driven`,
OpenSpec **1.14.0** (raiz local, sem store). Branch
`codex/tfa-011-finalizar-instalador-e-distribuicao-windows`, base `f91ce401c8648a8d0aa984975c72885f9c023ee6`.
Implementação, par limpo e campanha autorizados pelas respostas registradas em
[approval.md](approval.md) (“pode aprovar os artefatos”; “Está tudo liberado pode implementar”;
“Aprovo a revisão e adaptação NSIS proposta”; “Aprovo a transição manual na conta atual e seus
limites”; “Sim, aprovo” (IR3); “1 - Aceita a limitação documentada”; “2 - autorizado”; “Pode
continuar”; “Pode commitar e continue com o apply”).

A extensão `C:\QSI\Workspaces\taskflow-extension` e seu Git permaneceram **estritamente somente
leitura**; nenhum build/teste/instalação/escrita foi executado nela. **Sem push/PR/merge/archive/
upload/distribuição/CI/TFA-012** nesta etapa.

**Resultado para revisão: implementação, par limpo 0.2.0→0.2.1 (com correção do guard de
`/currentuser`) e campanha no limite do ambiente/autorização concluídos. Com esta entrega são
28/41 tasks; 13 permanecem abertas com pendências detalhadas abaixo — itens de ambiente
(ausência de Node/npm, offline, Unicode), gesto humano (nativos/visual) e subcasos sem simulação
instalada segura (Known Folder redirecionado, HKLM, ownership ACL, injeções). Nenhum PASS foi
herdado de previews/histórico; a falha inicial do smoke do B′ (heartbeat) foi conservada sem
conversão em WARN.**

## Scorecard

| Dimensão | Resultado |
| --- | --- |
| Completude | **28/41 tasks** com esta entrega; **13 abertas** (2.1–2.5 e 7.1–7.8) com pendência específica registrada na seção própria. Cobertura documental: **12 requisitos ADDED/MODIFIED** (7 em `desktop-build-validation`, 5 em `windows-per-user-installation`) e **61 cenários** (31+30) mapeados na tabela de aderência. |
| Correção | 12/12 requisitos com implementação identificada e evidência ligada ao candidato **B′** onde executável (W01–W05/W08/W09/W12/W14/W15); cenários de integração nativa/visual e de credencial instalada ficam pendentes/BLOCKED, explicitamente fora do que foi comprovado. Nenhum requisito REMOVED/RENAMED. |
| Coerência | D1–D10 revisados contra configuração NSIS, scripts, main, testes e documentação: NSIS per-user one-click, guardas antes de `SetOutPath`/cleanup, sem kill/elevação/updater/serviço, retenção integral, unsigned (R6), sem dependências novas; pin do predecessor por Reader-hash; contratos e padrões preservados. |

Foram lidos proposal, design, os dois deltas e tasks pelos paths de `openspec instructions apply`.
O tracking está configurado e legível. `openspec status` indica artefatos de planejamento completos,
não implementação integral. Sem `skip_specs`.

## Candidatos e evidência do par

| Versão | Commit | Build-id | Setup SHA-256 | exe / ASAR | Reader |
| --- | --- | --- | --- | --- | --- |
| A 0.2.0 (predecessor) | `5a11c6f29670e702e95d9ab1f64e89feed84d15d` | `0.2.0-win-x64-5a11c6f…-pair-020b` | `c7d22b05ed8dcdfe21c9920c0db65abbfc8d9fc65947a8584901dfd2ed5ad3ac` (153.440.379 bytes) | `febcdd3a…` / `a585d0d9…` | `f4e13085…` |
| B 0.2.1 (histórico/superseded) | `1152e1b7…` | `…-pair-021` | `144d413bed9508499c423859ad779468a5e30f8a6e57e130e4faf71d468e70c7` | `134ffcd2…` / `949fca08…` | `893151d6…` |
| **B′ 0.2.1 (candidato atual)** | `1195277df63579aa244b0b76b8d889e112929594` | `0.2.1-win-x64-1195277…-pair-021-fix` | `f10c308e59fe670d8124314faa338d1d44015326b0d01719a975b2234ac9df17` (153.440.928 bytes) | `134ffcd2…` / `949fca08…` | `6e34919d…` |

Evidência detalhada em [campaign-results.md](campaign-results.md). Stages selados preservados em
`release/candidates` (ignorado); nenhum histórico foi alterado/resselado. O B permanece como
histórico após a correção do guard `/currentuser` (commit `1195277`, com teste estrutural de
regressão).

## Gates executados

Runtime fixado **Node 24.21.0 / npm 11.21.0**; Electron 44.5.1, Chromium 152.0.7977.130,
SQLite 3.53.4; NSIS 3.0.4.1/resources 3.4.1. Sem instalação de dependências, sem force/
`legacy-peer-deps`, sem atualização de matriz. Armadilha do host registrada: o ambiente exporta
`npm_config_user_agent` estaleiro e exige `unset` antes dos scripts npm (guard de toolchain).

| Comando | Evidência / resultado |
| --- | --- |
| `npm run validate` (commits A, B, B′) | Exit 0 nos três: lint sem warnings; cinco typechecks; **108 arquivos / 1.411 testes + 11 skipped** (A/B) e **1.412 + 11** (B′, inclui o teste de regressão); volume **2 testes**; build das entradas. |
| `openspec validate <change> --type change --strict` | Change válida (exit 0). |
| `openspec validate --all --strict` | **19/19** itens válidos, zero falha. |
| `openspec validate --archived --strict` | **10/10** Changes arquivadas válidas. |
| `npm run package:win -- --run <id>` | A: exit 0 (`pair-020b`); B′: exit 0 (`pair-021-fix`). Fonte limpa nos commits (source `clean:true`; sha A `82816930…`, B′ `aeedf467…`). O run `pair-020` não selado ficou preservado como histórico de falha de toolchain. |
| `npm run verify:package -- --stage <id>` | A/B′: exit 0 — ASAR na allowlist, Setup stub x86 com payload x64, três manifests `asInvoker/uiAccess=false`, inventário/notices conferidos; B′ também conferido com `--installed-root` após instalação. |
| `npm run smoke:packaged -- --stage <id>` | A/B: **42 PASS**. B′: **FAIL inicial apenas no heartbeat 10.000 = 3.902,2 ms / limite 2.500 ms**; repetição integral dos mesmos bytes/flags/limites **exit 0 / 42 PASS** (heartbeat 966,4 ms). Falha inicial conservada, causa não isolada. |
| `git diff --check` | Exit 0 (aviso LF/CRLF é comportamento pré-existente da configuração). |

## Aderência requisito → cenário → task/W → evidência

### Delta `desktop-build-validation` (7 requisitos: 3 MODIFIED + 4 ADDED; 31 cenários)

| Requisito | Cenários | Implementação e evidência (candidato B′ salvo indicação) | Status / limites |
| --- | --- | --- | --- |
| Conteúdo runtime restrito e completo (M) | Inventário do pacote; ACL do runtime; Cobertura integral; Notices; Arquivo/conteúdo fictício; Diagnóstico test-only; Componente do Windows indisponível | `verify:package`/`payload-inventory` (allowlist ASAR, negativas de nome/conteúdo/ASAR externo); inventário recursivo e bytes conferidos instalados; notices NSIS `dc9ef68…` com procedência oficial; ACE AppContainer `(OI)(CI)(RX)` só no root (pai/dados sem ACE); handler de fundação restrito a test (testes prod/dev recusam). | PASS automatizado; visual/DPI e PowerShell ausente instalado não exercitados (ver 7.6/7.8). |
| CI produz artefatos internos sem distribuir (M) | Run de revisão; Limite de CI; Bundle rastreável; Seleção ausente/ambígua | Workflow atualizado para candidato exato por build-id, `--publish never`, actions por SHA, `contents:read`, sem upload (R7); seleção exata selada e falha em ausente/duplicado/divergente. | PASS local/documental; **CI não disparada** (R7) e runner administrador não substitui conta padrão. |
| Aceitação independente em conta padrão (M) | Matriz padrão; Ambiente/execução bloqueados; Proteção da origem/dados; Campanha do produto final; Prova anterior/simulada; Candidato alterado | Campanha parcial no B′ na conta atual (W01–W05/W08/W09/W12/W14/W15 conforme seções abaixo), dados fictícios quando aplicável, extensão intocada; histórico/waives não usados como PASS; qualquer mudança de bytes exige reteste (pin e seleção exata). | **Parcial**: offline/sem Node-npm, Unicode, segunda conta, logoff real e gestos humanos pendentes/BLOCKED; não declarar homologação. |
| Artefato tem identificação e proveniência verificáveis (A) | Construção rastreável; Saída reutilizada; Par de manutenção; Integridade alterada; Reconstrução funcional | Manifesto com versão/commit/estado da fonte/run/toolchain/runtime/SQLite/NSIS/checksums/lock/inventário/notices/ícones/manifests; 23 testes de proveniência e 15 de seleção; par A→B′ com pin por Reader-hash; adulteração reprova; Setup não é prometido byte-a-byte. | PASS; reconstrução do MESMO commit não executada (limite declarado); divergências de timestamp esperadas. |
| Identidade visual é conservada no pacote final (A) | Ícones íntegros e legíveis; Ícone ausente ou inválido | Master SVG→ICO 16/24/32/48/256; frames/hashes iguais em exe/Setup/Reader (PE22 e verify do B′); negativas de ícone ausente/corrompido. | Integridade PASS; **prova visual claro/escuro/DPI pendente (humana)**. |
| Integrações nativas são provadas no candidato instalado (A) | Bandeja captura e atalhos reais; Segunda instância e toast; Inicialização opcional | Segundo lançamento único verificado (segundo sai, primeiro vivo, sem residual); startup ON simulado preservado no reparo e OFF mantido; tray/Quick Add/cópia com foco/toast/COM exigem gestos humanos. | **Parcial/pendente humano** (7.5); logoff real não autorizado (simulação separada). |
| Entrega manual tem guia e estado de assinatura verdadeiros (A) | Guia fiel; Candidato não assinado; Assinatura exigida; Revisão não é publicação | `docs/windows-installation-and-maintenance.md` revisado com matriz de evidência/limites do B′; unsigned (R6) com bloqueios possíveis sem contorno; nenhum upload/release. | PASS documental; assinatura futura exige revisão própria (não acionada). |

### Delta `windows-per-user-installation` (5 requisitos: 2 MODIFIED + 3 ADDED; 30 cenários)

| Requisito | Cenários | Implementação e evidência (candidato B′) | Status / limites |
| --- | --- | --- | --- |
| Destino efetivo limitado ao usuário (M) | Não ASCII; Override equivalente; Override fora; InstallLocation anterior; Known Folder redirecionado; Known Folder divergente | `/D` canônico aceito (exit0/43s) e externo/duplicado/vazio/relativo recusados (100); HKCU `InstallLocation` inválido simulado recusa 100 e é restaurado; resolver exige UserProgramFiles≡LocalAppData\Programs, sob o perfil e sem reparse. | **Parcial**: perfil com espaços/Unicode não disponível; Known Folder redirecionado e divergente sem simulação instalada segura (NOT_RUN/BLOCKED). |
| Manutenção preserva identidade e dados (M) | Atualização manual fictícia; Desinstalação/reinstalação; All-users legada; Identidade/notificações/cleanup; Atualização entre versões completas; Retenção integral; Startup em upgrade; Credencial fictícia retida | Upgrade A→B′ exit0/52s e reparo exit0/47s com dados byte a byte e ACLs intactas; uninstall normal e `/S` + reinstall com dados retidos e startup OFF; startup ON simulado preservado e **desativação externa (StartupApproved) preservada no reparo**; cleanup próprio (atalho/registro) sem tocar estrangeiros; legado literal 0.1.0 já removido (histórico, sem PASS). | **Parcial**: credencial fictícia instalada/DPAPI pós-manutenção não executada (perfil test vazio; semear proibido); perfil com Unicode pendente. |
| Manutenção exige encerramento seguro (A) | App aberto/oculto; Silencioso com app ativo; Detecção indisponível/incerta; Saída explícita; Processo reabre entre fases; Predecessor sem garantia; Predecessor seguro | App visível, oculto na bandeja e com **duas superfícies** (harness de UI em perfil fictício) → Setup `/S` recusa **111** sem kill; uninstall `/S` e **uninstaller direto com `_?=`** recusam (111; launcher normal 0 = limitação IR3 aprovada); **predecessor A de cópia verificada com `_?=` retorna 129** sem remover; reparo após Sair exit0; predecessor unpinned recusado **131** preservando bytes; compatível aceito com pin; concorrentes 0/2. | **Parcial**: commit/job/IA em voo/relay, timeout/consulta incerta e corrida durante a remoção do predecessor seguro pendentes. |
| Identidade preexistente é validada antes de substituição (A) | Identidade estável; Cadastro estrangeiro/futuro; Ownership muda | InstallLocation/UninstallString/atalho/target conferidos; versão futura → **129**; UninstallString estrangeiro → **131** (valores restaurados); bytes preservados. | **Parcial**: mudança de ownership ACL e registro CLSID/COM do perfil prod não exercitados (prod não aberto por regra). |
| Recuperação e remoção de dados são explícitas (A) | Falha depois do início; Reparo de binários; Banco/configuração não reconhecidos; Recuperação seletiva; Downgrade; Exclusão manual | Reparo pela mesma versão íntegra PASS; walkthrough seletivo em fixtures (SQL2/codec4/markers/shortcuts/auxiliares, sem ai.json, SQL1 recusa SQL2) e testes de recuperação; guia de exclusão manual revisado (não executada). | PASS em fixtures; **injeções instaladas de falha (extração/ACL/registro) pendentes (7.8)**; nenhuma promessa de rollback. |

## Pendências por task aberta (não marcar como comprovado)

| Task | Estado | Pendência específica | Como fechar |
| --- | --- | --- | --- |
| 2.1 | PARCIAL | Known Folder redirecionado/divergente, HKLM e reparse sem simulação instalada segura (redirecionar Known Folder/HKLM exige alteração de sistema/admin, não autorizada). | Dispensa humana específica ou ambiente/snapshot autorizado. |
| 2.2 | PARCIAL | Commit/arquivo/IA em voo, relay COM e consulta incerta/timeout durante a manutenção. | Harness/fixture autorizado ou dispensa. |
| 2.3 | PARCIAL | Mudança de ownership ACL antes do cleanup e cadastro CLSID/COM prod (prod não aberto). | Ambiente autorizado ou dispensa. |
| 2.4 | PARCIAL | Corrida “processo surge durante a remoção do predecessor seguro” (propagação direta com `_?=` já comprovada: 111/129). | Fixture/harness ou dispensa. |
| 2.5 | PARCIAL | Injeções de falha (extração/ACL/registro/espaço) e reabertura entre fases em cópias fictícias. | Fixtures autorizados (7.8) ou dispensa. |
| 7.1 | BLOCKED | Destino offline sem Node/npm e perfil com espaços/Unicode. | Ambiente autorizado ou dispensa (não PASS). |
| 7.2 | PARCIAL | Known Folder/HKLM/legado literal/ownership na matriz instalada. | Idem 2.1/2.3 ou dispensa. |
| 7.3 | PARCIAL | Commit/jobs/relay e reabertura entre fases na guarda instalada. | Harness/fixture ou dispensa. |
| 7.4 | PARCIAL | Fixtures lógicas instaladas (perfil test vazio; semear proibido) e IA protegida pós-manutenção. | Decisão sobre perfil de prova ou dispensa. |
| 7.5 | PENDENTE HUMANO | Gestos nativos (tray/Quick Add/cópia com foco externo/toast/COM) e logoff real (excluído). | Execução humana autorizada ou dispensa. |
| 7.6 | PENDENTE HUMANO | Prova visual claro/escuro × DPI 100/150/200%. | Execução humana ou dispensa. |
| 7.7 | PARCIAL/BLOCKED | Credencial fictícia retida no perfil instalado/DPAPI pós-manutenção; segunda conta excluída por decisão humana. | Decisão sobre credencial/perfil ou dispensa específica (não PASS). |
| 7.8 | PARCIAL | Injeções instaladas de falha em fixtures/snapshot autorizados (algumas coberturas são históricas/de teste). | Fixtures autorizados ou dispensa. |

Notas de correção aplicada durante a campanha: o guard `/currentuser` passou a exigir token exato
(commit `1195277`); o `/D` canônico recusado no primeiro harness era artefato de invocação
(`Start-Process` inseria espaço), comprovado por fixture NSIS e corrigido no procedimento — nenhum
modo inseguro observado.

## Decisões humanas necessárias

1. **Aprovar ou reprovar este relatório.** Archive, consolidação de specs e README final só após
   aprovação explícita (AGENTS.md 42/43) e autorização própria.
2. **Dispensas (waivers) ou ambiente adicional** para as 13 tasks abertas acima. Sem isso, elas
   permanecem abertas e o archive não deve ocorrer; nenhuma dispensa foi inferida.
3. A pergunta antiga sobre executar `/S /allusers` no uninstaller real continua sem resposta e
   **não foi executada**; a exceção IR3 não depende dela.

## Próximo passo

Entrega para **revisão humana** com as decisões acima. Após aprovação (e eventuais dispensas), a
sequência autorizável é: archive na mesma branch, consolidação dos dois deltas, atualização do
README conforme o item 38 do AGENTS.md, registro no roadmap e commit final — cada passo mediante
autorização correspondente. Push/PR/merge/distribuição e TFA-012 permanecem fora do escopo.
