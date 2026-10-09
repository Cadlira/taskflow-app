# Design

## Decisões aprovadas no apply — 2026-10-08

R1–R7 resolvidas no escopo descrito em [approval.md](approval.md): uso pessoal,
Windows 11 x64 conforme provas, par privado 0.2.0→0.2.1, manutenção na conta atual,
retenção integral de perfil/cache/IA cifrada, unsigned e builds locais sem upload.
R7 substitui a recomendação histórica de CI/14 dias; acesso/custo/retenção externos
não são presumidos. Não criar segunda conta, nem converter sua exclusão em PASS;
logoff/login real e ausência de Node/npm permanecem não comprovados.
[IR1](implementation-review.md) aprovado autoriza a adaptação versionada dos templates
fixados, com guardas anteriores a SetOutPath e sem editar node_modules; custom script
gera seu próprio uninstaller, inspecionado e unsigned. [IR2](legacy-transition-review.md)
aprovado autoriza somente a transição manual separada do legado: não constitui prova
de upgrade seguro e não muda sua recusa pelo Setup novo. Guias e CI devem refletir
estas decisões, mantendo os contratos e evidências exigidos em D2–D10.

[IR3](silent-uninstall-review.md) aprovada posteriormente: manter NSIS sem controlador PowerShell novo. O launcher normal do uninstall, inclusive /S, pode retornar0 antes do filho e não oferece contrato de automação por exit code. Observar recusa/conclusão efetiva. A exceção não dispensa guardas, ownership ou retenção, nem o não zero do Setup/predecessor executado em cópia verificada com _?=.

## Context

