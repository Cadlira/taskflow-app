# Prompt para continuar o opsx-apply da TFA-011

Atualizado em2026-10-09 (após correção do guard `/currentuser` e reconstrução do
candidato B′). Checkpoint por marcos: `get_usage_limits` não está disponível nesta
sessão OpenCode; atualizar/entregar este prompt ao atingir novamente5% restante.
Não é aprovação de verificação, archive ou push.

Estado: **25/41 tasks**. Par limpo construído e em campanha:
- A 0.2.0: commit `5a11c6f29670e702e95d9ab1f64e89feed84d15d`; Setup c7d22b05…,
  build-id `0.2.0-win-x64-5a11c6f…-pair-020b`.
- B 0.2.1 (inicial): commit `1152e1b7…`; Setup144d413b… — **histórico/superseded**.
- B′ 0.2.1 (corrigido): commit `1195277df63579aa244b0b76b8d889e112929594`; Setup
  f10c308e59fe670d8124314faa338d1d44015326b0d01719a975b2234ac9df17; build-id
  `0.2.1-win-x64-1195277…-pair-021-fix`; Reader6e34919d…; **instalado e reparado**.
Commits não enviados; sem push/PR/archive/upload/CI/TFA-012. As evidências escritas
depois do commit C estão **não commitadas** (campaign-results/approval/roadmap/tasks/
prompt) — precisarão de commit de documentação quando autorizado.

Progresso da campanha: W04 14/14 casos corretos no B′ (inclui `/currentuser=bad` e
`/currentuserX` recusados após fix; `/D` canônico e `/currentuser` válidos aceitos;
binários/dados intactos). W05 parcial: Setup /S com app visível recusa111 sem kill;
uninstall /S recusa efetiva (launcher0 pela limitação IR3); encerramento simulado
por sessão OK; reparo após Sair exit0. W12 parcial: uninstall normal (interface) +
`/S` + reinstall do B′ com retenção byte a byte e startup OFF. HKCU
`InstallLocation` inválido simulado e restaurado: recusa100 sem mutação. Upgrade
A→B′ exit0/52s e reparo exit0/47s com dados/ACL intactos. Smoke B′: FAIL inicial só
no heartbeat10.000=3.902ms/2.500ms; repetição integral42 PASS/966ms — falha inicial
conservada, sem WARN. Simulações complementares no B′: versão futura129;
UninstallString estrangeiro131; predecessor unpinned131 preservando bytes; app na
bandeja recusa111; instaladores concorrentes (0/2); identidade instalada conferida;
startup ON preservado no reparo e OFF mantido; segundo lançamento único; snapshot
lógico do perfil test vazio (sem semear).

---

Continue `$openspec-apply-change` da TFA-011 — finalizar-instalador-e-distribuicao-windows,
somente em C:/QSI/Workspaces/taskflow-app. Não reiniciar a implementação nem repetir
a transição legada já executada. Extensão taskflow-extension estritamente somente
leitura. Não criar subagentes por inferência.

Leia integralmente AGENTS.md, docs/roadmap.md e .agents/skills/openspec-apply-change/SKILL.md.
OpenSpec1.14.0/schema spec-driven: list/status/instructions apply; usar
contextFiles/sourcePath/line. Ler na Change approval.md, implementation-review.md,
legacy-transition-review.md, silent-uninstall-review.md, nsis-components-review.md,
nsis-build-inspection.md, validation-protocol.md, campaign-results.md e tasks.md.
Os históricos não são o estado atual.

Autorizações humanas persistentes: “pode aprovar os artefatos”; R1 uso pessoal/
controlado; “Está tudo liberado pode implementar” (R2/R3/R5/R6/R7); IR1/IR2/IR3
aprovadas; R4 somente conta atual (“Pode testar tudo setup/upgrade/uninstall”);
“1 - Aceita a limitação documentada” (4.2); “2 - autorizado” (commits do par,
package/verify/smoke dos dois lados e campanha W01–W15 no escopo R4); “Pode
continuar” (após o achado W04, autorizou a continuação que produziu o fix do
`/currentuser` e o B′). Sem autorização de push/PR/merge/archive/upload/
distribuição/CI/TFA-012.

Ambiente e armadilhas aprendidas nesta sessão (OBRIGATÓRIO):
- O host exporta `npm_config_user_agent=npm/undefined node/v26.3.0…` e o guard de
  toolchain do package falha; executar `unset npm_config_user_agent` antes de
  qualquer `npm.cmd run`/`npm exec` na mesma shell.
- `Start-Process -ArgumentList @('/S','/D=…')` insere espaço após `/D=` (artefato);
  para `/D` usar argumento único `'/S /D=<destino>'`.
- App instalado: abrir com `--foundation-test` (perfil test; nunca abrir prod);
  encerrar graciosamente por `WM_QUERYENDSESSION` (simulação registrada), nunca
  kill. Abrir o app altera somente `session-data` (cache) do perfil test.
- Scripts de campanha em `.tmp/tfa011-tests`: `pair-manage.ps1`, `pair-guards.ps1`,
  `pair-negatives.ps1`, fixture `nsis-insttest`, logs `pair-*.log`.
- Toolchain fixada Node24.21.0/npm11.21.0: PATH com `.tmp/tfa008-toolchain` e
  C:/Users/cadli/AppData/Local/Temp/tfa002-node-extract/node-v24.21.0-win-x64;
  TEMP/TMP em `.tmp/tfa011-tests`.
- Instalado atualmente: **B′ 0.2.1** (registro0.2.1, Reader6e34919d…), atalho
  presente, sem processos. Perfis prod/test preexistentes preservados; não semear
  test; não apagar ai.json; não repetir legado.

Próximos passos da campanha (sem ampliar autorização):
1. W12: uninstall normal (interface) e `/S` do B′, reinstall e verificação de
   retenção/atalho/startup OFF; segunda conta BLOCKED (excluída por decisão humana).
2. W09/W11 parciais: retenção lógica (snapshot somente leitura de DTOs do perfil
   test; não é permitido semear) e startup ON/OFF/desabilitado externamente com
   readback; tray/Quick Add/cópia com foco externo/toast/COM exigem gesto humano —
   registrar o que for automatizável e manter o restante como pendência humana
   visível, sem PASS inferido.
3. W13: falhas simuladas em fixtures (ACL/espaço/extração/registro/DB corrupto/
   futuro/preferências/PowerShell), sem cortar energia e sem tocar componentes
   globais.
4. W15: revisar guia com resultados e limites; depois `openspec-verify-change` e
   `verification.md` na Change para aprovação humana antes de archive.
5. Pendências BLOCKED/dispensa específica que NÃO viram PASS: ausência de Node/npm,
   offline, Unicode/espaços por conta, segunda conta, logoff/login real, powercut,
   Known Folder redirecionado, HKLM/reparse instalados. A pergunta antiga sobre
   `/S /allusers` no uninstaller real continua sem resposta — não executar esse
   payload nem contornar a rejeição.
6. Commit de documentação/evidência pendente quando autorizado (a árvore está
   suja apenas com docs da campanha desde o commit C; fonte de produto limpa nos
   commits A/B/C).
