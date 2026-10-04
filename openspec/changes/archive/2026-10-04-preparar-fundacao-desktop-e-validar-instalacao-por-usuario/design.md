# Design

## Context

**TFA-002; proposta aprovada para apply em 2026-10-03.** A necessidade da ACL local de AppContainer foi aprovada durante o apply em 2026-10-03 depois da falha de inicialização observada; ver D2/D4 e roadmap. Motivação: [proposal](proposal.md). TFA-001 está integrada pelo PR #1 e fornece [arquitetura](../../../docs/architecture.md), [paridade](../../../docs/parity-matrix.md) e [estratégia de testes](../../../docs/test-strategy.md). A CLI OpenSpec 1.14.0 resolve a raiz própria e usa `spec-driven`; três capacidades novas exigem specs, sem `skip_specs`.

A extensão foi consultada somente para leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, inalterado. Seu package.json usa WXT, Vite 8/TypeScript 6/Vitest 5 e postinstall `wxt prepare`; não serve de scaffold desktop. Seu teste de fronteiras é candidato a cópia revisada, acrescentando Node/Electron e testes de violações. Não executar ferramentas na origem. Os critérios F01–F09 e referências da exploração estão no [roadmap](../../../docs/roadmap.md).

## Goals / Non-Goals

**Goals:** demonstrar um caminho executável mínimo de renderer → preload → main → SQLite e comprovar instalação/manutenção por usuário. Separar resultados de metadados, gates automatizados, pacote executado e instalação em conta padrão.

**Non-Goals:** implementar entidades ou regras de tarefas, repos/fila/recovery de produto, catálogo IPC futuro, interfaces migradas ou recursos Windows TFA-008/009. A prova não aprova durabilidade da persistência definitiva nem notificações, bandeja e atalhos globais. Nenhum recurso futuro pode aparecer como disponível.

## Decisions

### D1 — Toolchain própria com versões candidatas fixadas

Preservar Vue/Pinia + Electron aprovados. Usar electron-vite para três builds e electron-builder para NSIS. Quasar acrescentaria convenções/componentes sem benefício demonstrado nesta fundação; Forge/Squirrel exige outro fluxo de instalação/manutenção. Não executar gerador que traga bridge genérica ou APIs futuras.

Metadados oficiais consultados em 2026-10-03; versões, peers e execução observada do toolchain estão detalhados em [desktop-foundation-validation](../../../docs/desktop-foundation-validation.md). O binário Electron está conferido, mas ABI/empacotamento final ainda dependem dos gates seguintes.

