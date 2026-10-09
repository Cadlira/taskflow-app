# Inspeção efetiva do NSIS — TFA-011 task 2.6

2026-10-08, preview22 autorizado, versão0.2.0/x64, base
f91ce401c8648a8d0aa984975c72885f9c023ee6, run `nsis-preview-22`.
Fonte dirty: resultado técnico intermediário, sem readiness/distribuição final.
`package:win` e `verify:package` PASS, stage exclusivo selado.

| Artefato | SHA-256 |
| --- | --- |
| Setup | b241b9e79adeea55bfeaeddf9d21d5b73bd90391b5f355ed27a6c9de44132b96 |
| exe | c38a9d5c8e5b58e254ef3b5fcc983c1b6468c7f8472fe12117f5026d7bf0c89a |
| ASAR | 7679d8053b28795cdd0837da2932d5cfa7d841312925029a8783691b7193d30e |
| makensis efetivo | e277b7378931b74392015f5ad6b1d744dcd8a347baa4480350a75ebeab8d8e3d |
| trace da compilação | 56ca76557ddba884521038fc3110c3b18b1618d64f3885e10f38918cd64b34a1 |

O tooling `capture-nsis.mjs` instrumenta exclusivamente a CLI fixada e captura
uma invocação real do compilador com `-V4 -OUTPUTCHARSET UTF8`. Não edita
node_modules. Defines/comandos/script de entrada e trace bruto permanecem somente
no stage local ignorado; seus hashes e o relatório sanitizado são incorporados
ao `manifest.json` selado. `prepare-nsis.mjs` confere os sete templates upstream
por hash antes de gerar seis adapters versionados; snapshot de fonte antes/depois
igual vincula fonte/includes ao build. NSIS3.0.4.1/resources3.4.1 conservados.

Ordem observada após expansão das macros/includes:

1. `.onInit`: cálculo de espaço → `SetRegView 64` → shell current/
   installMode CurrentUser → mutex → customInit expandido em destination,
   identity, processes e predecessor. Nenhum SetOutPath/mutação persistente nesse
   hook. Known Folders são consultados sem criação.
2. Seção install: identity/processes/predecessor antes da manutenção anterior;
   destination/identity/processes repetidos antes de `SetOutPath $INSTDIR` e
   extração. Manifest PE efetivo `asInvoker`, `uiAccess=false`.
3. `uninstallOldVersion`: copia apenas o uninstaller próprio validado para
   temporário; revalida processes/predecessor, inclusive hash da cópia; um único
   `ExecWait` com `/S /KEEP_APP_DATA`, flags preservados e `_?=$installationDir`.
   Sem retry/fallback; retorno/erro interrompem a instalação. Isso verifica a
   ordem compilada, sem alegar que todos os casos de corrida já foram executados.
4. `un.onInit`: `SetRegView 64` → shell current/installMode CurrentUser →
   customUnInit expandido em destination/identity/processes → diálogo ou nova
   consulta de processos. A seleção Registry64 precede customUnInit; nenhum
   SetOutPath/initMultiUser/criação de Known Folder nesse hook.
5. Seção un.Uninstall: destination/identity/processes precedem cleanup; ownership
   é revalidado no adapter. Sem wipe de dados. Ausência de kill e elevação
   confirmada nas instruções efetivas, não só nos branches da fonte.

Plugins efetivamente incorporados: SpiderBanner, StdUtils, System, WinShell,
nsExec e nsisunz, DLLs x86/hash registrados. Os exports disponíveis do compilador
não são prova de incorporação. Cinco DLLs têm evidência File→$PLUGINSDIR no trace;
StdUtils reduz verbosity dentro do helper de parâmetros, cuja expansão foi
revisada e fixada pelo hash
e68d1bf7e4afd258b601346b833bf064285213d8f481caa900a1430cdabee275.
O relatório distingue essas procedências. Revisão de licenças é task4.2 separada.

NSIS3.0.4.1 omite RequestExecutionLevel no trace -V4: nesse caso o parser exige
o manifest PE do Setup realmente compilado. Linha admin explícita é recusada.
11 testes do parser PASS, incluindo ordem, mutação em init, kill/elevação,
predecessor ausente/retry e plugin exportado sem uso. Tentativa -PPO e previews
não selados permanecem registrados em campaign-results.md; não foram promovidos.
