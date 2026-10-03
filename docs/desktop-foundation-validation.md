# Validação da fundação desktop — TFA-002

**Atualizado:** 2026-10-03
**Estado:** inventário técnico em andamento; task 1.2 aguarda verificação dos binários Electron/NSIS/driver empacotados.
**Ambiente de build:** Node.js 24.21.0 oficial Windows x64 foi obtido em diretório temporário e seu ZIP teve SHA-256 conferido com o manifesto oficial. npm 11.21.0 foi instalado isoladamente nesse diretório temporário a partir do registry npm; versões globais do usuário não foram alteradas. O shell global continua Node.js 22.22.2/npm 10.9.7 e não foi usado para build/install do app.

## Gates locais já executados

Com Node.js 24.21.0 e npm 11.21.0, `npm ci` foi executado em árvore limpa duas vezes, com `engine-strict`, `strict-peer-deps` e `strict-allow-scripts`; sem `--force` ou `--legacy-peer-deps`. Scripts de instalação permitidos estão limitados a `better-sqlite3@12.11.1`, `esbuild@0.25.12` e `esbuild@0.28.2`; o script opcional do Squirrel `electron-winstaller` está negado. `npm install-scripts ls` confirmou ausência de scripts não revisados. O driver foi instalado/reconstruído para o ABI de Node do toolchain; isto ainda não comprova ABI do Electron.

`npm run validate` passou: ESLint sem warnings, `tsc`/`vue-tsc` nos cinco projetos separados, Vitest (6 arquivos, 27 testes) e `electron-vite build` nos entrypoints main/preload/renderer. Esses resultados validam gates de fonte/teste/build; não comprovam o executável Electron, ASAR, instalador, notices do Chromium nem conta padrão. ESLint 9.39.5 é a versão aprovada, mas seu pacote anuncia depreciação/suporte encerrado; foi mantida sem atualização silenciosa da matriz.

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

`validate` executa lint, typecheck, testes e build, conectados com `&&`, e propaga o primeiro código de falha. `package:win` executa build, geração do ícone e electron-builder NSIS x64 com `--publish never` embutido; as outras duas verificações dependem dos scripts/artifacts do pacote que serão concluídos mais adiante. CI e execução real no Windows padrão são evidências separadas.

Em 2026-10-03, `lint`, `typecheck`, `test`, `build` e `validate` foram executados individualmente e passaram (6 arquivos/27 testes). Propagação foi verificada adicionando temporariamente uma fixture TS sintaticamente inválida: `validate` encerrou em `lint` com código 1 e não iniciou os gates seguintes; a fixture foi removida ao final do comando.

## Evidência de AppContainer no diretório de build

O usuário atual foi verificado por token efetivo como conta padrão, fora de `Administrators`; as duas contas padrão e UAC ativo foram confirmados pelo usuário. O primeiro `npm run dev` compilou main/preload/renderer e chegou a iniciar Electron, mas o Windows encerrou o processo sandbox com `FATAL ... install_dir_access.cc`: `node_modules/electron/dist` não concedia acesso a `ALL APPLICATION PACKAGES`. A mensagem do runtime identificou a ACL ausente. Leitura das ACLs mostrou que a Known Folder `LocalAppData\Programs` existente também não contém esse SID; ainda não há instalação TaskFlow preexistente nesse root.

Após explicar o impacto, em 2026-10-03 o usuário aprovou ACL `ReadAndExecute` herdável somente na pasta instalada canônica `TaskFlowApp` (`S-1-15-2-1`), sem modificar pais, roots de dados/perfis ou diretórios globais. A decisão foi incorporada à proposal, design, specs e tasks antes da implementação do include NSIS. O primeiro launch foi **FAIL**; uma correção aprovada ainda não foi aplicada nem verificada, portanto package/smoke/F04 continuam pendentes.

### Ponto de retomada — pausa solicitada em 2026-10-03

