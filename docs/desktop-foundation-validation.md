# Validação da fundação desktop — TFA-002

**Atualizado:** 2026-10-04
**Estado:** fundação implementada (shell isolado, fronteiras, perfis, prova `node:sqlite`), pacote 0.1.0 empacotado/inspecionado e smoke do pacote aprovado neste PC autorizado. Prova em conta padrão (F04–F07), manutenção e CI executada continuam pendentes; nada foi arquivado, integrado, publicado ou distribuído.
**Ambiente de build:** Node.js 24.21.0 oficial Windows x64 em diretório temporário, npm 11.21.0 instalado isoladamente e executado com esse Node. O shell global (Node 22/npm 10) não foi usado para build/install do app.

## Decisões aprovadas na retomada — 2026-10-04

- **G4 revisado — driver da prova:** o rebuild do `better-sqlite3 12.11.1` para Electron 44.5.1 exige MSVC, ausente neste PC (instalação exigiria elevação, não autorizada), e não há prebuilt para o ABI 149 (a v12.12.0 da mesma biblioteca chega ao ABI 148; a linha v13.x não publica prebuilds Electron). O usuário aceitou explicitamente o **`node:sqlite` embarcado** no Electron 44.5.1, com a API release candidate (1.2) aceita de forma consciente. Disponibilidade verificada no runtime fixado (`ELECTRON_RUN_AS_NODE=1`, `DatabaseSync` com create/write/read); a prova que vale é a do pacote/smoke. Sem fallback automático, sem addon externo, sem compiladores no build ou no destino.
- **ACL do smoke:** a ACE de leitura/execução para `S-1-15-2-1` (herdável `(OI)(CI)(RX)`) pode ser concedida **somente à cópia temporária de teste criada pelo `smoke:packaged`**, nunca a pais, dados/perfis do usuário, roots globais ou outros diretórios. O instalador continua concedendo a ACE somente ao root canônico instalado `TaskFlowApp`. Nenhum modo inseguro (`--no-sandbox`) é usado.
- Registro completo das aprovações: [roadmap](roadmap.md), seção TFA-002.

## Gates locais executados

`npm run validate` (Node 24.21.0/npm 11.21.0) passou em 2026-10-04: ESLint 9.39.5 sem warnings, typecheck nos cinco projetos separados (`tsc` para contracts/main/preload/tests e `vue-tsc` para renderer), Vitest com 7 arquivos/32 testes e `electron-vite build` dos entrypoints main/preload/renderer. O `npm ci` limpo já havia passado duas vezes; a revisão de dependências (G4) usou `npm install` com `engine-strict`, `strict-peer-deps` e `strict-allow-scripts`, sem `--force`/`--legacy-peer-deps`; `npm ls` não reportou peers inválidos e `npm audit` ficou em 0 vulnerabilidades (`http-cache-semantics` elevado de 4.2.0 para 4.3.0 dentro do range permitido; é dependência transitiva de build do downloader do Electron, não entra no pacote). Scripts de instalação permitidos: `esbuild@0.25.12` e `esbuild@0.28.2`; `electron-winstaller` negado; não há mais script/rebuild de driver.

### Comandos reproduzíveis

