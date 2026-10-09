# Tasks

**TFA-011 — proposta para revisão, 0 tarefas executadas.** Checklist de apply futuro; não autoriza implementação, build, Setup ou publicação. Ler proposal/design e os dois deltas. R1–R7 são decisões materiais pendentes, com tarefas dependentes bloqueadas até decisão humana; aprovação parcial permite apenas trabalho independente expressamente aprovado. W01–W15 estão NOT_RUN nesta proposta.

**Atualização 2026-10-08:** artefatos aprovados e pedido de apply vigente; R1 decidido
(uso pessoal/controlado sem atribuição empresarial), demais R pendentes conforme
[approval.md](approval.md). Protocolo 1.4 verificado em [validation-protocol.md](validation-protocol.md):
61/61 cenários mapeados, 15/15 casos W; OpenSpec estrito 1/1 e diff --check aprovados.
Esse registro inicial e o parágrafo anterior preservam o estado histórico da proposta.
**Continuação:** R1–R7 resolvidas no escopo limitado de approval.md; IR1 e IR2
aprovados. Manutenção na conta atual autorizada, segunda conta excluída por decisão
humana (não PASS). Preview13 instalado/desinstalado com dados retidos; reparo
14 e transição 14→15 PASS. Instalado atualmente preview15. Smoke16 FAIL por corrida
no gesto do harness, corrigida no22/23: ambos smoke42 PASS. Diagnóstico test-only
confirmado por testes prod/dev e pacote23; task4.4 concluída. IR3 aprovada: manter NSIS e documentar limitação do retorno do launcher normal;
guardas, retenção e propagação pelo Setup/predecessor direto continuam exigidas. Fonte dirty e par final
limpo pendente. Checkboxes registram somente conclusão
integral, sem converter implementação parcial ou provas históricas em execução.

## 1. Revisão e condições de execução

- [x] 1.1 Registrar aprovação humana dos artefatos e decisões R1/R2/R3 (público, identidade legal verídica, Windows/builds, versão/par completo e recusa de predecessor inseguro); verificar registro com valores concretos, sem inferir QSI ou usar o 0.1.1 histórico.
- [x] 1.2 Registrar decisões R5/R6/R7 (retenção integral/credencial/cache/exclusão separada, unsigned ou necessidade de revisão de assinatura, origem/acesso/custo/retenção); verificar coerência entre design, proposta e plano de guia/CI antes de tarefas dependentes.
- [x] 1.3 Registrar R4 e autorização específica do ambiente/Setup/contas/falhas simuladas/logoff-login; verificar OS/build/arquitetura, SID/token/membership/UAC e roots por leitura, com prova de ausência de Node/npm no destino e sem criar ambiente/contas por inferência. Se indisponível, marcar campanha BLOCKED e continuar somente trabalho independente aprovado.
- [x] 1.4 Detalhar protocolo W01–W15 na própria Change com fixtures, subcasos, passos e oráculos do design, incluindo hashes e expected/observed/status; verificar cobertura de todos os cenários dos deltas e distinguir novas provas das dispensas anteriores, sem converter waive em PASS.

## 2. Guardas e manutenção NSIS

- [ ] 2.1 Ajustar preflight de destino para coerência UserProgramFiles/LocalAppData/Programs e conservar guards de argumentos/HKCU/HKLM/reparse; verificar testes negativos de `/allusers` combinado, `/S`, duplicados/malformados, `/D`, registro inválido, caminho externo e Known Folder divergente (W04), sem alteração dos recursos preexistentes.
- [ ] 2.2 Implementar recusa de processo próprio/consulta incerta no hook suportado, para installer/uninstaller sem editar node_modules; verificar regressões visível/tray/duas janelas/commit/arquivo/IA/relay/timeout e `/S`, sem Stop-Process/taskkill/elevação (W05).
- [ ] 2.3 Antecipar preflight de identidade/metadata/atalho/COM/futuro e manter revalidação de ownership na mutação/cleanup; verificar conflito estrangeiro preservado antes de substituição e casos own/ausente/futuro/mudança de ownership (W06/W12).
- [ ] 2.4 Impedir chamada automática de uninstaller anterior sem procedência/caminho/guarda segura comprovados; verificar predecessor legado recusado intacto e predecessor compatível aceito, sem overwrite/bypass do binário antigo (W05/W09). Se upgrade direto 0.1.0 for exigido, parar esse ponto para revisão do design.
- [ ] 2.5 Tratar retorno não zero da remoção anterior e falhas de extração/ACL/registro com fase/motivo, sem falso sucesso ou reset; verificar injeções em cópias fictícias e teste de reabertura entre fases/instaladores concorrentes, preservando perfil (W05/W06/W13).
- [x] 2.6 Inspecionar NSIS gerado no build autorizado e documentar ordem efetiva dos hooks, chamada ao old-uninstaller, escopo per-user, ausência de kill/elevação e guardas antes de efeitos; verificar que fonte/include e script gerado correspondem à versão fixada, incluindo un.onInit anterior a customUnInit.
- [x] 2.7 Atualizar o guia de manutenção com salvar rascunhos/Sair, recusa silenciosa, transição legada revisada e diferença entre preflight intacto/falha parcial; verificar cada instrução contra guards e erros implementados (W15), sem descrever upgrade legado como disponível.