OpenSpec confirmou 4/33 tasks concluídas: 1.1, 1.3, 1.4 e 2.4. Próximo item na ordem: 1.2, incluindo checksums/origem de NSIS e auxiliares, rebuild/ABI Electron do `better-sqlite3` e notices do pacote. O zip oficial Electron 44.5.1 mediu 157.998.329 bytes e SHA-256 `9b382492dcfee91f8f9e92c91f7972550a1b95d2299cac72279dab33a600d7db`, igual ao checksum embutido no pacote npm Electron 44.5.1; nenhum instalador foi executado. O master SVG revisado já está em `assets/taskflow-icon.svg` e `npm run icon:win` gerou `build/icons/taskflow.ico` (16/24/32/48/256 px); esses artefatos ainda não satisfazem nem fecham a task 4.1.

## Ambiente G1 autorizado

Em 2026-10-03, o usuário autorizou executar o instalador neste PC, informou Windows 11 x64, duas contas padrão fictícias e UAC ativo. Leitura local encontrou arquitetura `AMD64`, DisplayVersion `25H2`, build `26200.9550` e `EnableLUA=1`. A chave `ProductName` ainda exibe “Windows 10 Home Single Language”; a documentação Microsoft identifica OS build 26200 como Windows 11 25H2 ([release information](https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information)). Registrar a divergência do rótulo legado na evidência sanitizada; não coletar nomes de usuário/contas. A existência/uso das duas contas é confirmação humana e a prova per-user ainda não foi executada.

## Matriz aprovada e revalidação preliminar

Nenhuma versão ou driver foi trocado. Referências de compatibilidade originais estão no [design D1/D5](../openspec/changes/preparar-fundacao-desktop-e-validar-instalacao-por-usuario/design.md); links abaixo foram conferidos em 2026-10-03.