Ver [proposal](proposal.md), Why, e [exploração/W01–W15](../../../docs/roadmap.md#tfa-011--instalador-definitivo-e-distribuição-windows). Base integrada `f91ce401c8648a8d0aa984975c72885f9c023ee6`, branch própria reutilizada, OpenSpec 1.14.0/schema `spec-driven`. Este design é proposta para revisão, não decisão humana nem evidência executada.

Referências locais necessárias ao desenho:

- [TFA-002 design](../archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/design.md), [verification](../archive/2026-10-04-preparar-fundacao-desktop-e-validar-instalacao-por-usuario/verification.md) e [prova da fundação](../../../docs/desktop-foundation-validation.md): manutenção fictícia 0.1.0→0.1.1/duas contas; F06 15 PASS/3 BLOCKED (Unicode, redirecionamento, legado all-users). Não comprovam o produto completo.
- [TFA-008 verification, atualização 4](../archive/2026-10-06-migrar-lembretes-e-ciclo-de-vida-desktop/verification.md): tray/toast/COM/startup/manutenção instalados; segunda conta/Unicode dispensados e logoff simulado. [TFA-009 dispensas](../archive/2026-10-07-adaptar-quick-add-captura-e-atalhos-globais/closure-waivers.md): Q13 integral e campanha instalada/humana não comprovados. Não reabrir fechamento nem converter dispensa em PASS.
- [TFA-010 design](../archive/2026-10-07-migrar-provedores-ia-e-sugestao-de-subtarefas/design.md), [tasks](../archive/2026-10-07-migrar-provedores-ia-e-sugestao-de-subtarefas/tasks.md), [verification](../archive/2026-10-07-migrar-provedores-ia-e-sugestao-de-subtarefas/verification.md): produto completo, SQL2/codec4, 43/14 wrappers, IA fictícia no smoke; Setup e provedor real não executados. Waive do provedor permanece.
- [Configuração](../../../package.json), [include NSIS](../../../build/installer.nsh), [CI](../../../.github/workflows/ci.yml), [inspeção](../../../scripts/verify-package.mjs): NSIS one-click/x64 offline/per-user já existe. CI escolhe primeiro Setup por glob; ASAR aceita `out/**`, varredura externa e notices são parciais. `release/` contém 0.1.0 completo e 0.1.1 histórico da fundação.
- [Identidade](../../../src/main/desktop/native-identity.ts), [perfis](../../../src/main/profile.ts), [registro](../../../src/main/desktop/windows-registry.ts), [SQLite](../../../src/main/storage/product-database.ts), [preferências](../../../src/main/shortcuts/file-preferences.ts), [IA](../../../src/main/ai/file-ai-config.ts): paths e dados estão separados; o runtime espera LocalAppData/Programs, enquanto NSIS admite Known Folder dentro do perfil. Conflitos de metadata são verificados em `customInstall`, após extração. PowerShell/icacls são componentes do SO, não dependências a instalar.

## Goals / Non-Goals

**Goals:** conectar bytes empacotados, bytes instalados e campanha ao mesmo candidato; recusar manutenção insegura antes de efeitos destrutivos; tornar falhas parciais e compatibilidade observáveis; separar autorização, prova automática e prova humana.

**Non-Goals:** criar protocolo de update/IPC de manutenção, transação atômica do instalador, migração de schema, snapshot automático do perfil, telemetria ou promessa de ausência universal de segredos por scanner. Não homologar todas as jornadas/acessibilidade TFA-012 nem repetir AI16 pago ou benchmark Q13 integral. Exclusões de produto: proposal/Impact.

## Decisions

### D1 — Duas capabilities existentes, com contrato de revisão separado

Os deltas de instalação e validação cobrem manutenção, proveniência e guia manual sem capability redundante. Lifecycle, IA e atalhos fornecem contratos existentes e testes de integração, não novos comportamentos nesta Change. Se o apply encontrar defeito que exija mudar esses contratos, revisar escopo/artefatos antes desse ponto e continuar somente trabalho independente aprovado.

As recomendações abaixo formam um plano concreto; R1–R7 são decisões de aprovação, não perguntas técnicas adiadas. A autorização de propose não escolhe nenhuma delas. Antes de qualquer apply, registrar quais artefatos/tarefas foram aprovados; antes de cada ação dependente, exigir a resolução humana correspondente. Sem aprovação completa, não anunciar readiness/distribuição.

| Revisão | Recomendação concreta | Aprovação/evidência exigida e tarefa dependente |
| --- | --- | --- |
| R1 Público e identidade legal | Uso pessoal/controlado; conservar identidade técnica. `author: TaskFlow App` atual é placeholder, não publisher legal | Informar público e responsável legal ou aceitar explicitamente ausência de atribuição empresarial; aprovar CompanyName/author verídicos. Bloqueia metadados finais e qualquer distribuição; não inferir QSI/domínio |
| R2 Windows alvo | Windows 11 x64, somente builds/edições comprovadas | Registrar build/edição suportada e testada; Win10/ARM64 fora. Bloqueia declaração de suporte; incompatibilidade exige revisão |
| R3 Versão e par de manutenção | 0.2.0 como predecessor completo com guardas, 0.2.1 como candidato final, ambos privados de prova | Aprovar versões e dois commits/hashes distintos; alternativo: outro par monotônico aprovado. 0.1.1 histórico excluído. Aprovar a recusa de upgrade direto via uninstaller inseguro 0.1.0 e procedimento separado de transição, sem silenciosamente ampliar o escopo |
| R4 Ambiente de prova | VM limpa autorizada, sem Node/npm, conta padrão não elevada/UAC ativo; perfil com espaços/Unicode; segunda conta isolada | Autorização específica de Setup/upgrade/uninstall, contas, snapshots/falhas simuladas e logoff/login/reboot, com OS/SID/token/roots conferidos. Não criar conta/VM nem tocar instalação corporativa por inferência. Cenários sem ambiente ficam BLOCKED |
| R5 Retenção/recuperação | Conservar integralmente profiles/user-data/session-data e IA cifrada; exclusão manual separada, sem checkbox | Aprovar dados/cache/credencial retidos, guia de remoção por root confirmado e recuperação seletiva sem `ai.json` em backup; não autoriza executar remoção |
| R6 Assinatura | Candidato não assinado para prova controlada; sem serviço/segredo novo | Aceitar unsigned e possíveis bloqueios. Se assinatura for obrigatória, revisar tasks/configuração e obter identidade/contrato/autorização próprios antes de assinar; não adquirir nem configurar automaticamente |
| R7 Origem/retenção/canal | CI como candidato, fallback build local rastreável, artefatos por 14 dias; entrega manual futura | Confirmar visibilidade/permissões/custo do repositório e retenção; canal público/privado e distribuição somente por autorização posterior. Upload de revisão segue acesso real do repositório, não `private` do npm |

### D2 — Conservar NSIS e identidade, recusar divergência de caminho

Manter offline/oneClick/perMachine=false/packElevateHelper=false/runAfterFinish=false/deleteAppDataOnUninstall=false, Menu Iniciar per-user e sem atalho desktop, serviços, associações ou updater. Conservar asInvoker/uiAccess=false nos três executáveis, payload x64 e ACE `(OI)(CI)(RX)` apenas no root binário. Stub NSIS x86 não implica app x86.

| Vínculo estável | Valor |
| --- | --- |
| package/product/executable/pasta | `taskflow-app` / `TaskFlow App` / `TaskFlowApp` / `TaskFlowApp` |
| appId/AUMID prod | `taskflow.app` |
| GUID NSIS derivado | `c791496c-2f51-5fc2-ac5c-b8a63e04e47a` |
| CLSID prod | `{8B9BA547-6778-4F8E-873F-C3171C4EE08D}` |
| Startup | `taskflow.app.startup.v1`, comando `"<exe>" --taskflow-login` |
| Metadata | `HKCU\Software\TaskFlow App\NativeIdentity\v1` |
| Binários/dados | UserProgramFiles + TaskFlowApp, coerente com `%LOCALAPPDATA%\Programs\TaskFlowApp`; dados `%LOCALAPPDATA%\TaskFlowApp\profiles\<dev|test|prod>` |

Resolver pastas pelo SO e comparar equivalência canônica, ownership e ausência de reparse/UNC/escape; não confiar apenas em variáveis de ambiente. Se UserProgramFiles divergir do esperado no main, recusar antes de remover/substituir e orientar revisão. Inclui redirecionamento dentro do perfil; não fazer fallback global. O Menu Iniciar/target/cwd/AUMID/CLSID devem concordar; versão futura/registro estrangeiro não é corrigido automaticamente. Manter guards `/allusers`, `/S`, `/currentuser`, `/D` e HKCU inválido/HKLM legado.

Alternativas: instalador assistido ou MSI/MSIX/Squirrel (mudam prova sem benefício); aceitar redirecionamento alterando o runtime (amplia suporte/arquitetura, exige revisão); novo GUID (quebra identidade). [NSIS v26](https://www.electron.build/v26/docs/nsis/) e template fixado são referências, não opções v27 adotadas automaticamente.

### D3 — Recusa de app ativo, incluindo o desinstalador anterior

Usar o hook pequeno `customCheckAppRunning` suportado no [template 26.17.0](https://raw.githubusercontent.com/electron-userland/electron-builder/electron-builder@26.17.0/packages/app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh), sem editar `node_modules`. Detectar processos do usuário/caminho canônico, incluindo children e relay COM; consulta falha/timeout/ownership desconhecido ⇒ recusa com motivo sanitizado. Não usar só nome/USERNAME nem encerrar processos. Mensagem orienta salvar rascunhos e **Sair**; `/S` recusa sem diálogo/bypass. Setup e predecessor executado em cópia verificada com _?= retornam erro. O launcher normal do uninstall segue a limitação IR3; seu retorno não prova o resultado efetivo. X/Alt+F4 deixam tray e devem reprovar manutenção.

O hook do uninstaller executa antes de `customUnInit`: a guarda deve resolver/validar destino antes de confiar em `$INSTDIR`, funcionar nas duas compilações e não criar efeitos de registro/ACL para consultar processos. Revalidar próximo à fase destrutiva; não remover a validação tardia existente. Inspecionar ordem no NSIS gerado e testar app reaberto entre fases, operação em voo, COM e instaladores concorrentes.

**Desinstalador legado:** `uninstallOldVersion` executa o binário anterior com `/S /KEEP_APP_DATA`. Corrigir somente o hook novo não muda os bytes antigos; seu template pode matar processo surgido entre checks. Por isso, o candidato não deve invocar automaticamente um desinstalador cujo comportamento seguro não esteja comprovado. Validar procedência/caminho e capacidade de manutenção da versão anterior; sem evidência compatível ⇒ recusar antes de invocação/remoção. Para o par R3, ambos os pacotes completos já contêm guarda segura. Não sobrescrever/injetar código no uninstaller antigo, passar flag de bypass nem introduzir lock/IPC novo no app para disfarçar a lacuna.

A transição da instalação 0.1.0 antiga exige revisão R3: desinstalação manual antiga com app explicitamente encerrado seguida da instalação nova pode reter dados, porém perde startup e ainda possui risco legado. Não executá-la nem qualificá-la como upgrade seguro desta Change sem autorização específica; se o usuário exigir upgrade direto, revisar design/specs/tasks antes de implementá-lo. Recusa conservadora é preferível a uma promessa não demonstrável. Alternativas rejeitadas: kill após timeout; autochamada de Sair por IPC; substituir todo template para implementar migração legada.

### D4 — Preflight e falhas parciais sem falsa atomicidade

Verificar identidade/metadata/atalho/COM próprios ou ausentes e versão de manutenção antes de chamar remoção anterior, extrair ou alterar registro/atalhos. Checks de argumentos/path/ownership conhecidos devem ser sem efeitos destrutivos; conservar recursos estrangeiros inclusive Run/StartupApproved no cleanup. Revalidar ownership na mutação para reduzir races. Conflito/futuro ⇒ recusa sem alteração dos recursos preexistentes; código não zero no Setup/execução direta comprovada do predecessor. O launcher normal do uninstall segue a limitação IR3 e exige observar o resultado efetivo.

Depois de começar a instalação, falhas de extração/ACL/registro/espaço podem deixar binários parciais. Registrar fase/motivo, não abrir app automaticamente nem declarar sucesso; perfil de dados nunca é destino de extração/removal. Guia distingue recusa prévia intacta de falha parcial e permite reinstalar pacote íntegro compatível. Não prometer rollback transacional. Injeções de falha só em sandbox fictício autorizado, sem cortar energia real.

### D5 — Seleção exata e proveniência de cada build

Staging por build/version/arquitetura, limitado ao workspace/runner temporário validado; não apagar `release/` histórico indiscriminadamente. Versões aprovadas em package/lock/PE/runtime/Setup devem coincidir. Falhar se Setup esperado ausente, duplicado, com versão errada ou associado a outro manifest; nunca escolher primeiro glob. Identificação externa inclui versão + win-x64 + commit/run; nome interno do exe permanece estável.

Manifesto sanitizado: commit e estado limpo (ou divergência que invalida candidato), versão, toolchain/build/runtime/SQLite/NSIS e checksums resolvidos, lockfile hash, OS/arquitetura, run/origem, filenames relativos/tamanhos/SHA-256, estado de assinatura e hashes de exe/ASAR/recursos/notices. A prova instalada compara bytes correspondentes ao manifesto, inventaria arquivos gerados pelo Setup (uninstaller/atalho) separadamente e impede substituir o candidato depois do teste. Mutação relevante gera novo hash e nova evidência afetada.

Reproduzibilidade é reconstrução rastreável e payload funcional equivalente, não Setup byte-a-byte prometido: timestamps/assinatura podem mudar. Preservar cópias exatas do par de prova, incluindo hashes, dentro da retenção aprovada. Build local é alternativa equivalente somente com gates/proveniência iguais, não um caminho de exceção.

### D6 — Inspeção completa e notices dos componentes distribuídos

Inventariar recursivamente todo `win-unpacked`, resources, arquivos/unpacked do ASAR e conteúdo que o Setup entrega; comparar após instalar em W03/W08. Relacionar cada entrada a runtime/recurso/notice/diagnóstico permitido, arquitetura, tamanho/hash/origem. Não limitar a verificação a nomes dentro do ASAR ou ao manifest do uninstaller; dependências classificadas como dev podem estar incorporadas no bundle.

Revisar licenças efetivamente incorporadas (Electron/Chromium/Node/SQLite, Vue/Pinia e transitivas distribuídas, recursos do instalador quando aplicável); entregar copyrights/textos pertinentes e inventário ligado à versão. @resvg/builder/asar são tooling, não runtime a incluir. Nenhuma certificação jurídica inferida. Notices ausentes/mismatched reprovam.

Negativas em cópias de teste: arquivo proibido sob caminho aparentemente permitido; sentinela fictícia de `.env`/configuração/dados/segredo em conteúdo textual; arquivo externo inesperado, symlink/escape, mapa/fixture, ícone/notice ausente e payload/hash adulterado. Scanner é defesa adicional: revisão da lista de entradas e proveniência continuam necessárias; nunca inserir ou buscar chaves reais para provar ausência. Sanitizar achados, sem imprimir conteúdo.

Conservar sandbox/contextIsolation/CSP e catálogo 43/14. Diagnóstico agrupado no main pode permanecer somente explicitamente inventariado, com ativação restrita a test e prova de recusa em prod. Não expor nova bridge/harness pública. ASAR não cifra código. PowerShell/icacls são precondições do SO; testar erro seguro se indisponíveis, sem instalar runtime externo ou bypass de política.

### D7 — Ícones e integração do hash final

Preservar [SVG](../../../assets/taskflow-icon.svg)/[gerador ICO](../../../scripts/generate-windows-icon.mjs) 16/24/32/48/256 e check branco/#5368e8. Conferir mesmo recurso no exe/Setup/uninstaller/runtime; atalho/tray/toast devem resolver esse recurso. Prova visual em claro/escuro e DPI 100/150/200%; gerar ICO não comprova aparência. Tray permanece sem GUID no unsigned; [Electron Tray](https://www.electronjs.org/docs/latest/api/tray/) condiciona estabilidade do GUID à associação/assinatura do executável.

No pacote final instalado: X→tray, Abrir/Quick Add/captura explícita de cópia com app externo em foco, conflito real/rebind/restart/liberação de atalhos, segundo lançamento sem escritor duplo, toast/clique→localizar/COM e startup opt-in/out/desabilitado externamente. Logoff/login real somente autorizado, separado de simulação. Jornada usa fixtures pequenas; não redesenha foco, captura, lembretes ou IA. Ausência de ambiente ⇒ BLOCKED, não sucesso inferido do smoke.

### D8 — Retenção e recuperação sem transportar credenciais

Atualização/reparo/uninstall/reinstall conservam raiz de profiles integral: tarefas/lixeira válida/recorrências/subtarefas/IDs/revisões/markers, SQL2/codec4, preferências shortcuts v1, IA v1 cifrada e session-data/cache. Upgrade conserva escolha e desativação externa de startup; uninstall remove somente recursos próprios e reinstall inicia OFF. Desinstalar não apaga dados nem revoga credencial no provedor. Exclusão manual separada: Sair, confirmar root real/ownership, selecionar perfil autorizado e confirmar perda; guia não oferece comando amplo nem wipe automático e sua redação não autoriza execução.

W09 compara estado lógico com fixtures de tempos controlados, evitando expurgo/claim entre leituras. Não exigir hash SQLite idêntico após uso; verificar IDs/revisões/markers/codec e limites de lembretes (graça 5 min, sem replay/exactly-once). W10 usa credencial fictícia com DPAPI real e verificação local no mesmo usuário, sem provedor/rede/revelação/log/backup; cifrado retido antes/depois. Não alterar catálogo público para essa prova. Outro perfil, se autorizado, deve bloquear decifra e preservar bytes; não exigir teste pago dispensado.

Guia separa reparar binários pela mesma versão íntegra de recuperar dados. Banco corrompido/futuro/preferências futuras são conservados e bloqueados. Cópias seletivas fictícias de DB/journals, após Sair/ausência de writer, permitem provar procedimento; preservar originais e não apagar journal para forçar abertura. `ai.json` permanece no perfil original, não entra em cópia/backup de recuperação nem evidência. Backup JSON existente contém tarefas, não lixeira/preferências/segredo/undo. Snapshot antigo pode regredir revisions/markers e reenviar avisos; recuperação é revisão explícita, sem replay automático. Downgrade só com compatibilidade demonstrada; binário SQL1 não lê SQL2. Não reabilitar startup ao voltar a binário incompatível.

### D9 — CI de revisão e assinatura verdadeira

Manter checkout/actions por SHA/toolchain/lock fixados, `contents: read`, `--publish never`, sem Setup/release. Identificar artifact por versão/arquitetura/commit/run; enviar Setup exato, manifesto, inventário/notices/manifests e resultados sanitizados. Não enviar builder-debug bruto como distribuição. Retenção proposta 14 dias; acesso e custo seguem repositório/plano real, não configuração npm. Runner windows-2022 administrador/UAC desabilitado comprova gates/smoke, não instalação padrão. [Custos GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Unsigned é apenas recomendação R6. [SmartScreen](https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/) considera reputação; assinatura/hash não garantem aceitação pelo Windows/empresa. Guia orienta parar diante de política/bloqueio, sem bypass ou instalação de CA. Assinatura escolhida requer revisão específica e autorização própria: verificar exe/Setup/uninstaller, cadeia/publisher esperado/timestamp RFC3161 e hash pós-assinatura; qualquer byte alterado exige evidência nova.

Alternativas consultadas na exploração em 2026-10-07, sem contratação: Azure Artifact Signing Basic USD9,99/mês/5.000 assinaturas ([preço](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-change-sku)); elegibilidade Public Trust não lista Brasil ([quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart)), região Azure não prova elegibilidade da pessoa jurídica. SignPath Foundation gratuito depende de OSS e condições de release/proveniência/revisão, com publisher Foundation ([termos](https://signpath.org/terms.html)). CA comercial exige certificado + token/HSM/cloud, cotação total, identidade e elegibilidade; ver referências/custos datados no roadmap. Autoassinado/CA privada não resolve confiança pública. Reconfirmar custos e elegibilidade antes de qualquer aquisição, nunca deduzir país legal do caminho/timezone.

### D10 — Campanha W01–W15 e evidência rastreável

Todos os casos estão **NOT_RUN nesta proposta**. Cada linha tem mapeamento para delta e tasks; no apply detalhar passos/fixtures com os mesmos oráculos. Evidência mínima: versão/commit/hash Setup/exe/ASAR instalado, OS/build/arquitetura, conta/token/UAC/roots opacos, timestamp, cenário/subcaso, esperado/observado, PASS/FAIL/BLOCKED/NOT_RUN/dispensa humana. Nunca colocar SID/path pessoal completo/segredo em upload; identificadores locais necessários ficam em registro restrito sanitizado. Dispensa exige revisão humana e não altera comportamento prometido nem vira PASS.

| ID | Oráculo e cobertura de aceitação | Delta responsável |
| --- | --- | --- |
| W01 | Ambiente de build limpo/lock/toolchain fixados; validate/OpenSpec/package/verify/smoke passam, manifesto/notices/checksums presentes | build: Toolchain, Gates, Identificação |
| W02 | Windows alvo em conta fora de Administrators, token não elevado/UAC ativo, offline sem Node/npm; exe/atalho reais, caminho espaços/Unicode | installation: Instalação, Destino; build: Aceitação |
| W03 | Três manifests asInvoker/uiAccess=false; app x64/stub x86; diff só root/HKCU/atalho/temp próprios e ACE RX só binários; bytes instalados ligados ao manifesto | installation: Instalação, Efeitos; build: Conteúdo |
| W04 | `/S`/currentuser válidos; allusers combinado/duplicados/malformados, D externo/HKCU inválido/UNC/traversal/reparse/inacessível/Known Folder divergente/legado simulado recusados antes de efeitos | installation: Destino, Argumentos |
| W05 | App visível/tray/duas janelas/commit/job/relay ativo ou detecção incerta ⇒ erro sem kill; Sair drena/libera e permite; reabertura entre fases/old-uninstaller/concorrência não contornam guarda | installation: Manutenção segura |
| W06 | IDs/pasta/metadata/target/cwd/CLSID coerentes; registro/atalho/COM estrangeiro/futuro preservado com recusa prévia; erro posterior distinto de sucesso | installation: Identidade, Manutenção |
| W07 | Master/ICO iguais e visual legível em temas/DPI propostos; ícone ausente/inválido reprovado | build: Identidade visual |
| W08 | Inventário integral/revisão conteúdo/notices/preloads/CSP43/14; negativas de arquivo externo, nome e sentinela fictícia; diagnóstico prod inacessível | build: Conteúdo, Smoke |
| W09 | Par completo aprovado/hashes exatos; tarefas/lixeira não vencida/campos/recorrências/subtarefas/IDs/revisões/codec/markers persistem por comparação lógica | installation: Manutenção |
| W10 | Shortcuts v1/IA v1 retidos; DPAPI fictício real utilizável no mesmo usuário sem rede/log/backup; futuro/indecifrável bloqueia sem overwrite | installation: Manutenção, Recuperação |
| W11 | Hash final instalado prova tray/quick/cópia/foco/conflict/rebind/restart/Sair/segunda instância/toast/clique/COM e startup opt-in/out/disabled; logoff/login real se autorizado | build: Integrações instaladas |
| W12 | Uninstall normal e `/S` sem admin remove só recursos próprios; perfil/estrangeiros intactos; reinstall reconhece dados e OFF; segunda conta isolada | installation: Manutenção, Efeitos |
| W13 | Falhas ACL/espaço/extração/registro/interrupção simulada/pacote adulterado/DB corrupto-futuro/preferência futura/PowerShell: erro/preservação, sem reset/bypass; reparo compatível e downgrade seguro documentados | installation: Recuperação; build: Conteúdo |
| W14 | Seleção exata, ausência/duplicado/mismatch falham; manifest/hash final/inventário/notices/resultados/retenção/acesso claros, nenhum Setup/release automático | build: Identificação, CI |
| W15 | Guia fiel instalar→abrir→Sair→atualizar→uninstall/reinstall/retenção/exclusão separada/backup/recovery/unsigned/política/offline IA; decisões e limites explícitos | installation: Recuperação; build: Entrega |

## Risks / Trade-offs

- Force-kill/TOCTOU e uninstaller antigo → guarda nas fases novas, recusa de predecessor inseguro e teste de race; sem falsa promessa de upgrade legado.
- Identidade/root divergente ou estrangeiro → preflight e revalidação; caminho redirecionado não suportado inicialmente.
- Falha parcial de Setup/ACL → erro por fase, dados fora do destino e reparo compatível; não há atomicidade geral.
- Artefato velho/mesma versão ou bytes alterados após prova → staging/manifest/seleção exata e revisão de evidência afetada.
- Bundle sem notices ou inspeção rasa → inventário integral, revisão de componentes e negativas; scanner não certifica segredo ausente.
- Perda de draft/aviso durante manutenção ou snapshot antigo → Sair explícito, drenagem, fixture temporal e guia de limites/revisões/markers.
- Retenção de credencial/cache após uninstall → consentimento R5, remoção pelo fluxo existente e exclusão manual separada, sem exportar segredo.
- PowerShell/política/unsigned bloqueados ou CI privilegiada mascarar prova → erro seguro/ambiente autorizado e estados BLOCKED distintos; sem bypass.

## Migration Plan

1. Revisão humana de proposal/design/deltas/tasks e R1–R7; registrar aprovações e autorização de ambiente separadas. Nenhuma ação de apply nesta sessão.
2. No apply autorizado, corrigir guardas/staging/inspeção/notices e documentos sem mudar schema/funcionalidades; executar regressões e gates apropriados. Preparar par completo R3 em ambiente de build aprovado.
3. Campanha W01–W15 na VM/conta padrão autorizada, com pacotes exatos. Guardas/snapshots usam somente fixtures; falha/BLOCKED interrompe readiness afetada. Reavaliar o candidato após qualquer correção.
4. Executar verify e criar `verification.md` na própria Change, relacionando requisito/cenário/task/evidência/limite. Aprovação explícita do relatório antes de archive; só depois consolidar specs e README factual conforme AGENTS.md. Não iniciar TFA-012, merge ou distribuição automaticamente.

Rollback operacional é primeiro reparo da mesma versão íntegra; binário anterior somente se compatível com os dados atuais e guarda segura. Preservar originais, não restaurar banco antigo por cima nem apagar journal/IA. Se incompatível, bloquear e revisar recuperação. Não existe rollback automático do perfil.

## Open Questions

Somente detalhes sem impacto contratual podem ser refinados no apply aprovado: nome exato dos arquivos de manifesto/relatório e redação curta das mensagens de recusa. R1–R7 e suporte a upgrade legado são decisões materiais de revisão, não entram nesta categoria.
