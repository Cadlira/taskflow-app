# Tasks

Checklist do apply da TFA-002, autorizado em 2026-10-03 após aprovação humana de proposal/design/specs/tasks e G1–G6. Dependência TFA-001 integrada. A prova do instalador está autorizada somente neste PC Windows 11 x64 com duas contas padrão fictícias e UAC ativo; registrar bloqueios sem bypass. Se uma alternativa material for escolhida, revisar o plano antes de implementar o ponto afetado, sem fallback silencioso.

Em 2026-10-03, após falha real do sandbox por ACL no diretório de desenvolvimento, o usuário aprovou revisar e configurar leitura/execução do AppContainer (`S-1-15-2-1`) restrita ao root instalado `TaskFlowApp`; pais, dados e caminhos globais continuam fora do escopo.

Em 2026-10-04, o usuário aprovou: (a) a revisão de G4 — prova SQLite com `node:sqlite` embarcado no Electron 44.5.1, com API release candidate aceita explicitamente, diante da ausência de prebuilt para o ABI 149 e de MSVC no PC autorizado; e (b) a extensão da mesma ACE somente ao diretório temporário de teste criado pelo `smoke:packaged`. Registro no roadmap.

Cada grupo inclui verificações e documentação pertinentes. Evidências usam dados fictícios; origem e Git da extensão permanecem somente leitura. Critérios F01–F09 no design; contratos nas specs `desktop-foundation`, `windows-per-user-installation` e `desktop-build-validation`.

## 1. Aprovação, toolchain e scaffold próprio

- [x] 1.1 Conferir aprovação humana dos artefatos/G1–G6, ambiente autorizado e branch/root próprios; registrar decisões/data no roadmap e verificar que não há escolha material pendente antes de criar runtime ou executar instaladores.
- [x] 1.2 Revalidar as versões D1, auxiliares/peers, licenças/notices e disponibilidade/origem/checksums dos binários; registrar inventário em docs/desktop-foundation-validation.md e verificar que versões e armazenamento (node:sqlite embarcado, G4 revisado) não mudaram sem revisão e não existem peers forçados.
- [x] 1.3 Criar package.json/lockfile e estrutura main/preload/renderer/contratos com electron-vite/Vue/Pinia, Node/npm fixados e tsconfigs strict separados; verificar npm ci limpo e build dos três entrypoints, sem copiar WXT/postinstall ou configurações pessoais.
- [x] 1.4 Configurar lint, tsc + vue-tsc, Vitest, scripts dev/build/validate e presets compatíveis; verificar comandos individuais/agregador, propagação de falha e documentação exata dos comandos/versões no runbook.

## 2. Janela mínima e fronteiras de segurança

- [x] 2.1 Criar janela mínima local com identidade/versão, botão diagnóstico e estados acessíveis de execução/sucesso/erro, isolamento/sandbox e Pinia transitório; verificar teclado, renderer sem Node/fs e erro seguro, sem interfaces de tarefas ou recursos futuros.
- [x] 2.2 Implementar protocolo de assets limitado e CSP distinta dev/prod, bloqueios de navegação/janelas/webviews/permissões; verificar carregamento e negativas de traversal/host/absoluto/escape e que env dev não habilita conteúdo remoto no pacote.
- [x] 2.3 Implementar somente verifyFoundation versionado, preload explícito e guard main por webContents/frame/origem/schema/1 KiB; testar sucesso, iframe/remetente/origem/shape/versão/tamanho inválidos, BUSY e erro sanitizado antes de efeitos, sem canais/caminhos/SQL livres.
- [x] 2.4 Adaptar seletivamente o teste de fronteiras observado na origem para barrar Electron/Node/infraestrutura/Vue/Pinia/Chrome/rede no núcleo e autoridade indevida no renderer; verificar com fixtures de violações que as regras detectam imports/acessos proibidos, sem teste vacuamente aprovado.
- [x] 2.5 Documentar contrato diagnóstico, origem/CSP/permissões e limites provisórios em docs/architecture.md/runbook; revisar contra a spec desktop-foundation e não anunciar IPC funcional TFA-003 ou abertura de URLs disponível.

## 3. Identidade, ownership e prova SQLite fictícia

- [x] 3.1 Configurar identidade/AUMID, userData/sessionData e dev/test/prod conforme D3, lock antes do DB e fechamento seguro; testar perfis isolados, segundo processo sem banco e fechamento durante prova sem processo residual, documentando diferença provisória de ciclo de vida TFA-008.
- [x] 3.2 Implementar adapter main do armazenamento aprovado (`node:sqlite` embarcado, G4 revisado em 2026-10-04) e banco exclusivamente foundation-proof com marcador aleatório inserido uma vez; verificar write/read e fingerprint estável em nova execução, sem tocar Chrome, diretório de instalação ou criar schema/repository de tarefas.
- [x] 3.3 Integrar transação de alteração fictícia/rollback/reopen ao diagnóstico autorizado; testar rollback sem commit parcial, erro de abertura/permissão sem reset/fallback, liberação após erro e fingerprint anterior conservado.
- [x] 3.4 Provar o armazenamento embarcado aprovado (node:sqlite; G4 revisado em 2026-10-04) no executável empacotado: disponibilidade e transações reais, ausência de addon externo/segundo driver/fallback, inventário de recursos/notices do pacote e compiladores desnecessários no build/destino.
- [x] 3.5 Registrar conclusão limitada da prova em docs/architecture.md e docs/parity-matrix.md; verificar que ela informa viabilidade de empacotamento/ownership e não confirma durabilidade/recovery/migrações/concorrência de dados TFA-003.

## 4. Instalador Windows exclusivamente per-user