## 3. Versionamento e seleção de artefatos

- [x] 3.1 Aplicar somente versões/metadados aprovados em package/lock/configuração, conservando IDs/paths/CLSID/startup e sem upgrade de dependências; verificar concordância package/runtime/PE/Setup e diff de lock restrito a metadados (W06/W14).
- [x] 3.2 Criar staging por build/versão/arquitetura limitado a roots verificados, sem apagar históricos indiscriminadamente; verificar saída reutilizada, escape e artefato antigo coexistente por testes de seleção (W14).
- [x] 3.3 Substituir seleção por primeiro glob por resolução exata comum ao pacote/inspeção/CI; verificar ausente, duplicado, versão errada e mismatch de hash/arquitetura com falha, sem selecionar histórico (W14).
- [x] 3.4 Produzir manifesto de proveniência/hashes finais conforme D5, com nomes externos versão/arquitetura/commit/run e identidade interna estável; verificar schema/campos, estado da fonte, lock/tooling/runtime/checksums, tamanhos e adulteração de candidato por teste (W01/W14).
- [x] 3.5 Ajustar workflow somente para revisão: candidato exato, inventário/notices/manifests/resultados sanitizados, retenção aprovada e sem builder-debug bruto; verificar diff/configuração mantendo actions por SHA, contents:read, --publish never e nenhum Setup/release/segredo de assinatura automático (W14).
- [x] 3.6 Documentar origem local/CI, acesso/retenção/custos, obtenção/verificação e limites do runner administrador; verificar guia e artifact manifest sem presumir privacidade npm, gratuitidade ou reproducibilidade byte-a-byte do Setup (W14/W15).

## 4. Payload completo notices e ícones

- [x] 4.1 Inventariar recursivamente payload externo/resources/ASAR/unpacked e conteúdo entregue pelo Setup, com classificação/origem/arquitetura/hash e recursos gerados separados; verificar entrada inesperada/escape/recurso ausente fora e dentro do ASAR (W08).
- [x] 4.2 Revisar componentes efetivamente incorporados (incluindo Vue/Pinia/transitivas, Electron/Chromium/Node/SQLite e recursos NSIS aplicáveis), gerar notices correspondentes e incorporá-los; verificar inventário→versão→licença/copyright presente com teste de notice ausente/divergente (W08).
- [x] 4.3 Ampliar inspeção além de nomes por revisão de inventário/conteúdo e sentinelas fictícias em cópias de teste; verificar `.env`/fixture/mapa/configuração/segredo sob nome permitido, arquivo externo/helper/updater e hash adulterado reprovam sem imprimir conteúdo (W08/W13).
- [x] 4.4 Conservar e verificar diagnóstico inventariado apenas em test, sandbox/CSP/preloads43/14, sem nova bridge pública; confirmar recusa em prod e execução do smoke existente com perfil separado, sem tocar dados/conta da origem (W08).
- [x] 4.5 Conservar master/ICO multirresolução e validar recurso esperado no exe/Setup/uninstaller/runtime; verificar negativa de ícone ausente/corrompido e correspondência de derivação/hash, mantendo tray sem GUID no unsigned (W07).
- [x] 4.6 Documentar inventário/notices, componentes PowerShell/icacls do SO, limites do scanner/ASAR e prova visual pendente; verificar documentação não promete instalação de runtime adicional ou ausência universal de segredos (W08/W15).

## 5. Retenção recuperação e guia por usuário

- [x] 5.1 Consolidar guia operacional de instalação/abertura/Sair/upgrade/reparo/uninstall/reinstall/retenção e estado unsigned aprovados, com caminhos próprios, startup OFF após reinstall e bloqueio de política; verificar cada afirmação contra contrato implementado e marcar provas ainda não realizadas (W15).
- [x] 5.2 Documentar recuperação seletiva DB/journals com Sair/ausência de writer/originais conservados, compatibilidade e exclusão de ai.json; verificar walkthrough em fixtures sem apagar journal/forçar reset/restaurar snapshot por cima, expondo regressão de markers e downgrade SQL1→SQL2 recusado (W13/W15).
- [x] 5.3 Documentar exclusão manual separada do uninstall com root/ownership/perfil confirmados e perda explicitada, sem wipe/checkbox/comando amplo; verificar guia distingue cache/credencial retidos, backup só de tarefas e não revogação no provedor (W10/W12/W15), sem executar remoção por essa tarefa.
- [x] 5.4 Preparar fixtures/probes locais restritos da campanha para comparação lógica de tarefas/lixeira/codec/markers/preferências e DPAPI real com credencial fictícia; verificar testes dos oráculos não enviam rede nem exportam/logam segredo/configuração e não criam IPC/harness público (W09/W10).