| Componente | Versão proposta | Evidência / condição |
| --- | --- | --- |
| Node de build | 24.21.0 LTS | Fixar patch e conferir distribuição oficial; Node externo não é requisito do destino. |
| npm | 11.21.0 | [Registro](https://registry.npmjs.org/npm/11.21.0): Node ^20.17 ou >=22.9; Artistic-2.0. |
| Electron | 44.5.1 | [Releases](https://releases.electronjs.org/release?channel=stable); conferir Node embarcado 24.21.0 no binário, MIT e notices de terceiros. |
| electron-builder | 26.17.0 | [Metadata versionada](https://registry.npmjs.org/electron-builder/26.17.0), Node >=14; MIT. O dist-tag consultado não apontava a esta versão: usar versão exata, não `latest`. |
| electron-vite | 5.0.0 | [Registro](https://registry.npmjs.org/electron-vite/5.0.0): Node ^20.19 ou >=22.12; peer Vite ^5/^6/^7; MIT. |
| Vite / plugin Vue | 7.3.6 / 6.0.9 | [Vite](https://registry.npmjs.org/vite/7.3.6), [plugin](https://registry.npmjs.org/@vitejs/plugin-vue/6.0.9): mesmo mínimo Node; plugin aceita Vite 7 e Vue 3; MIT. |
| Vue / Pinia | 3.5.43 / 4.0.3 | [Vue](https://registry.npmjs.org/vue/3.5.43), [Pinia](https://registry.npmjs.org/pinia/4.0.3): Pinia requer Vue ^3.5.11 e TS >=5.6; MIT. Resolver também seu peer devtools-api conforme metadata, sem expor devtools no pacote. |
| TypeScript / vue-tsc | 5.9.3 / 3.3.12 | [TS](https://registry.npmjs.org/typescript/5.9.3), [vue-tsc](https://registry.npmjs.org/vue-tsc/3.3.12): TS Apache-2.0; vue-tsc MIT, peer TS >=5. |
| Vitest | 4.1.11 | [Registro](https://registry.npmjs.org/vitest/4.1.11): Node 20/22/>=24; peer Vite 6/7/8; MIT. UI/coverage/browser peers só se necessários, na mesma versão. |
| ESLint / typescript-eslint / plugin Vue | 9.39.5 / 8.71.0 / 10.11.1 | [ESLint](https://registry.npmjs.org/eslint/9.39.5), [TS ESLint](https://registry.npmjs.org/typescript-eslint/8.71.0), [Vue ESLint](https://registry.npmjs.org/eslint-plugin-vue/10.11.1): faixa TS >=4.8.4 <6.1 e ESLint 9 aceitos; MIT. |
| Driver embarcado da prova (G4 revisado em 2026-10-04) | node:sqlite do Electron 44.5.1 (Node 24.21.0 embarcado) | Dispensa addon externo e compiladores; disponibilidade e escrita/leitura verificadas no runtime fixado. API release candidate (1.2) aceita explicitamente pelo usuário; prova no pacote permanece obrigatória. |

Fixar também os auxiliares necessários (types Node 24, parsers e presets compatíveis), sem tipos Node no renderer. Registrar engines/peers/licenças e origem/checksum dos binários efetivamente resolvidos, inclusive NSIS e Electron, no inventário do lockfile. Não usar `--force`/`--legacy-peer-deps` para mascarar incompatibilidades. `@eslint/js` deve acompanhar ESLint 9, não o 10 da origem. Vite 8/TS 7/Vitest 5 não são atualização automática desta proposta. Vulnerabilidade impeditiva ou indisponibilidade da versão exige revisão da matriz antes de mudar a decisão.

### D2 — Shell local, protocolo limitado e diagnóstico único

Estrutura proposta no app: `src/main`, `src/preload`, `src/renderer`, contratos DTO independentes e espaço futuro para domínio/aplicação. Builds e tsconfigs separados: tsc main/preload/contratos e vue-tsc renderer, strict em todos. Domínio/aplicação não podem importar Vue/Pinia/Electron/Node, infraestrutura ou rede. Não criar serviços de tarefas vazios nem emulação de Chrome.

Janela mínima identifica TaskFlow e versão e oferece botão acessível **Verificar fundação**, com estado em execução, sucesso e erro seguro. Pinia limita-se ao estado transitório diagnóstico. Derivar somente ícone Windows necessário do master SVG revisado da origem, preservando check branco/#5368e8, notices/licença e ICO multirresolução; sem redesign nem assets de bandeja antes da TFA-008/011.

Renderer com `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`; preload explícito, sem toolkit bridge, ipcRenderer, fs, require, `send(channel)` ou caminhos livres. API única proposta `verifyFoundation({ version: 1 })`; resposta versionada com estado/códigos fechados, versões runtime e fingerprint opaco do marcador fictício, sem paths pessoais, SQL livre, stack ou linhas do banco. Main valida schema exato/limite pequeno (1 KiB), webContents registrado, main frame e origem exata antes de qualquer efeito. Rejeitar iframes, janelas desconhecidas, frames navegados, versão/shape inválidos e invocações simultâneas por um código `BUSY`. Não confiar apenas no TypeScript.

O sandbox do Electron no Windows verifica a ACL do diretório do executável. Em 2026-10-03, o Windows encerrou o processo sandbox com erro explícito porque o diretório de build não concedia acesso ao SID `ALL APPLICATION PACKAGES` (`S-1-15-2-1`). Decisão aprovada durante apply: depois da validação do destino canônico, conceder apenas `ReadAndExecute` herdável no root instalado `TaskFlowApp`; não aplicar na Known Folder pai, em dados/perfis, roots globais ou outros destinos. Falha ao configurar essa ACE é falha de instalação, sem desabilitar o sandbox.

Produção serve assets empacotados por `taskflow://app` (standard/secure, sem bypass CSP), com resolução limitada ao diretório de renderer e recusa de traversal, caminhos absolutos, symlinks de escape e requisições fora do host esperado. CSP proposta: default/script/style/font/img locais, sem inline/eval, `connect-src 'none'`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'`; recursos adicionais só se demonstrados e revisados. Dev autoriza somente URL explícita do servidor local e conexão HMR estritamente em modo dev; pacote não consulta variáveis para habilitar origem remota/devtools.

Negar permissões, webviews, novas janelas e navegação externa. Não há abertura externa nesta Change; adapter http/https fica para a Change funcional. DevTools somente dev; diagnóstico não envia rede. Testar controles pelo Electron empacotado, além dos testes unitários de validação. [Segurança](https://www.electronjs.org/docs/latest/tutorial/security), [protocol](https://www.electronjs.org/docs/latest/api/protocol), [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge).

### D3 — Identidade, perfis e ownership antes do banco

Valores concretos aprovados, sem presumir publisher/domínio empresarial:

| Campo | Proposta |
| --- | --- |
| package name / productName / executableName | `taskflow-app` / `TaskFlow App` / `TaskFlowApp` |
| appId / AUMID | `taskflow.app` como identificador do produto, sem afirmar propriedade de domínio; manter ambos iguais |
| Diretório de instalação | Known Folder `UserProgramFiles` + `TaskFlowApp` (normalmente `%LOCALAPPDATA%\Programs\TaskFlowApp`) |
| Raiz de dados | Known Folder `LocalAppData` + `TaskFlowApp`, separada da instalação |
| userData / sessionData | raiz + `profiles\<dev|test|prod>\user-data` / `profiles\<perfil>\session-data` |
| Banco da prova / marcador | userData + `foundation-proof\proof.sqlite`; marcador fictício com identidade persistente dentro desse banco |
| Versões fictícias da manutenção | 0.1.0 → 0.1.1, mantendo identidade e pasta; não publicar release |

Definir appId explicitamente evita GUID NSIS derivado de nome mutável; não fixar GUID arbitrário nem usar ID da extensão. Confirmar o diretório real produzido pelo builder, cujo nome de pasta pode derivar do executableName/productName. Definir AUMID antes de criar janelas; inspecionar atalhos, sem declarar notificações testadas.

Resolver pastas do SO, criar diretórios sob perfil, definir userData/sessionData antes de inicializar sessão. Padrão Electron é appData roaming + nome; portanto requer `app.setPath` explícito. Produção usa perfil prod e ignora overrides dev/test; testes empacotados usam modo de diagnóstico restrito e perfil test separado, sem parâmetro de caminho arbitrário. Não escrever DB/cache no diretório do executável nem tocar perfil Chrome. [Paths/lock](https://www.electronjs.org/docs/latest/api/app).

Adquirir `requestSingleInstanceLock` após escolher userData e **antes** de abrir o banco. Lock é por perfil; segundo processo do mesmo perfil encerra sem DB/prova/janela próprios. Processo principal permanece proprietário; roteamento/foco da segunda instância é TFA-008. No shell provisório fechar a janela encerra o aplicativo após tratar recursos/escritas pendentes, sem bandeja ou serviço; coordenar diagnóstico ativo para fechar banco e sair com resultado seguro. Perfis e usuários distintos não compartilham DB; mesmo usuário/malware não é fronteira de confidencialidade prometida.

### D4 — NSIS one-click, escopo e destinos verificados

Preferir target `nsis` offline x64, não `nsis-web`, com `oneClick: true`, `perMachine: false`, `packElevateHelper: false`, `runAfterFinish: false`, `deleteAppDataOnUninstall: false`, `allowToChangeInstallationDirectory: false`, `createStartMenuShortcut: true`, `createDesktopShortcut: false` e publicação desabilitada. Não incluir electron-updater, auto-start, serviço, driver de sistema ou associação de arquivo/protocolo. `win.requestedExecutionLevel: asInvoker` é para o **app**; extrair e conferir separadamente Setup/desinstalador, cujo NSIS deve usar `RequestExecutionLevel user`.

O [gerador 26.17.0](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/src/targets/nsis/NsisTarget.ts) adiciona suporte multi-user quando `!oneClick || perMachine`; o [installer.nsi](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/templates/nsis/installer.nsi) também tem caminho de elevação para upgrade silencioso assistido. As opções não substituem inspeção do artefato gerado.

| Alternativa | Avaliação |
| --- | --- |
| NSIS one-click exclusivo por usuário | Menor superfície; recomendado para a prova. Continua precisando validar argumentos, destino e binários. |
| NSIS assistido | Permite páginas/seleção. `oneClick: false` + `perMachine: false` oferece modo todos os usuários; `allowElevation: false` impede pedido automático, mas não remove a escolha; `selectPerMachineByDefault: false` só muda default. Se solicitado, requer desenho/validação próprios de força per-user e recusa `/allusers`, sem assumir macro suficiente. |
| Forge/Squirrel.Windows | Alternativa per-user com eventos/artefatos de instalação próprios; sem vantagem demonstrada para a prova de NSIS já investigada. |
| ZIP/portable | Útil como diagnóstico fora de dev; não prova instalação, registro, atalhos ou uninstall. Não é substituto do aceite. |
| MSI / AppX/MSIX | MSI pode ser per-user ou per-machine conforme authoring; MSIX envolve identidade/assinatura/deployment. Aumentam decisões e políticas sem benefício demonstrado nesta etapa. |

Referências complementares: [opções NSIS v26](https://www.electron.build/v26/docs/nsis/), [Windows v26](https://www.electron.build/v26/docs/win/), [Squirrel Forge](https://www.electronforge.io/config/makers/squirrel.windows), [contexto MSI](https://learn.microsoft.com/en-us/windows/win32/msi/installation-context), [MSIX](https://learn.microsoft.com/en-us/windows/msix/overview). `asInvoker` mantém o token de quem iniciou; não impede escolha voluntária de executar elevado, nem concede permissão corporativa. A prova usa lançamento normal de conta padrão.

**Política proposta de destinos:** aceitar somente destino canônico equivalente ao Known Folder `UserProgramFiles\TaskFlowApp` aprovado para o usuário atual. Resolver identidade do usuário, caminhos e componentes existentes; não confiar em prefixo textual. `/D` igual ao destino é permitido; outro destino, root global, outro usuário, UNC, relativo, traversal ou reparse point que escape é recusado. Sem diretório selecionável. Se o Known Folder estiver redirecionado fora do perfil normal, recusar até revisão explícita do root autorizado; não substituir silenciosamente pelo diretório global. Esta política é uma restrição operacional, não proteção contra malware do mesmo usuário.

Antes de gravar arquivos, o include de Setup valida Known Folder, `/D`, HKCU anterior, escopo e reparse points. Somente depois da validação e antes de concluir a instalação, concede a ACE herdável `ReadAndExecute` para `S-1-15-2-1` no root `TaskFlowApp`; isso permite ao AppContainer do Electron ler os binários sem dar escrita nem ampliar a ACL dos pais/perfis/dados. O uninstaller repete a validação do mesmo root e remove somente seus próprios binários/registro/atalhos; apagar a pasta também remove sua ACE. Se a configuração/validação falhar, retornar erro e não aceitar elevação, instalação global, fallback de caminho ou desabilitar sandbox.

O [multiUser.nsh 26.17.0](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/templates/nsis/multiUser.nsh) lê HKCU `InstallLocation` anterior antes do Known Folder e depois aceita `/D` (último argumento, sem aspas). Validar o **destino final**, antes de extrair/remover arquivos ou gravar registro/atalhos. Proposta de customização pequena via include `build/installer.nsh`, `customInit`/guards da seção de instalação e `customUnInit`; revisar ordem efetiva no script gerado. Não copiar exemplo de docs que grava HKLM nem substituir script inteiro sem necessidade. Rejeitar `/allusers`, inclusive combinado com `/currentuser`/`/S`; permitir `/currentuser` e `/S` sob a mesma política. Parâmetro ambíguo/duplicado/malformado deve falhar com erro/código não zero; nada de fallback para instalação global. Temporários necessários do instalador permanecem no temp do usuário; recusa não altera a instalação existente nem o perfil de dados.

Upgrade manual fecha a instância do app com interação normal (sem matar gravação em andamento), instala a nova versão na mesma identidade e preserva marcador/banco. Não absorver instalações all-users legadas; recusar com instrução segura, sem migrar HKLM. Uninstall normal remove somente binários/registro HKCU/atalhos do usuário e mantém a raiz de dados customizada; `deleteAppDataOnUninstall: false` sozinho não cobre customizações que removam diretórios. Reinstalação reabre o mesmo marcador. Exclusão de dados exige fluxo próprio futuro; nunca fazer nesta prova. Downgrade e recovery definitivo pertencem TFA-003/011 e não são anunciados como suportados.

### D5 — SQLite: prova real de empacotamento, sem schema de produto

**Decisão revisada e aprovada em 2026-10-04 (revisão de G4):** usar o **`node:sqlite` embarcado no Electron 44.5.1** na prova, isolado por adapter main. Motivo: o caminho externo preferido exigia rebuild do `better-sqlite3 12.11.1` para o ABI 149 sem prebuilt publicado (a v12.12.0 chega ao ABI 148; a linha v13.x não publica prebuilds Electron) e o PC de build autorizado não possui MSVC; instalar compiladores exigiria elevação e não foi autorizado. O usuário aceitou explicitamente a API release candidate (1.2) do `node:sqlite`, cuja disponibilidade e escrita/leitura foram verificadas no runtime fixado. A escolha só comprova caminho viável para TFA-003, não fixa seu schema/configuração de durabilidade.

| Caminho | Avaliação após a revisão |
| --- | --- |
| node:sqlite embarcado (escolhido) | Dispensa addon externo, compiladores e rebuild; o pacote não contém `.node`/`app.asar.unpacked` de driver. O banco fictício continua no perfil e a prova no executável empacotado permanece obrigatória. |
| better-sqlite3 externo (rejeitado neste ambiente) | Sem prebuilt para Electron 44.5.1/ABI 149 e sem MSVC no PC autorizado; exigiria revisão de ambiente. Não instalar binário de Node de build nem fallback. |
| JSON atômico | Alternativa material que exige nova revisão; não é fallback silencioso. |

Não instalar addon externo nem implementar fallback automático. Falha de disponibilidade/abertura do armazenamento é gate não atendido: registrar e revisar antes de continuar. A matriz/tasks refletem a alternativa embarcada mantendo os cenários comportamentais. Troca para JSON ou versão incompatível com a matriz exige revisão material.

`verifyFoundation` executa exclusivamente dados fictícios no DB da prova: criar tabela própria de diagnóstico, inserir uma única vez marcador com identidade aleatória persistida (não sobrescrever/recriar um valor constante), ler, começar transação, introduzir alteração fictícia e forçar rollback, confirmar valor anterior, fechar/reabrir conexão e confirmar marcador. O fingerprint SHA-256 desse marcador fictício é apresentado no diagnóstico para comparar antes/depois de reinício/upgrade/uninstall/reinstalação; sua mudança denuncia reset, mesmo se a prova básica passar. Erros não resetam banco nem reportam sucesso parcial; fila diagnóstica libera após falha. Falha simulada/argumentos SQL não vêm do renderer. Relatório somente com códigos/contagens/versões/fingerprint fictício, sem linhas SQL. Testar falha de abertura/permissão e rollback; writer é o main proprietário. Não desenhar migração de tarefas, backups, WAL/recovery de produto ou concorrência de repositories nesta Change. Referência: [node:sqlite Node 24.21.0](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/sqlite.md).

### D6 — Gates e CI mínimos, com smoke do executável

Scripts previstos: `dev`, `lint`, `typecheck`, `test`, `build`, `package:win`, `verify:package`, `smoke:packaged` e `validate` agregador. `package:win` compila antes de NSIS x64 e usa `--publish never`; gates executados em sequência e interrupção em erro. `verify:package` inspeciona conteúdo permitido, appId/AUMID/versões, manifests, assets/preload, ACL declarada e ausência de addon externo e rejeita bridge genérica, helpers/updater, `.git`, `.env`, credenciais, dados reais, WXT e devtools/deps de build indevidas. Notices de runtime são obrigatórios; ASAR não é criptografia. Testes de fronteiras devem injetar violações conhecidas para demonstrar detecção.

Um workflow PR/push Windows (imagem explicitamente selecionada, proposta `windows-2022`) fixa Node/npm e actions por SHA completo, permissions mínimas `contents: read`, npm ci com lockfile e relatório das versões. Não prometer saída byte-a-byte idêntica: runner e ferramentas externas precisam de inventário para reprodução. Sem publish/GH release/auto-update ou credenciais de assinatura. Disponibilizar apenas artefatos de revisão com retenção finita e SHA-256: Setup, manifests/conteúdo, relatório de gates/smoke e inventário de notices/deps. CI não executa instalador nesta configuração.

Smoke lança **o executável empacotado** fora do repo, cwd temporário próprio e perfil test fixado, com timeout (proposta 60 s), código de saída e limpeza limitada à raiz temporária/test criada. O smoke cria uma cópia de teste do pacote e concede a ACE aprovada (`S-1-15-2-1:(OI)(CI)(RX)`) somente a essa cópia, sem tocar pais, dados/perfis ou roots globais; nenhum modo inseguro é usado. Modo diagnóstico de teste não aceita paths/canais livres nem afrouxa isolamento. Deve carregar assets/preload reais, invocar a mesma operação a partir do renderer autorizado, validar resultado SQLite e encerrar; falha de preload/IPC/armazenamento/crash/hang reprova, não basta detectar janela/processo. Repetir lançamento verifica reabertura. Prova da segunda instância mantém primeiro processo vivo e verifica que o segundo não abre DB. Não usar navegador headless como substituto.

O runner Windows hospedado usa administrador com UAC desabilitado ([GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners#administrative-privileges)); sucesso nele não prova conta padrão, ausência de prompt ou permissão corporativa. A matriz abaixo é gate adicional manual em ambiente aprovado.

### D7 — Aceitação F01–F09 e prova em conta padrão

| Critério | Evidência exigida no apply |
| --- | --- |
| F01 Toolchain | Registro de versões/engines/peers/licenças; lockfile; npm ci limpo, lint/typecheck/test/build sem mascarar erros. |
| F02 Isolamento | IPC válido e negativas de frame/webContents/origem/payload; renderer sem Node; CSP/traversal/navegação/permissões; pacote sem origem dev. |
| F03 Pacote autocontido | Exe/preload/assets/prova SQLite embarcada completos; smoke em cwd externo e execução offline sem Node/npm instalados no destino. |
| F04 Conta padrão | Windows 11 x64 autorizado, usuário fora de Administrators, UAC ativo; Setup normal sem prompt/admin/download extra; lançamento pelo atalho/exe instalado. |
| F05 Escopo | Manifests app/Setup/uninstaller asInvoker; pasta aprovada, HKCU e Start Menu atual; sem gravações globais, elevate.exe, updater ou serviços. |
| F06 Argumentos/falhas | `/currentuser`, `/allusers`, combinação conflitante, `/S`, `/D` válido/inválido, HKCU anterior inválido, espaços/acentos/redirecionamento, destino inacessível; recusa preserva instalação/dados existentes. |
| F07 Manutenção | Marcador persiste entre reinícios, upgrade fictício 0.1.0→0.1.1, uninstall e reinstalação; segunda conta tem dados/registro separados e não altera primeira. |
| F08 SQLite/ownership | Write/read/rollback/reopen no main pelo diagnóstico instalado; falha segura; segunda instância perde lock antes de abrir DB; perfis dev/test/prod separados. |
| F09 Conteúdo/documentação | Inventário/manifest/notices/SHA-256, runbook, resultados por cenário e limitações; artefato interno sem publicação; bloqueio de política registrado sem contorno. |

Runbook futuro em `docs/desktop-foundation-validation.md`: VM/máquina de teste dedicada autorizada, snapshot anterior quando disponível, build/hash/OS/arquitetura, pertença efetiva aos grupos e UAC antes da prova. Não instalar Node/npm/ferramentas dev nesta conta. Observação de arquivos/registro/atalhos e delta de serviços/permissões deve distinguir efeitos do próprio instalador de ruído do SO; preferir captura de evidências por observador separado sem elevar o processo testado. Usar duas contas fictícias, rede desligada durante instalação/execução e dados artificiais; versões de manutenção geradas sem alterar ID/root. Comparar fingerprint do marcador antes/depois de cada etapa, não apenas mensagem de sucesso.

Registrar resultados PASS/FAIL/BLOCKED por cenário, passos, códigos, manifestações, snapshots sanitizados e evidência de ausência de prompt. Não incluir nome real, perfil/caminhos pessoais, conteúdo de usuário ou segredo em logs/screenshots. Bloqueio SmartScreen/AppLocker/WDAC/antivírus não é aceitação nem licença para bypass. Se assinatura for requisito do ambiente, suspender a execução e revisar como obter artefato autorizado, sem comprar certificado/serviço nesta Change. Deixar F04/F07 pendentes quando faltar ambiente/evidência; não marcar Change verificada/concluída com build isolado.

## Risks / Trade-offs

- [NSIS exclusivo no padrão, mas destino substituído] → validar destino final/args/HKCU nas fases de instalação e remoção; inspecionar script e repetir negativas no artefato.
- [Known Folder redirecionado ou reparse point] → resolver caminho efetivo e permitir só root explicitamente aprovado; falhar com mensagem segura se não comprovado, sem comparação ingênua de prefixos.
- [Driver sem prebuilt/ABI compatível] → ocorrido na revisão de G4 em 2026-10-04: sem prebuilt para o ABI 149 e sem MSVC no PC autorizado; alternativa embarcada aceita explicitamente, atualizada nos artefatos; sem fallback silencioso ou binário de Node de build.
- [node:sqlite RC] → aceitação explícita registrada em 2026-10-04; a prova no Electron fixado continua medindo disponibilidade e comportamento, sem inferir pelo Node externo.
- [CSP/protocolo impedem assets ou deixam escape] → teste empacotado de carregamento e negativas; permitir apenas recursos locais necessários.
- [Identidade muda e perde upgrade/dados] → aprovar e fixar IDs/roots antes do primeiro pacote; teste de duas versões e retenção.
- [CI administrador produz evidência insuficiente] → exigir conta padrão/UAC ativo fora do runner; nenhuma conclusão sobre instalação com smoke de CI.
- [Assinatura/política impede prova] → marcar bloqueio e revisar ambiente autorizado; não contornar controles nem confundir per-user com permissão de execução.
- [Teste toca dados reais ou outra Change] → profiles/fake DB, limpeza somente do test criado; sem leitura Chrome/cópia em massa.
- [Estado `done` da CLI confundido com aprovação] → roadmap IN_REVIEW, tasks pendentes e aprovação humana antes do apply/relatório/archive.

## Migration Plan

1. Agora: artefatos e roadmap para revisão; validar OpenSpec e diff. Sem scaffold, dependências, workflow ou instalador executado.
2. Antes do apply: registrar aprovação explícita dos artefatos e dos gates G1–G6 abaixo. Se decisão mudar comportamento/abordagem, atualizar proposal/design/specs/tasks e revisar novamente antes do ponto alterado.
3. No apply autorizado: construir scaffold/isolamento/prova, gates, pacote e smoke; produzir runbook e duas versões fictícias. Instalação somente no ambiente que receber autorização específica.
4. Executar matriz padrão, registrar evidências e limites e atualizar docs/test-strategy/parity com apenas comportamento efetivamente entregue. Gerar relatório `verification.md` por openspec-verify-change; aprovação explícita do relatório precede archive.
5. Archive/README factual/commit/PR/integração e TFA-003 exigem ações autorizadas correspondentes; não iniciar automaticamente. Persistência de produto permanece futura.

Rollback da prova: restaurar snapshot do ambiente ou desinstalar somente app/conta de teste, preservando marcador por default. Limpeza explícita de dados fictícios só na raiz aprovada após recolher evidências. Rollback do código usa Git próprio sem reescrita de histórico; jamais alterar origem ou tratar downgrade binário como recuperação de banco de produto.

## Gates de revisão antes do apply

Estas são escolhas **propostas**, não lacunas a decidir unilateralmente no apply. O pedido do usuário exige expô-las para revisão; a proposta não as trata como aprovadas. Aceitar G1–G6 mantém os contratos atuais; escolher alternativa material requer ajustar/revisar o plano antes da implementação.

| Gate | Recomendação concreta para aprovação | Alternativa / consequência |
| --- | --- | --- |
| G1 Ambiente/alvo | Windows 11 x64, duas contas padrão fictícias, UAC ativo, VM/máquina de teste autorizada; indicar ambiente e autorização de instalar ali | Win10/ARM64 e ambiente corporativo não são alvos provados desta Change; incluir exige matriz/binários/revisão. |
| G2 Instalador/args | NSIS offline one-click exclusivo per-user; `/allusers` recusado; `/currentuser`/`/S` sob guard; `/D` apenas destino canônico aprovado | Assistido precisa projeto próprio para não oferecer all-users. |
| G3 Identidade/paths | Aprovar tabela D3 e root Known Folder; redirecionamento fora do perfil bloqueado até aprovação explícita | Escolher nomes/raízes antes do primeiro pacote; não inventar publisher. |
| G4 Versões/driver | Matriz D1; prova com node:sqlite embarcado no Electron 44.5.1, aceito explicitamente em 2026-10-04 diante da indisponibilidade de prebuilt (ABI 149) e de MSVC no PC autorizado | better-sqlite3 externo exigiria compilador/elevação; JSON exigiria nova revisão material. |
| G5 Retenção | Manter dados/marcador em upgrade, uninstall e reinstalação; nenhuma remoção automática | Não equivale a política final de dados TFA-011; exclusão exige fluxo separado. |
| G6 Execução/assinatura | Artefato de teste sem assinatura comercial somente se permitido no ambiente autorizado; nenhum bypass | Se o ambiente exigir assinatura, definir obtenção autorizada antes da prova, sem contratação/publicação automática. |

## Open Questions

Somente detalhes que não mudam os contratos: SHA exato das actions e versões auxiliares compatíveis do lockfile, escolhidos/revisados no gate F01; local de guarda/retenção das evidências internas definido no runbook; revisão de acabamento de ícones/distribuição definitiva fica TFA-011. G1–G6 são gates de aprovação acima, não perguntas adiadas para decisões silenciosas.