- [x] 4.1 Criar configuração electron-builder NSIS offline x64 one-click/perMachine false, app asInvoker, sem elevate helper/updater/runAfterFinish/remoção de dados/publicação; derivar ICO mínimo do master SVG revisado; após validar o destino, conceder somente ACL AppContainer ReadAndExecute herdável ao root instalado TaskFlowApp e verificar identidade/pasta/atalho Start Menu sem assets futuros.
- [x] 4.2 Criar include NSIS pequeno com guards de argumentos/destino final/Known Folders/HKCU anterior/instalação de máquina e remoção; validar a ACL restrita no root instalado, sem propagação a pais/dados/globais; revisar script gerado e testar recusa allusers/conflitos/malformados, /D fora do canônico, reparse/traversal/outro usuário e root redirecionado não aprovado antes de efeitos sobre instalação/dados.
- [x] 4.3 Implementar package:win com build e --publish never, extrair manifests app/Setup/uninstaller e inventário de efeitos; verificar asInvoker nos três, arquitetura x64, binários/notices completos e ausência de helper/serviço/gravação global.
- [x] 4.4 Preparar manutenção manual de duas versões fictícias mantendo ID/root e uninstall com retenção customizada; verificar pacote 0.1.0/0.1.1, guard de destino também na remoção e ausência de apagamento de userData/sessionData ou absorção de instalação HKLM.
- [x] 4.5 Documentar runbook de instalação/upgrade/uninstall, args, paths/chaves/atalhos, perfis redirecionados, falhas e retorno seguro; conferir cada passo/resultado esperado contra windows-per-user-installation, distinguindo provisório de distribuição definitiva TFA-011.

## 5. Inspeção, smoke do pacote e CI mínima

- [x] 5.1 Implementar verify:package com inventário permitido, manifests, IDs, assets/preload/armazenamento/licenças e SHA-256; testar ausência de recurso necessário e inclusão de segredo/helper/dependência indevida como falhas, sem criptografia/segurança presumidas por ASAR.
- [x] 5.2 Implementar smoke:packaged do exe em cwd externo/perfil test restrito e timeout 60 s, passando por renderer/preload/IPC reais até rollback/reopen, reinício e segunda instância; verificar fingerprint persistente, códigos de saída e nenhuma escrita em prod.
- [x] 5.3 Verificar negativas integradas de preload/IPC/armazenamento inválidos, crash/timeout e tentativa de ampliar perfil/caminho/origem; confirmar reprovação e limpeza somente de processos/pastas test criados, sem afrouxar sandbox para passar o smoke.
- [ ] 5.4 Criar workflow Windows PR/push com Node/npm/actions SHA fixados, npm ci e gates/build/NSIS --publish never/inspect/smoke, permissions mínimas e artefatos internos com retenção finita; verificar run e relatórios/hashes, sem release, segredo de assinatura ou execução de Setup na CI.
- [x] 5.5 Atualizar docs/test-strategy.md/runbook com comandos e evidência CI/pacote, ambiente e níveis de validação; verificar que nenhum smoke no runner administrador é apresentado como prova em conta padrão/UAC ou de funcionalidades futuras.

## 6. Prova em ambiente Windows padrão autorizado

- [x] 6.1 Preparar ou obter o ambiente G1/G6 autorizado com duas contas fictícias fora de Administrators/UAC ativo, sem Node/npm dev; registrar OS/build/arquitetura, hashes e baseline sanitizado de arquivos/registro/atalhos/serviços, verificando autorização antes de executar Setup.
- [x] 6.2 Executar instalação offline por lançamento normal e abrir exe/atalho instalado fora de dev; verificar F03/F04/F05, isolamento/diagnóstico SQLite F02/F08, manifests e ausência de prompt/admin/download/helper/serviço/efeitos globais, recolhendo evidências sanitizadas.
- [x] 6.3 Executar matriz F06 de /currentuser, /allusers isolado/combinado, /S, /D canônico/não permitido, HKCU anterior inválido, all-users legado, caminhos com espaços/acentos/redirecionados/reparse e destino inacessível; verificar códigos/recusa sem alterar instalação/dados existentes e documentar cada PASS/FAIL/BLOCKED.
- [x] 6.4 Executar reinício, segunda instância, upgrade fictício, uninstall e reinstalação na conta padrão; verificar F07/F08 por fingerprint do marcador antes/depois, versão/identidade, remoção só de binários/HKCU/atalhos e retenção da raiz de dados.
- [ ] 6.5 Executar instalação/diagnóstico/manutenção na segunda conta; verificar isolamento de perfis/registro/atalhos e preservação da primeira instalação/marcador, documentando as evidências fictícias.
- [x] 6.6 Consolidar matriz F01–F09 e evidências sanitizadas no runbook/Change, com resultados por cenário, versões, hashes e limitações; verificar que bloqueios de política são registrados sem bypass e deixam o gate pendente, sem marcar teste de produto completo ou paridade migrada.

## 7. Integração e entrega para revisão

- [x] 7.1 Rodar gates próprios e validação OpenSpec estrita com comandos suportados, revisar diff/links/consistência e escopo contra três specs/F01–F09; verificar ausência de segredos/dados reais, preservação de trabalho preexistente e nenhum write/build/test na extensão.
- [x] 7.2 Executar openspec-verify-change e gerar verification.md dentro desta Change, mapeando requisitos/cenários/tasks às evidências e pendências; verificar que F04/F07 bloqueados impedem conclusão e entregar o relatório para aprovação explícita antes do archive.
- [x] 7.3 Atualizar roadmap com estado/etapa/datas/evidências pertinentes e entregar resultado concreto de implementação para revisão; verificar que README operacional factual será ajustado após archive autorizado e que não houve archive/merge/release/TFA-003 por inferência.