## 6. Gates e par de pacotes limpos

- [x] 6.1 Executar build limpo pelo lockfile/toolchain fixados no ambiente autorizado e gates validate/OpenSpec estrito pertinentes; verificar resultados/comandos/versões, sem force/legacy-peer-deps ou atualização silenciosa de matriz (W01).
- [x] 6.2 Preparar as duas versões completas aprovadas com guarda segura e commits/hashes distintos, package:win/verify:package/smoke:packaged pertinentes; verificar manifests asInvoker/uiAccess=false, app x64/stub x86, notices/inventário e resultados ligados aos bytes (W01/W03/W08/W09), sem executar Setup fora de R4.
- [x] 6.3 Conferir bundle de revisão local/CI e retenção do par, usando seleção exata e inspeção do manifesto; verificar nenhuma mudança depois do hash e documentar divergências esperadas em reconstrução funcional (W14). Sem commit/push/disparo/publicação externos por inferência.

## 7. Campanha final em conta padrão autorizada

- [ ] 7.1 Executar instalação limpa offline no Windows/build/conta/UAC autorizados sem Node/npm, com espaços/Unicode; verificar exe/atalho reais, bytes instalados versus manifesto, três manifests, efeitos somente do usuário e ACE RX só binários (W02/W03).
- [ ] 7.2 Executar matriz negativa de argumentos/caminhos/Known Folder/HKCU/legado/ownership em ambiente fictício restaurável; verificar recusa prévia sem mudança de recursos existentes, estrangeiros intactos e sem bypass (W04/W06).
- [ ] 7.3 Executar guardas de app aberto/tray/duas janelas/commit/job/relay e `/S`, Sair/drenagem/reabertura entre fases/old-uninstaller/concorrência; verificar não houve kill nem substituição insegura, não zero propagado no Setup/predecessor direto e manutenção permitida após saída completa; observar recusa/conclusão do launcher normal do uninstall conforme limitação IR3 aprovada (W05).
- [ ] 7.4 Executar upgrade do par completo aprovado e reparo da mesma versão, comparando fixtures lógicas; verificar tarefas/lixeira válida/recorrências/subtarefas/IDs/revisões/codec/markers/shortcuts/IA protegida e startup/desativação externa retidos (W09/W10/W13), sem usar fingerprint diagnóstico como único oráculo.
- [ ] 7.5 Executar integrações do hash final instalado: tray/Quick Add/cópia com app externo em foco, conflito/rebind/restart/liberação dos atalhos, segundo lançamento, toast real/clique/COM e startup opt-in/out/disabled; verificar escritor único/relay sem residual e registrar logoff/login real somente autorizado, distinto de simulação (W11).
- [ ] 7.6 Executar inspeção completa instalada e prova visual claro/escuro DPI100/150/200%; verificar notices/payload/hashes e recursos gerados separados, ícones legíveis e perfil sem ACL indevida (W03/W07/W08).
- [ ] 7.7 Executar uninstall normal e `/S`/reinstall e isolamento em segunda conta autorizada; verificar cleanup próprio/estrangeiros conservados, perfil/cache/credencial fictícia retidos, dados reconhecidos e startup OFF; provar DPAPI mesmo usuário sem rede/log e cross-profile somente se aprovado (W10/W12). Ausência de segunda conta fica BLOCKED/dispensa humana, não PASS.
- [ ] 7.8 Executar falhas simuladas de ACL/espaço/extração/registro/interrupção, pacote danificado, DB/future/corrupt/preferences e PowerShell indisponível em fixtures/snapshot autorizados; verificar erro por fase, dados intactos, reparo compatível e procedimento sem reset/journal deletion/ai.json em backup/downgrade/replay (W13), sem falha de energia real.
- [x] 7.9 Revisar guia com os resultados W01–W15 e decisões R1–R7, inclusive assinatura se revisão própria a autorizar; verificar cada afirmação de suporte/readiness tem evidência do hash atual, com limites/BLOCKED/NOT_RUN/dispensas visíveis e sem alegação de homologação TFA-012 (W15).

## 8. Verificação para revisão humana

- [x] 8.1 Executar openspec-verify-change e criar verification.md na própria Change com aderência requisito/cenário/task/W/evidência, gates e pendências; verificar relatório distingue PASS de dispensa/BLOCKED e não herda prova anterior do produto final. Não arquivar sem aprovação humana explícita do relatório.
- [x] 8.2 Conferir diff final de escopo e consistência roadmap/docs/artefatos, registrar etapa VERIFY/REVIEW e entregar relatório para aprovação; verificar sem alterações na extensão/Git, credenciais/dados reais, merge/release/contratação/publicação/continuidade TFA-012. Archive e README factual seguem AGENTS.md somente após autorização correspondente.
