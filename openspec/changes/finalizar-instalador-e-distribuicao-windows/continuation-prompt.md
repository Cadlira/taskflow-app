# Prompt para continuar o opsx-apply da TFA-011

Atualizado em2026-10-08 após task1.3 registrada e procedência dos plugins NSIS
resolvida. Checkpoint por marcos: a ferramenta get_usage_limits não está disponível
nesta sessão OpenCode; atualizar e entregar este prompt ao atingir novamente5%
restante do limite. Não é aprovação de verificação, archive, commit ou distribuição.

Estado: **21/41 tasks**. Task1.3 registrada (subcasos sem Node/npm/offline/Unicode/
logoff/2ª conta permanecem BLOCKED, não PASS). Task4.2 aberta somente pela decisão
humana sobre o SpiderBanner, que não publica licença. Notice NSIS atualizado
(SHA-256 dc9ef68eee69aae1d40f8bf5673a8c268c29ceeea7beee57ca5815d4de00b128);
preview25 mantém o notice anterior (9cdcdfa8…) como histórico. Verificações novas:
testes/tools 9 arquivos/77 testes PASS, eslint, OpenSpec estrito/--all/--archived e
git diff --check PASS. Nenhuma sessão build/Setup/smoke/inspeção ativa. Não repetir
reparo nem legado. Commits do par limpo ainda não autorizados.

---

Continue `$openspec-apply-change` da TFA-011 — finalizar-instalador-e-distribuicao-windows,
somente em C:/QSI/Workspaces/taskflow-app. Não reiniciar a implementação nem repetir
a transição legada já executada. Extensão taskflow-extension estritamente somente
leitura: não executar escrita/build/test/install/Git nela. Não criar subagentes por inferência.

Leia integralmente AGENTS.md, docs/roadmap.md e .agents/skills/openspec-apply-change/SKILL.md.
OpenSpec instalado1.14.0/schema spec-driven: list/status/instructions apply; usar
contextFiles/sourcePath/line retornados. Leia também na Change approval.md,
implementation-review.md (IR1), legacy-transition-review.md (IR2),
silent-uninstall-review.md (IR3), nsis-components-review.md, nsis-build-inspection.md,
validation-protocol.md, campaign-results.md e tasks.md. Os históricos não são o estado atual.

Branch existente codex/tfa-011-finalizar-instalador-e-distribuicao-windows;
HEAD f91ce401c8648a8d0aa984975c72885f9c023ee6. Alterações/untracked TFA-011
preservadas, sem reset/limpeza para simular fonte limpa. Sem commits executados.

Autorizações humanas persistem; não pedir novamente dentro do escopo aprovado:
- Artefatos: “pode aprovar os artefatos”. R1: uso pessoal/controlado sem atribuição empresarial.
- R2/R3/R5/R6/R7: Windows11x64/builds comprovadas; par privado completo0.2.0→0.2.1;
  recusar upgrade direto0.1.0; reter perfil/cache/IA cifrada; unsigned; build local
  rastreável sem upload/distribuição. Resposta: “Está tudo liberado pode implementar”.
- IR1: “Aprovo a revisão e adaptação NSIS proposta”, antes de SetOutPath/sem node_modules.
- R4: somente conta atual, “Pode testar tudo setup/upgrade/uninstall”; não criar conta.
  Segunda conta excluída por decisão humana, não PASS. Logoff/login/powercut não
  autorizados especificamente; ausência de Node/npm e ambiente Unicode/offline não
  comprovados; falhas simuladas somente em fixtures. Subcasos não comprovados ficam
  BLOCKED/dispensa específica, nunca PASS.
- IR2: “Aprovo a transição manual na conta atual e seus limites”; já executada.
- Sem autorização de commit/push/PR/merge/archive/upload/distribuição/CItrigger/TFA-012.

Estado confirmado pela CLI: **21/41** tasks. Concluídas1.1/1.2/1.3/1.4/2.6/2.7/
3.1–3.6/4.1/4.3/4.4/4.5/4.6/5.1–5.4. Demais tarefas continuam abertas. Não reduzir
contratos para fechar checkboxes. Depois do apply concluído, executar skill verify e
produzir verification.md; aprovação explícita do relatório antes de archive.

Pendência material da task4.2 (única): decidir sobre o SpiderBanner, cujo pacote
oficial não publica licença (procedência byte a byte comprovada; limitação explícita
no notice). Aceitar a limitação documentada e marcar4.2, ou manter aberta/BLOCKED.
Não inferir licença e não remover integração/UI sem revisar contrato.

Próximas autorizações necessárias (ainda não concedidas):
1. Decisão humana sobre a limitação do SpiderBanner para concluir a task4.2.
2. Commits do par limpo0.2.0→0.2.1 com hashes distintos, seguidos de
   package/verify/smoke dos dois lados e da campanha W01–W15 no escopo R4;
   sem push/PR/upload por essa autorização salvo pedido explícito.