Usar Node.js **24.21.0** e npm **11.21.0** do ambiente temporário registrado acima; `package.json` e `.nvmrc` fixam essas versões. Na raiz `C:\QSI\Workspaces\taskflow-app`:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run validate
npm run dev
npm run package:win
npm run verify:package
npm run smoke:packaged
```

`validate` conecta lint, typecheck, testes e build com `&&` e propaga o primeiro código de falha (verificado em 2026-10-03 com fixture inválida). `package:win` executa build, geração do ícone e electron-builder NSIS x64 com `--publish never`; `verify:package` inspeciona o pacote e `smoke:packaged` copia o pacote para um diretório temporário de teste, concede a ACE aprovada somente a essa cópia e executa o exe com o perfil test. Em 2026-10-04, `lint`, `typecheck`, `test`, `build`, `validate`, `package:win`, `verify:package` e `smoke:packaged` passaram.

## Pacote 0.1.0 — evidência (não assinado)

- `npm run package:win` passou com electron-builder 26.17.0 (NSIS one-click exclusivo per-user, `--publish never`). Artefato não assinado, conforme G6.
- Setup: `release/TaskFlowApp-0.1.0-win-x64-Setup.exe`, 120.041.452 bytes, SHA-256 `d6313e572573f9c58f3732f29bc5a44ddb5641263eb6bcd55a071dec609f1da7` (reconstruído após os ajustes das guardas). O exe e o ASAR internos são determinísticos entre builds (hashes acima); o Setup muda de hash a cada reconstrução por metadados do próprio empacotamento.
- `release/win-unpacked/TaskFlowApp.exe`, 245.726.208 bytes, SHA-256 `9118c418fc72b6ff63df804d12b7531a5609a961626121d2ccda940313523065`.
- `release/win-unpacked/resources/app.asar`, 224.173 bytes, SHA-256 `a9418cd17881d6a1925e839e2f03076918fc61b316975c7d05c8318288a5999a`.
- `npm run verify:package` OK: ASAR com 12 arquivos dentro da allowlist (`out/**`, `package.json`, `LICENSE`), sem `node_modules`, addon nativo, updater, segredos, elevate helper, testes ou devtools; `resources/` contém apenas `app.asar` (sem `app-update.yml`, obtido com `publish: null`); `TaskFlowApp.exe` x64 com manifest `asInvoker`/`uiAccess=false`; Setup com stub NSIS x86 e payload x64, manifest `asInvoker`/`uiAccess=false`; notices de runtime `LICENSE.electron.txt` e `LICENSES.chromium.html` presentes.
- Identidade: productName `TaskFlow App`, executable `TaskFlowApp.exe`, appId/AUMID `taskflow.app`, versão `0.1.0`; FileVersion 0.1.0 e CompanyName placeholder `TaskFlow App` (identidade final e assinatura ficam para TFA-011; não se afirma publisher/domínio).
- As bibliotecas do renderer (Vue/Pinia/devtools-api) são empacotadas pelo bundle do electron-vite e permanecem em `devDependencies` de propósito: por isso o pacote não carrega `node_modules`. O único auxiliar de build adicionado ao lockfile nesta revisão é `@electron/asar` 3.4.1 (MIT, dev), usado por `verify:package` para listar/extrair o ASAR.

## Evidência de AppContainer e smoke do pacote

O primeiro `npm run dev` (2026-10-03) compilou main/preload/renderer e chegou a iniciar o Electron, mas o sandbox do Electron 44.5.1 abortou com `FATAL ... install_dir_access.cc` porque o diretório de build (`node_modules/electron/dist`) não concede leitura ao SID `ALL APPLICATION PACKAGES`. O próprio Electron documenta a correção (`icacls ... /grant *S-1-15-2-1:(OI)(CI)(RX)`).

Em 2026-10-03 o usuário aprovou conceder essa ACE somente ao root instalado canônico `TaskFlowApp` (instalador) e, em 2026-10-04, estendeu a aprovação somente à cópia temporária de teste do `smoke:packaged`. O smoke aprovado cobre, com PASS: prova SQLite e recusas de payload no renderer; banco no perfil test; segunda instância encerrando sem prova/escrita; perfil prod intocado; reabertura conservando o fingerprint `862191a56034…`; override de perfil/caminho via `--user-data-dir` recusado; fechamento da janela sem processo residual (exit 0); preload ausente reprovado (`BRIDGE_UNAVAILABLE`); ASAR corrompido reprovado (exit 1); hang reprovado por timeout. A limpeza atinge somente os processos/pastas de teste criados; o perfil test do app permanece por política de retenção.

O launch a partir de `node_modules`/`release` sem a ACE continua indisponível **por política** neste PC (não é contornado); a verificação da janela real usa o exe instalado (seção 6) e o smoke com cópia de teste aprovada. `npm run dev` é documentado como limitado neste PC; em outra máquina/CI, o smoke concede a ACE somente à sua própria cópia.

## Ambiente G1 autorizado

Em 2026-10-03, o usuário autorizou executar o instalador neste PC, informou Windows 11 x64, duas contas padrão fictícias e UAC ativo. Leitura local encontrou arquitetura `AMD64`, DisplayVersion `25H2`, build `26200.9550` e `EnableLUA=1`. **Correção de premissa em 2026-10-04:** a máquina **não continha** contas padrão fictícias criadas pelo usuário (as únicas não-administradoras eram contas técnicas do sandbox, sem credenciais acessíveis); com autorização do usuário foi criada a conta padrão dedicada `TFAProva2` (a senha não é registrada na documentação) e a prova 6.5 foi executada nela. A matriz F04–F07 da conta principal (`cadli`) seguiu com token filtrado/não elevado de conta do grupo Administradores; o critério "conta sem participação no grupo" é coberto pela conta dedicada. A chave `ProductName` ainda exibe “Windows 10 Home Single Language”; a documentação Microsoft identifica OS build 26200 como Windows 11 25H2 ([release information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)). Não coletar nomes de contas pessoais ou conteúdo em evidências.

## Matriz aprovada e revalidação (2026-10-04)

Referências de compatibilidade originais estão no [design D1/D5](../openspec/changes/archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/design.md). Nenhuma versão em uso mudou sem revisão; a única revisão material é a de G4 (driver embarcado).

| Componente | Versão aprovada | Resultado |
| --- | --- | --- |
| Node de build | 24.21.0 | ZIP oficial Windows x64 com SHA-256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`, igual ao [SHASUMS256 oficial](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt). |
| npm | 11.21.0 | CLI instalada separadamente no diretório temporário; usada em todos os gates. |
| Electron | 44.5.1 | Zip oficial Windows x64 com 157.998.329 bytes e SHA-256 `9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db`, igual ao `checksums.json` do pacote npm; ABI 149. |
| electron-builder | 26.17.0 | NSIS one-click exclusivo per-user gerado e inspecionado; 27 permanece alpha. |
| electron-vite / Vite | 5.0.0 / 7.3.6 | Build dos três entrypoints passa; sem peers forçados. |
| Plugin Vue / Vue / Pinia | 6.0.9 / 3.5.43 / 4.0.3 | Bundle do renderer gerado; `@vue/devtools-api` 8.1.5 fixado; renderer empacotado, sem modalidade devtools no pacote. |
| TypeScript / vue-tsc | 5.9.3 / 3.3.12 | Typecheck estrito dos cinco projetos; `@types/node` 24.19.1 (inclui `node:sqlite`). |
| Vitest / DOM de teste | 4.1.11 / happy-dom 20.14.5 | 7 arquivos/32 testes passam. |
| Lint | ESLint 9.39.5; typescript-eslint 8.71.0; eslint-plugin-vue 10.11.1; globals 17.13.0 | Lint sem warnings; ESLint 9 continua anunciado como em fim de suporte, mantido sem atualização silenciosa da matriz. |
| Auxiliar de ícone | `@resvg/resvg-js` 2.6.2 (binding `@resvg/resvg-js-win32-x64-msvc`) | ICO 16/24/32/48/256 px gerado no build; MPL-2.0; apenas build. |
| Auxiliar de inspeção | `@electron/asar` 3.4.1 | MIT; usado por `verify:package` para listar/extrair o ASAR; apenas build/verificação. |
| Driver da prova | `node:sqlite` embarcado (Electron 44.5.1 / Node 24.21.0) | G4 revisado em 2026-10-04; API release candidate aceita explicitamente; create/write/read/rollback/reopen exercitados no pacote pelo smoke. Sem addon, rebuild, ASAR unpack ou compilador. |

## Inventário do lockfile (2026-10-04)

`package-lock.json` (lockfileVersion 3) foi atualizado com `engine-strict`, `strict-peer-deps` e `strict-allow-scripts`; `package.json` não usa `overrides`; `npm ls` sem peers inválidos/forçados; `npm audit` sem vulnerabilidades. `dependencies` está vazio por decisão de empacotamento (bibliotecas do renderer são bundladas); todas as entradas diretas são `devDependencies`:

| Pacote | Versão | Licença | Integridade (lockfile) |
| --- | --- | --- | --- |
| @electron/asar | 3.4.1 | MIT | sha512-i4/rNPRS84t0vSRa2HorerGRXWyF4vThfHesw0dmcWHp+cspK743UanA0suA5Q5y8kzY2y6YKrvbIUn69BCAiA== |
| @eslint/js | 9.39.5 | MIT | sha512-QywQuszQh77pIXCsq998c8hbhSTI/azTty1Z6N53dmAudKHhy573j3yvRLsX2BSp8YpLtoCEG8E9DJe+8zUh4A== |
| @resvg/resvg-js | 2.6.2 | MPL-2.0 | sha512-xBaJish5OeGmniDj9cW5PRa/PtmuVU3ziqrbr5xJj901ZDN4TosrVaNZpEiLZAxdfnhAe7uQ7QFWfjPe9d9K2Q== |
| @resvg/resvg-js-win32-x64-msvc | 2.6.2 | MPL-2.0 | sha512-ZXtYhtUr5SSaBrUDq7DiyjOFJqBVL/dOBN7N/qmi/pO0IgiWW/f/ue3nbvu9joWE5aAKDoIzy/CxsY0suwGosQ== |
| @types/node | 24.19.1 | MIT | sha512-aS3/DG0oM05K0RIXXP+hKjinGG5IgSSVGzswZxW3O0sS3pH4/fycXundUC9XsszgKCk4gHXylTEK6hyFxVxnoQ== |
| @vitejs/plugin-vue | 6.0.9 | MIT | sha512-rD/MORlhaZMlXWW0rEn4FB4wMinWC0z/D7Ye160S5+Rs1mC8ZDAdcDp4SjKfUhG5t8q1ktcPVw4xuTkPRlzrSA== |
| @vue/devtools-api | 8.1.5 | MIT | sha512-YJipMVAKe5wT5CWf5kTYCaNV7NMNjFVxJkIkJaJ4W/nCxEBzlZzrOsYKeCymdCrFZmBS/+wTWFoUs3Jf/Q6XSQ== |
| @vue/test-utils | 2.5.1 | MIT | sha512-V/4a99odJ7hapr0bRt35XxljGk8hefq31gSOnlKTcEq2fUeoj2qb+FcpJYfQu4qfYhW9Ug+O2+CZ3QmZ7gXDzA== |
| electron | 44.5.1 | MIT | sha512-lx7AYoFIiyvEvgvpyWO9kOC60xtNPpiPZAth6Fmg9NutzpCAMLwpUlaBY2EXfZyIgUdzEmLMj9KvK0Vrokl1yQ== |
| electron-builder | 26.17.0 | MIT | sha512-iYHBRiagS9sDIbZx1ZD113f5rEGQvtpvTvHf70ovHKJ8mRvxwIkWX7JCwfmVQmVS4eX735p7TZmoxHnBPwF3vA== |
| electron-vite | 5.0.0 | MIT | sha512-OHp/vjdlubNlhNkPkL/+3JD34ii5ov7M0GpuXEVdQeqdQ3ulvVR7Dg/rNBLfS5XPIFwgoBLDf9sjjrL+CuDyRQ== |
| eslint | 9.39.5 | MIT | sha512-DgZS62aPLXKlnxILS/AYCoRvHaZeXceIzlXPkkGGzJWSow1aEk0lbTlxUSlyjC8jcaKxAdOnTDz+o1JFSBsyjw== |
| eslint-plugin-vue | 10.11.1 | MIT | sha512-pasVXhl7wUmIvhujoqs/m0mJ9r59QW1IR9XXYKGR0FETzSM+Hhlf4qKIYgWiDDP+9YKv4YfbwskD7LqIdVcgQw== |
| globals | 17.13.0 | MIT | sha512-RwMTC61u7hrG3ZJMkZQOK4JLJrKS8QtoTii63EmWvFXHqycY9FObBJQCbsLxSO8kjKhWE5kV1GC+Vb1g3RI0Zg== |
| happy-dom | 20.14.5 | MIT | sha512-x/RzkpWO40bTjIoT30iQtt64FLLmH/iRcUCN2X//bLx7H3ifkdfPXyqsro/OYtqzIAhiLMMA7mmiOR9C3NOKjQ== |
| pinia | 4.0.3 | MIT | sha512-XMQqpvjgG7LMqVhhFUzKLT4KEbsYbfZZ0CZU9PgdFm1O2VKBmIkykL8+SfNhOaT7sR0wT6BEgKT0YNDYWgmVRA== |
| typescript | 5.9.3 | Apache-2.0 | sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw== |
| typescript-eslint | 8.71.0 | MIT | sha512-fBdHYiqQ14RW6mOMXD14Svn82ZsCYAoQSzGRzyEjR59S5A2Krh/l7fGTOQ7iCr8gGy/mHVXtEF7s5fgjEdV0Pw== |
| vite | 7.3.6 | MIT | sha512-4XP60spRGjSZFf1qYH+dJIkK2znL3zQfl9KkOV9MkkRR/3Dls0dxaBsQPTloEc5BLXWPL9vsOxopxyKoMmDueg== |
| vitest | 4.1.11 | MIT | sha512-fhACrNXUidIbGSBr5FlbuBkO7VWC1ZyLl0DO4CU2DrQoAPxX84Ysxs+HeGQpii5lZWV1Q4gBZTTu49mF+A6Edw== |
| vue | 3.5.43 | MIT | sha512-o5qZoksdnjIKvW1srZ3ab7pcDNYAerBjRe54D0LBLfRdCYFrSgBHVXokMas35czQc0//lmx4/tuY4ZNQ+Rf2Ng== |
| vue-tsc | 3.3.12 | MIT | sha512-kbpaz18O9jPVkXVHD1BEjpUXM6WhXSu+62L1sGGr6Wbzd8GbvkBQWjoj3KZ/C0aq2MZllce7UdtWzwCIYsBMGA== |

O único binding do conversor SVG instalado em Windows x64 é `@resvg/resvg-js-win32-x64-msvc` 2.6.2 (os demais permanecem como entradas opcionais). A árvore transitiva de runtime não existe mais no pacote (sem `node_modules`); dependências de build não entram no artefato.

## Binários, integridade e checksums (2026-10-04)

Todos os binários auxiliares foram resolvidos pelo electron-builder 26.17.0 a partir das releases oficiais; tamanhos e SHA-256 locais conferidos, e as URLs de origem confrontadas por `Content-Length`:

| Binário | Origem | Tamanho | SHA-256 |
| --- | --- | --- | --- |
| Electron 44.5.1 win32-x64 | [electron/electron v44.5.1](https://github.com/electron/electron/releases/download/v44.5.1/electron-v44.5.1-win32-x64.zip) | 157.998.329 | `9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db` (igual ao `checksums.json`) |
| NSIS | [electron-builder-binaries nsis-3.0.4.1](https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z) | 1.287.512 | `9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa` |
| nsis-resources | [electron-builder-binaries nsis-resources-3.4.1](https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z) | 730.800 | `593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103` |
| 7zip | [electron-builder-binaries 7zip@1.0.0](https://github.com/electron-userland/electron-builder-binaries/releases/download/7zip@1.0.0/7zip-win-x64.tar.gz) | 491.982 | `be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3` |

- `winCodeSign` não foi baixado (sem assinatura); nenhum addon `.node` existe no build ou no pacote: o armazenamento é o `node:sqlite` embarcado no próprio runtime Electron, sem rebuild/ABI externo. Não há segundo driver nem fallback.
- Notices: o pacote mantém `LICENSE` do projeto, `LICENSE.electron.txt` e `LICENSES.chromium.html`; o inventário de runtime é o ASAR de 12 arquivos já citado. A conversão de ícone (`@resvg/resvg-js`, MPL-2.0) e `@electron/asar` são apenas de build e não entram no artefato.
- Inventário da máquina de build não inclui Visual Studio/MSVC; nenhuma ferramenta de compilação foi instalada e nenhuma é requerida pelo fluxo atual (`package:win` passou do zero sem rebuild nativo).

## Runbook — instalação, manutenção e destinos (TFA-002)

Runbook provisório desta prova; a distribuição definitiva (assinatura, canais e retenção final) é TFA-011. Passos marcados com **[executado]** têm evidência de 2026-10-04; os demais serão preenchidos na prova de conta padrão (seção de resultados).

### Instalação

1. Fechar qualquer instância do TaskFlowApp. **[executado]**
2. Executar `TaskFlowApp-0.1.0-win-x64-Setup.exe` normalmente (sem elevação, sem `/allusers`) ou com `/S` para modo silencioso. O app não exige administrador, não baixa componentes e não instala serviço/updater. **[executado no smoke e nos testes de recusa; janela real na seção 6]**
3. Destino canônico: `%LOCALAPPDATA%\Programs\TaskFlowApp` (Known Folder `UserProgramFiles` do usuário atual, resolvido pelo Windows). O Setup recusa qualquer outro destino. **[executado para recusas]**
4. Efeitos próprios esperados: pasta de binários; ACE `S-1-15-2-1:(OI)(CI)(RX)` **somente** na pasta instalada (requisito do sandbox do Electron); atalho `TaskFlow App.lnk` no Menu Iniciar do usuário (com AUMID `taskflow.app`); chaves HKCU `Software\c791496c-2f51-5fc2-ac5c-b8a63e04e47a` (InstallLocation/KeepShortcuts/ShortcutName) e `Software\Microsoft\Windows\CurrentVersion\Uninstall\c791496c-2f51-5fc2-ac5c-b8a63e04e47a`; temporários no temp do usuário. Nenhum write em HKLM/Program Files/ProgramData, atalho público ou serviço. **[parte verificada na instalação da seção 6]**
5. Dados ficam separados da instalação: `%LOCALAPPDATA%\TaskFlowApp\profiles\<dev|test|prod>\{user-data,session-data}`; o lançamento instalado normal usa `prod` e ignora overrides de desenvolvimento.

### Argumentos aceitos e recusados (silencioso; recusa com exit code 2 e sem efeitos)

| Entrada | Resultado |
| --- | --- |
| `/S` | Instala silenciosamente no destino canônico; mesmas restrições. **[recusas verificadas; sucesso na seção 6]** |
| `/currentuser` | Permitido; mantém escopo do usuário. **[previsto na mesma política]** |
| `/allusers` (isolado, ou com `/currentuser`/`/S`) | Recusado. **[executado]** |
| `/currentuser` duplicado; `/D` duplicado | Recusado. **[executado]** |
| `/D` sem `=`, `/D=` vazio, destino vazio | Recusado. **[executado]** |
| `/D=<destino>` diferente do canônico (outro usuário, root global, UNC, relativo, traversal, separador `/`) ou com algo depois do valor | Recusado. **[executado para os casos do checklist]** |
| HKCU `InstallLocation` anterior fora do canônico | Recusado; valor preservado; instalação/dados existentes intactos. **[executado]** |
| Destino canônico é arquivo, junction/reparse ou pasta sem escrita | Recusado antes de extrair; nada é alterado. **[executado]** |
| Known Folder redirecionado fora do perfil ou com reparse nos ancestrais | Recusado (revisão explícita exigida); neste PC a cadeia do perfil não tem reparse. **[código + checagem local da cadeia]** |
| Instalação de máquina legada (HKLM) | Recusada com orientação, sem migração/elevação. **[código; sem cenário real neste PC]** |

`/D=<destino>` deve ser o último argumento e sem aspas (regra do NSIS); o valor precisa ser exatamente o destino canônico. A validação usa a linha de comando original (o NSIS consome `/D=` antes do `$CMDLINE`), confere separador `\`, ausência de `..`, igualdade com o destino do usuário atual e reparse points; por fim o destino resolvido pelo template é revalidado e fixado. Falhas retornam código não zero (2) e não iniciam extração.

### Manutenção, desinstalação e retorno seguro

1. **Atualização manual:** fechar o app e executar o Setup de versão mais nova na mesma identidade; pasta/IDs/registro não mudam e os dados/prova são preservados. Não absorver instalação all-users legada. **[seção 6]**
2. **Desinstalação:** pelo menu do Windows (`UninstallString` → `Uninstall TaskFlowApp.exe /currentuser`; em modo silencioso `/S`) ou executando o desinstalador instalado. O desinstalador revalida o destino canônico antes de remover e exige o registro coerente; remove binários, chaves e atalhos próprios e **mantém** `%LOCALAPPDATA%\TaskFlowApp` (dados/perfis). `--delete-app-data` do template não cobre a raiz customizada — nenhuma remoção automática de dados nesta prova. **[seção 6]**
3. **Falhas tratadas:** recusa de argumentos/destino (exit 2, sem efeitos); destino inacessível (exit 2); reparse/junction (exit 2); driver/abertura do banco no app (erro seguro sem reset). **Retorno seguro quando o registro for apagado manualmente:** o desinstalador recusa remover um diretório que não pode reconhecer como canônico; a recuperação manual exige conferir `HKCU\Software\c791496c-2f51-5fc2-ac5c-b8a63e04e47a` e a pasta `%LOCALAPPDATA%\Programs\TaskFlowApp` e remover somente esses artefatos, nunca dados/perfis.
4. **Limites provisórios:** sem assinatura, bandeja, updater ou inicialização automática; SmartScreen/política podem exigir confirmação e bloqueios devem ser registrados como BLOCKED, sem contorno.

## Resultados da prova em conta padrão — 2026-10-04

**Ambiente:** Windows 11 x64, build `26200.9550` (DisplayVersion 25H2; a chave `ProductName` legada exibe “Windows 10 Home Single Language”), arquitetura `AMD64`, conta padrão fora de `Administrators`, `EnableLUA=1` (UAC ativo), sem Node/npm usados pelo app instalado. Artefatos 0.1.0/0.1.1 **não assinados**; instalado em `%LOCALAPPDATA%\Programs\TaskFlowApp`; dados em `%LOCALAPPDATA%\TaskFlowApp`. Evidências sanitizadas em `%TEMP%\opencode\tfa002-evidence` (baseline, matriz F06, manutenção e transcrições; sem nomes de conta, credenciais ou dados reais).

| Critério | Resultado | Evidência observada |
| --- | --- | --- |
| F01 Toolchain | **PASS** | `npm ci` do lockfile com Node 24.21.0/npm 11.21.0; `validate` (lint/typecheck/32 testes/build); `package:win` sem compilador nativo; inventário de engines/peers/licenças no lockfile. |
| F02 Isolamento | **PASS** | Testes de contrato/negativas + smoke empacotado: payloads inválidos recusados, preload ausente/falha sanitizada, override de `--user-data-dir` recusado, pacote ignora env de desenvolvimento; renderer sem Node/fs. |
| F03 Pacote autocontido | **PASS** | Exe instalado abriu offline (sem dev server, Node/npm ou navegador), carregou assets/preload e concluiu a prova SQLite; fechar a janela encerra sem processo residual. |
| F04 Conta padrão | **PASS** | Instalação por lançamento normal sem prompt de administrador/UAC; 20 arquivos, atalho do usuário e chaves HKCU criados; abertura pelo exe e pelo atalho (título “TaskFlow App”). **Reforço (6.5):** repetido na conta padrão dedicada `TFAProva2` (não-administradora, fora de Administrators), com baseline limpo (`BaselineAbsent=true`), `exit 0`, pasta canônica própria, atalho/registro/ACL próprios e prova SQLite verificada. |
| F05 Escopo | **PASS** | Manifests `asInvoker/uiAccess=false` no app, Setup e desinstalador; ACL `(OI)(CI)(RX)` para `S-1-15-2-1` somente na pasta instalada (sem pais/dados); Registro/atalhos apenas HKCU/usuário; nenhum serviço ou write global observado. |
| F06 Argumentos/falhas | **PASS** (3 subcasos BLOCKED) | 15 cenários PASS: `/S`, `/currentuser`, `/D` canônico, recusas de `/allusers` (isolado/combinado), `/D` malformado/vazio/duplicado/root global/outro usuário/traversal, HKCU anterior inválido preservado e destino resolvido; instalação intacta após cada recusa. BLOCKED: caminho com espaços/acentos, Known Folder redirecionado e instalação all-users legada (sem cenário autorizado neste PC). |
| F07 Manutenção | **PASS** | Fingerprint `862191a56034e6d2d67ccf99a08c23e7268778b0db9271d5820cc2f635965d70` idêntico em 0.1.0 → upgrade fictício 0.1.1 → uninstall → reinstalação 0.1.0; confirmação não-silenciosa presente (“Desinstalação do TaskFlow App”); desinstalação remove binários/atalhos/chaves e **mantém** os dados; uninstall com destino adulterado recusa com exit 2 e preserva a instalação. **Na conta dedicada (6.5):** ciclo completo com `exit 0` e fingerprint próprio `59559d41c68a…` retido entre ciclos; desinstalação pelo caminho padrão (sem `_?=`) removeu pasta/registro/atalho **sem sobras** (`LeftoverFiles=[]`) e manteve os dados; a conta principal permaneceu intacta. |
| F08 SQLite/ownership | **PASS** | Prova transacional no executável instalado (write/read/rollback/reopen) com marcador único e fingerprint estável; segunda instância encerra sem prova; perfis dev/test/prod separados; `node:sqlite` embarcado, sem addon externo. |
| F09 Conteúdo/documentação | **PASS** | ASAR com 12 arquivos na allowlist (sem `node_modules`/addon/updater/segredos); notices presentes; SHA-256 registrados; runbook e limitações documentados. O run de CI executado no PR #2 ([37202267073](https://github.com/Cadlira/taskflow-app/actions/runs/37202267073), 12/12 passos) validou gates, pacote, inspeção, smoke e hashes no runner; por ser administrador/UAC desabilitado, **não substitui** esta prova em conta padrão. |

### Nota de execução da automação (2026-10-04)

Durante a automação da prova na segunda conta, um disparo inicial operou com mapeamento de ambiente ambíguo e a instalação da conta principal foi desinstalada/reinstalada pelo harness de teste (não pelo produto). Os scripts de teste foram corrigidos com **guardas de perfil explícitas** (abortam se `USERPROFILE`/`LOCALAPPDATA`/`APPDATA` não forem os da conta esperada) e caminhos derivados do perfil, e o ciclo final foi reexecutado com baseline limpo. O estado final das duas contas foi reverificado: principal `862191a5…` e dedicada `59559d41…`, isolados e estáveis. A credencial temporária usada pelo harness (arquivo DPAPI fora do repositório) foi apagada ao final.

**Estado final:** o TaskFlow App 0.1.0 permanece instalado neste PC com o perfil de teste contendo a prova fictícia; o artefato 0.1.1 de manutenção segue em `release/` para referência. Nada foi publicado ou distribuído.

**Bloqueios e limitações registrados (sem contorno):** a segunda conta foi resolvida com a conta padrão dedicada `TFAProva2` (criada com autorização; ver nota de execução). Caminho canônico com espaços/acentos e Known Folder redirecionado não existem neste ambiente; instalação all-users legada exigiria HKLM (admin) e não foi criada; reinício do sistema operacional não executado (a reinicialização do aplicativo e a persistência do marcador foram comprovadas). A CI hospedada foi executada com sucesso (run 37202267073) e não substitui a conta padrão.

## Task 1.2 — encerramento

1. Versões exatas, engines/peers e integridades registrados a partir do lockfile real; `npm ci` limpo comprovado e `npm ls` sem peers forçados.
2. Licenças/notices e o binding Windows x64 do conversor SVG documentados; dependências de runtime ausentes do pacote por desenho.
3. Origem/checksums de Electron, NSIS/nsis-resources e 7zip conferidos; caminho de rebuild não se aplica ao armazenamento aprovado (`node:sqlite`), e não há compilador exigido.

## Limitações e pendências herdadas

- Ciclo de vida provisório: fechar a janela encerra o aplicativo (comprovado no smoke); bandeja, roteamento da segunda instância, inicialização no login e notificações ficam para TFA-008 — nenhum desses recursos existe nesta fundação.
- F04–F07 (conta padrão, argumentos/destinos, manutenção e segunda conta) ainda não executados; dependem da instalação neste PC autorizado e serão registrados como PASS/FAIL/BLOCKED.
- `npm run dev` a partir do repositório permanece bloqueado pela ACL do sandbox neste PC; não é contornado.
- CI e execução real no Windows padrão são evidências separadas; o primeiro run de CI depende de publicação futura autorizada.
- Identidade (CompanyName/assinatura) é provisória até TFA-011; nenhum publisher/domínio real é afirmado.