| Componente | Versão aprovada | Resultado preliminar |
| --- | --- | --- |
| Node de build | 24.21.0 | ZIP oficial Windows x64 baixado e hash conferido: `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`, igual ao [SHASUMS256 oficial](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt). A distribuição contém npm 11.19.0; não usar essa versão embutida. |
| npm | 11.21.0 | CLI exata instalada separadamente em diretório temporário e executada com Node 24.21.0. Registry declara Node `^20.17.0 || >=22.9.0`, licença Artistic-2.0 e integridade `sha512-Zov8KhamNneiLdELtj5YALtNmJW4L4fCLTzjfpzXG2w6MSHcf0UxgdlK5uloCuksWT+7mGUU7wi79cO6RqivPg==`. |
| Electron | 44.5.1 | Release oficial estável publicada em 2026-09-30 no [tag v44.5.1](https://github.com/electron/electron/releases/tag/v44.5.1). O download Windows x64 e seu checksum serão capturados durante a resolução/build real; a página do release acessível nesta consulta não expôs a lista completa de assets. |
| electron-builder | 26.17.0 | Release estável mais recente identificada no [histórico oficial](https://github.com/electron-userland/electron-builder/releases); 27 permanece alpha. Manter a versão aprovada e consultar a configuração NSIS v26, não documentação de outra major. |
| electron-vite / Vite | 5.0.0 / 7.3.6 | Registry confirma peer Vite `^5 || ^6 || ^7`, licença MIT e engines Node compatíveis. Peer `@swc/core` é opcional e ficará omitido, pois o fluxo usa o transpiler padrão; sem peers forçados. Manter versões aprovadas. Fontes: [electron-vite 5](https://www.npmjs.com/package/electron-vite/v/5.0.0), [guia de requisitos](https://electron-vite.org/guide/), [Vite](https://www.npmjs.com/package/vite). |
| Plugin Vue / Vue / Pinia | 6.0.9 / 3.5.43 / 4.0.3 | Registry confirma MIT e peers compatíveis: plugin Vue aceita Vue 3/Vite 7; Pinia exige Vue `^3.5.11`, TS `>=5.6.0` e `@vue/devtools-api ^8.1.5`. Fixar devtools-api 8.1.5; não adicionar toolkit/DevTools UI. |
| TypeScript / vue-tsc | 5.9.3 / 3.3.12 | Metadata confirma vue-tsc peer TypeScript `>=5.0.0`; TypeScript ESLint aceita TS `>=4.8.4 <6.1.0`, portanto 5.9.3 cabe. Fixar `@types/node` 24.19.1 e `@types/better-sqlite3` 9.6.0 para main/driver; renderer não recebe tipos Node. |
| Vitest / DOM de teste | 4.1.11 / happy-dom 20.14.5 | Vitest aceita Node >=24 e peer Vite 6/7/8; happy-dom é peer opcional e declara Node >=20/MIT. Instalar a versão exata happy-dom para testes Vue sem resolver jsdom. `@vue/test-utils` 2.5.1 (Vue 3, MIT) será fixado para interações. |
| Lint | ESLint / @eslint/js 9.39.5; typescript-eslint 8.71.0; eslint-plugin-vue 10.11.1; globals 17.13.0 | Metadata declara ESLint 9 e TS 5.9 compatíveis; plugin Vue aceita parser TS ESLint 8. ESLint 9, parser/preset e plugin são MIT; globals 17.13.0 é MIT. Lockfile confirmará parser transitivo e ausência de peers forçados. |
| Auxiliar de ícone | `@resvg/resvg-js` 2.6.2 | Conversão build-only do SVG master para ICO; MPL-2.0, bindings por dependências opcionais por plataforma. Incluir notice e apenas no build; confirmar pacote Win x64 e inventário de licenças no lock. |
| better-sqlite3 | 12.11.1 | Registry declara MIT e engines Node 20–26, inclusive 24.1.x. Manter versão aprovada. Os prebuilds Electron 39+ da release não provam ABI Electron 44.5.1; exigir rebuild e execução no pacote. Fontes: [better-sqlite3](https://www.npmjs.com/package/better-sqlite3), [workflow de release 12.11.1](https://github.com/WiseLibs/better-sqlite3/actions/runs/27563130800). |

**Licenças candidatas:** Node MIT, npm Artistic-2.0, TypeScript Apache-2.0 e os demais diretos acima MIT, conforme metadados consultados no D1 e páginas versionadas. A árvore transitiva de runtime instalada foi enumerada a partir das dependências efetivamente alcançáveis: 69 instâncias de pacote; MIT 55, ISC 7, BSD-2-Clause 1, BSD-3-Clause 2, Apache-2.0 2 e duas expressões multi-licença compatíveis com os campos SPDX; nenhum campo de licença ausente/não reconhecido. Isso ainda não é inventário final de distribuição: dependências de build, Electron/Chromium, builder/NSIS e arquivos efetivamente empacotados/notices serão inspecionados a partir do pacote real.

## Binários, integridade e rebuild

- A lista oficial [SHASUMS256 do Node 24.21.0](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt) publica para `node-v24.21.0-win-x64.zip` o SHA-256 `158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`; o arquivo temporário efetivamente usado foi conferido contra esse valor.
- O binário Electron será obtido exclusivamente da release aprovada. O SHA-256 do zip Windows x64 ainda precisa ser confrontado com a fonte oficial durante a instalação/build; não usar hash de espelho como evidência final.
- NSIS e outros binários auxiliares do electron-builder ainda não foram resolvidos. Registrar origem, versão e checksum informados/obtidos pelo pacote aprovado durante `package:win`.
- Usar um único caminho de rebuild: `electron-builder` com `nativeRebuilder: "sequential"` e rebuild habilitado para Windows x64/Electron 44.5.1. A documentação v26 declara que o modo sequential usa `@electron/rebuild`; Electron requer ABI nativa reconstruída. Evidências: [configuração v26](https://www.electron.build/v26/docs/configuration/) e [módulos nativos Electron](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules/). Não acrescentar fallback de driver nem outro fluxo de rebuild.
- No pacote, inspecionar o addon em `app.asar.unpacked`, arquitetura/ABI e notices; calcular hash do `.node` resolvido e do arquivo empacotado; provar load/write/read/rollback/reopen no executável real. Falha é gate, não motivo para mudar driver automaticamente.

## O que falta para concluir a task 1.2

1. Manifest/lockfile com versões exatas já foram instalados duas vezes por `npm ci` sem `--force`/`--legacy-peer-deps`; lint, typecheck, 27 testes e build de três entrypoints passaram.
2. Registrar engines, integridades e licenças dos pacotes de build e do binding Windows x64 do conversor SVG, a partir do lockfile real.
3. Capturar e conferir origem/checksum dos binários Electron, builder/NSIS e addon nativo durante package/build; verificar rebuild sequencial escolhido e `.node` empacotado.

Até esses itens passarem, este inventário não comprova instalação reproduzível, ABI compatível ou pacote funcionando.