3. A pergunta antiga sobre executar `/S /allusers` no uninstaller real continua sem
   resposta; o script .tmp/tfa011-tests/probe-uninstall-silent-refusal.ps1 NÃO deve
   ser executado sem autorização específica; não contornar a rejeição por flags,
   processos ou launcher alternativo.

Instalação REAL atual: preview25, versão0.2.0, root per-user canonical do projeto;
Windows11HomeSingleLanguage x64 build26200, não elevado/Administrators ausente/UAC1.
Não abrir prod com dados reais. Perfis prod/test preexistentes preservados; não
sobrescrever test com seed. Não apagar dados/ai.json, restaurar snapshots reais ou
repetir o legado. Atualizar/reparar exige conferir predecessor/canonicalroot/Reader-hash.
O reparo15→25 foi autorizado por R4 e executado após verify/smoke e preflights;
Reader25 conferido igual ao15. Script lido/executado:
.tmp/tfa011-tests/install-preview25.ps1 -Repair, argumentos padrão /S. Esse reparo não
é o payload rejeitado /S /allusers; não usar -Negative nem contornar a rejeição.
Smoke encerrado e preflight de processos passou antes do reparo.

IR3 APPROVED: manter NSIS simples, sem controlador PowerShell novo; retorno do
launcher normal é limitação conhecida de automação. Guardas/retenção/ownership
continuam exigidos; Setup e predecessor executado de cópia verificada com _?=
continuam propagando não zero. Prova isolada: launcher /S retorna0, execução direta
_?= retorna111. Política CurrentUser RemoteSigned/demais Undefined, sem alterações.

Task4.2 — procedência resolvida em2026-10-08 (sem bypass): SpiderBanner996a259e…,
WinShell9be85b98… e nsisunzc31b590c… iguais às DLLs x86-unicode dos pacotes oficiais
zip45c79a02…/34e111f8…/8c2b7ad6…. No notice: licença nsisunz integral (verificada
idêntica ao readme oficial), WinShell “Freeware”/20121005, SpiderBanner sem licença
publicada (wiki/pacote; fórum403). O recurso novo ainda não está no pacote; o par
final limpo deve incorporá-lo. Não resselar stages históricos.

Checkpoint de gates/artefatos:
- Validate25 exit0:108 arquivos/1.411 testes +11 skipped, volume2, lint, cinco
  tipos/build. Package25/verify25 exit0; smoke25 exit0/42PASS. Build-id
  0.2.0-win-x64-f91ce401c8648a8d0aa984975c72885f9c023ee6-nsis-preview-25;
  source dirty SHA-256 2fcf39566c7bf44dbd162603bb77380b741cbe125c1edf20ace55bdcc0c15899;
  Setup b34e6daa…/153.438.809 bytes; Reader f4e13085….
- Validate24-retry exit0:108/1.410 PASS+11 skipped; Preview24 package/verify PASS;
  smoke24 inicial FAIL apenas no heartbeat2.617ms/2.500ms, repetição42PASS/655,4ms,
  falha conservada sem WARN. Fonte dirty INVALID_CANDIDATE_DIRTY_SOURCE nesses previews.
- Novas verificações (mudança do notice/4.2): testes/tools9 arquivos/77 testes PASS
  (logs plugins42-*.log), eslint do script alterado PASS, OpenSpec estrito da Change,
  --all19/19 e --archived10/10 PASS, git diff --check PASS.
- Não alterar/resselar stages históricos; manifests antigos sem campos OS novos não
  satisfazem o validator atual. Preservar contratos/tooling originais dessas evidências.
- Fonte dirty; trusted-predecessors.nsh ainda sem pin do predecessor final. Nenhum
  Setup/par final novo executado após25.

Toolchain: Node24.21.0/npm11.21.0 fixados. PATH começa por .tmp/tfa008-toolchain e
C:/Users/cadli/AppData/Local/Temp/tfa002-node-extract/node-v24.21.0-win-x64.
TEMP/TMP no próprio workspace .tmp/tfa011-tests. Usar `npm exec -- vitest ...`, não
npx global11.19. Aguardas não devem matar app real. Não escrever fonte durante
package: source antes/depois deve ser igual.

Próximo: obter as autorizações acima (começando pela decisão do SpiderBanner e pela
autorização de commits do par limpo), preparar as versões0.2.0→0.2.1 com guarda
segura/hashes distintos, rodar package/verify/smoke dos dois lados e executar a
campanha autorizada W01–W15, mantendo BLOCKED/dispensa o que falta de ambiente/
segunda conta/Unicode/Node/npm/logoff. Monitorar limites de uso e atualizar este
prompt ao chegar a95%.
