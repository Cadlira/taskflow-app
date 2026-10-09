# Protocolo de validação W01–W15 — TFA-011

Preparado em 2026-10-08 para a task 1.4, conforme design D10 e os dois deltas aprovados.
Este documento define execução e oráculos; **não registra execução da campanha**.
Decisões/autorização: [approval.md](approval.md). Casos instalados dependem de R4;
metadados/par/assinatura/retenção dependem das respectivas R1–R7. Nenhum comando aqui
autoriza criar conta/VM, executar Setup, fazer logoff ou alterar políticas.

## Registro obrigatório e sequência

Um registro por subcaso deve conter estes campos, mesmo em BLOCKED/NOT_RUN:

```json
{
  "case": "W05", "subcase": "tray-silent", "kind": "installed",
  "timestamp": null, "durationMs": null,
  "version": null, "sourceCommit": null, "sourceClean": null,
  "setupSha256": null, "exeSha256": null, "asarSha256": null,
  "predecessorVersion": null, "predecessorCommit": null,
  "predecessorSetupSha256": null,
  "environmentId": null, "osEdition": null, "osBuild": null,
  "architecture": null, "standardAccount": null, "elevated": null,
  "uacEnabled": null, "rootsConsistent": null,
  "expected": "recusa não zero, sem kill e sem alteração preexistente",
  "observed": null, "status": "BLOCKED",
  "reason": "R4 sem ambiente autorizado", "evidence": []
}
```

`kind`: automated, packaged, installed ou human. `status`: PASS, FAIL, BLOCKED,
NOT_RUN ou HUMAN_WAIVER. PASS exige observed/evidence/timestamp/duration e hashes
pertinentes preenchidos. Um gate sem Setup não preenche hashes instalados fictícios.
HUMAN_WAIVER exige citação humana/escopo/data e não satisfaz comportamento prometido
nem torna a task executada. Sanear paths/SIDs/contas em material compartilhável;
guardar apenas identificadores opacos e motivos/códigos, sem segredo/dados reais.

1. Resolver decisões, ambiente e par antes dos passos dependentes. Fixar candidato
   pela versão/arquitetura/commit/run e SHA-256; preservar cópias exatas do par.
2. W01/W14 automatizados primeiro; inspecionar script NSIS efetivamente gerado e
   reavaliar guardas antes de iniciar campanha. Setup adulterado nunca é executado.
3. Capturar baseline fictício B0; executar uma variação negativa por snapshot/cópia
   separada; comparar B1 com B0. Restaurar somente fixtures no ambiente autorizado.
4. Executar instalação, manutenção, integrações e remoção nos hashes identificados.
   Troca de bytes/assinatura cria novo candidato e invalida provas afetadas.
5. Revisar W15 e produzir verification ao fim do apply. Aprovação do relatório
   precede archive; nenhuma readiness com requisito pendente.

## Fixtures e oráculos comuns

**P — pacote:** par completo aprovado, staging separado, fonte/lock/toolchain,
inventário recursivo de win-unpacked/resources/ASAR/unpacked e notices por componente.
Fazer negativas em cópias; guardar hash original e hash modificado, sem trocar o
candidato validado. Recursos gerados (uninstaller/atalho) em lista separada.

**E — ambiente:** destino restaurável autorizado, sem Node/npm, conta padrão
fora de Administrators, token não elevado e UAC ativo. Verificar Known Folders,
perfil e SID/token por APIs/leitura, nunca apenas USERNAME/variáveis herdadas.
Confirmar Unicode/espaços e segunda conta antes de seus subcasos. Registrar ausência
de Node/npm por PATH e inventário do destino, além de rede offline. Ambiente de build
e runner administrador têm registros distintos; não são E por inferência.

**B — baseline:** hashes/arquivos dos binários, perfil, journals, atalhos, registros
próprios e estrangeiros; inventário de efeitos próprios HKCU/root/temporários.
Recusa antes de efeitos exige igualdade de todos os recursos preexistentes;
temporários próprios gerados devem ser identificados. Falha após efeitos registra
fase/arquivos parciais sem afirmar atomicidade. Sem capturar informação real.

**D — dados:** tarefas fictícias cobrindo campos, tags/pessoas/prioridade/prazos,
todos os status, séries/recorrências/subtarefas/lembretes, IDs/revisões/processedFor,
lixeira válida, SQL2/codec4, shortcuts v1. Datas e período de execução registrados;
lixeira com margem para 30 dias e lembretes fora de janela de vencimento. Fixtures
de harness podem controlar relógio; não introduzir relógio público em produção.
Comparar DTOs lógicos ordenados por ID/ordem de subtarefas; documentar expurgo/claim
legítimo antes de avaliar divergência. Hash DB após uso não é oráculo de igualdade.

**A — IA:** credencial exclusivamente fictícia criada no perfil de prova, DPAPI
real no mesmo usuário, teste local sem rede/provedor. Oráculo booleano interno de
decifra/igualdade, nunca valor/configuração/ciphertext em log ou exportação. Arquivo
ai.json fica no perfil; não entra em backup/cópia de recuperação. Cópia entre perfis
só se explicitamente autorizada, resultado indecifrável deve conservar bytes.

**X — negativas:** clones com nomes/conteúdo fictícios proibidos, mapa/fixture,
notice/ícone removido ou divergente, arquivo externo/helper/updater, symlink/reparse,
hash/version/architecture errado, DB corrupto/futuro e preferência futura. Falhas
ACL/espaço/extração/registro/interrupção/PowerShell apenas em sandbox/snapshot
autorizados; sem cortar energia, adulterar componentes globais ou policy bypass.

## W01 — Build e gates

Pré-condições: build autorizado, lock/toolchain fixados; P. Subcasos: checkout
limpo; toolchain errada; lock divergente; validate; OpenSpec; pacote; inspeção; smoke.
Conferir Node24.21.0/npm11.21.0/Electron44.5.1/builder26.17.0 e auxiliares do lock.
Executar instalação pelo lock no build isolado, sem upgrade implícito/force; gates
`validate`, OpenSpec estrito da Change/--all/--archived, `package:win --publish never`
conforme script, `verify:package`, `smoke:packaged` pertinentes. Registrar comandos,
exit/timing/toolchain/runtime/SQLite/NSIS/checksums/manifesto/notices e resultados.
Esperado: gates corretos PASS; fonte suja ou mismatch invalida candidato final,
sem inventar fonte limpa. Build local de desenvolvimento pode registrar divergência
mas não satisfaz prova final limpa. Tasks 6.1/6.2; automatizado inicialmente NOT_RUN.

## W02 — Instalação padrão offline

Pré-condições: E/P/B e R2/R4. Subcasos: instalação limpa normal; perfil com
espaços/Unicode; abrir exe; abrir atalho; offline/sem Node/npm.
Verificar ambiente antes de Setup, instalar pelo hash exato sem RunAs, abrir
manualmente via exe/atalho e fechar por Sair. Registrar janela/processos/timeout.
Esperado: sem UAC/admin/download/runtime externo/serviço; target/cwd/path próprios,
app funcional offline (IA permanece optativa). Não confundir bloqueio de policy com
sucesso de instalação/execução. Task 7.1; instalado BLOCKED por R4.

## W03 — Escopo, manifests, ACL e bytes

Pré-condições: E/P/B. Subcasos: três PEs; arquitetura; diff de efeitos; ACL de
root/parent/dados; inventário instalado. Extrair manifests de exe/Setup/uninstaller;
conferir app AMD64, stub NSIS x86 e asInvoker/uiAccess=false em todos. Comparar B1/B0,
binários entregues versus manifesto e recursos gerados separadamente. Ler ACE
AppContainer `(OI)(CI)(RX)` exclusivamente no root binário; pais/dados inalterados.
Esperado: efeitos apenas root/atalhos/HKCU/temp próprios, sem helper/HKLM/serviços/
tarefas agendadas/updater; sem aceitar write global como necessário. Tasks 6.2/7.1/
7.6; pacote NOT_RUN, instalado BLOCKED.

## W04 — Argumentos e caminhos

Pré-condições: E/B/X restauráveis. Para cada entrada, reiniciar de B0; executar
normal e `/S` quando aplicável, guardar exit e comparação antes/depois. Matriz:
`/S`, `/currentuser`, `/S /currentuser`; `/allusers` isolado/combinado/duplicado;
`/currentuser` duplicado/malformado; `/D` canônico; D vazio/duplicado/malformado;
D externo/global/outra conta/UNC/relativo/traversal/separador alternativo/reparse;
HKCU InstallLocation inválido; HKLM legado simulado; Known Folder fora do perfil
ou dentro mas divergente de LocalAppData/Programs; destino inacessível.
Esperado: somente casos válidos usam o mesmo root, sem elevação; negativos recusam
antes de alterar recursos preexistentes, inclusive no silencioso sem diálogo
obrigatório. Registrar diferença entre recusa e falha parcial. Tasks 2.1/7.2;
regressões NOT_RUN, instalado BLOCKED.

## W05 — Manutenção sem kill e predecessor

Pré-condições: E/P/B/D, par R3 aprovado e predecessor seguro identificado.
Subcasos normal e `/S` de Setup/reparo/upgrade/uninstall com app visível, tray,
duas janelas, commit, job de arquivo, IA fictícia em voo e relay COM. Observar
processos/dados/pids antes/depois; nenhuma ação de teste mata processos do usuário.
Detecção negada/falha/timeout/ownership desconhecido deve recusar sem fallback por
nome. Salvar drafts/Sair, observar drenagem/liberação e retentar caso positivo.
Predecessor 0.1.0 inseguro ou sem procedência/capacidade comprovada: recusa antes
de invocá-lo/overwrite; hashes antigos intactos. Predecessor seguro: reabertura
controlada entre preflight e remoção/extração, inclusive no old-uninstaller;
propagar não zero sem avançar. Dois installers simultâneos não contornam guarda.
Registrar sequência NSIS gerada (un.onInit/check antes de customUnInit) e hooks de
revalidação antes de efeitos. Esperado: sem Stop-Process/taskkill/kill/elevação;
recusa orienta Sair; Setup/predecessor direto propagam não zero. Pelo IR3 aprovado,
o retorno do launcher normal do uninstall não é contrato de automação; observar
recusa/conclusão efetiva e recursos intactos, sem declarar a exceção PASS.
Fase parcial explícita se já houve efeito. Não afirmar
eliminação universal de TOCTOU nem upgrade legado seguro. Tasks 2.2/2.4/2.5/2.6/7.3;
instalado BLOCKED, inspeção/regressões NOT_RUN.

## W06 — Identidade e conflito antes de efeitos

Pré-condições: E/B/X. Subcasos: próprio; ausente; metadata/atalho/COM estrangeiro;
versão futura; ownership alterado entre check e cleanup; falha pós-extração.
Conferir package/product/exe/pasta/appId/GUID/CLSID/startup e perfis do design D2.
Comparar target/cwd/AUMID/CLSID/ícone/LocalServer32 e metadata versão/caminho.
Injectar um conflito fictício por snapshot; executar Setup e comparar todos os
bytes/valores preexistentes. Repetir após mudar ownership antes do cleanup.
Esperado: conflito/futuro recusa antes de remover/substituir; cleanup conserva
estrangeiro; ausente/próprio permite demais guardas; erro tardio não vira sucesso.
CompanyName/author devem seguir R1, nunca publisher empresarial inferido.
Tasks 2.3/3.1/7.2; instalado BLOCKED, regressões NOT_RUN.

## W07 — Ícones

Pré-condições: P/X, visual somente em E. Inspecionar SVG master e derivação ICO
16/24/32/48/256; comparar hashes e recursos PE de exe/Setup/uninstaller/runtime.
Negativas: ICO ausente/corrompido/recurso divergente em cópias. Observar exe/Setup/
uninstaller/atalho/tray/toast em temas claro/escuro × DPI100/150/200%, sem mudar marca.
Esperado: recursos íntegros e ícones legíveis; negativa reprova; unsigned tray sem
GUID. Integridade automatizada não comprova percepção visual. Tasks 4.5/7.6;
automático NOT_RUN, visual BLOCKED.

## W08 — Payload, notices e fronteiras

Pré-condições: P/X; E para instalado. Inventariar recursivamente arquivos externos,
resources/ASAR/unpacked e classificar origem/arquitetura/tamanho/hash; conferir
conteúdo entregue e gerados separadamente. Relacionar componentes realmente
incorporados (Vue/Pinia/transitivas, Electron/Chromium/Node/SQLite/NSIS aplicável)
a versão/licença/copyright/notices. Negativas uma por clone: recurso/notice ausente
ou divergente; arquivo externo/desconhecido; .git/.env/test/fixture/mapa/build dep/
helper/updater; symlink/reparse/escape; sentinela fictícia sob nome permitido;
hash adulterado. Sem imprimir conteúdo da sentinela.
Conferir CSP/preloads/sandbox/contextIsolation/catálogo43/14 e diagnóstico test
inventariado; provar recusa em prod sem nova bridge/harness público. Windows
PowerShell/icacls indisponível: erro seguro, sem instalar componente ou bypass.
Esperado: nenhuma entrada sem origem/justificação; negativas reprovam, scanner
declara limites e não certifica ausência universal de segredos. Tasks 4.1–4.4/4.6/
7.6; automático NOT_RUN, instalado BLOCKED.

## W09 — Upgrade completo e retenção lógica

Pré-condições: E/P/D, dois commits/hashes completos aprovados e ambos seguros.
Excluir 0.1.1 histórico; registrar predecessor e candidato exatos. Criar D na
versão anterior, capturar estado lógico e revision/markers; Sair; instalar nova
versão; comparar antes/depois com tempo de expurgo/claim controlado/documentado.
Repetir reparo da mesma versão e startup ON/OFF/desabilitado externamente.
Esperado: identidade/perfil e tarefas/lixeira válida/campos/series/subtarefas/IDs/
revisões/SQL2/codec4/markers conservados, sem reset/replay; escolha/desativação de
startup permanece. Fingerprint da fundação é auxiliar, nunca único oráculo.
Tasks 6.2/7.4; instalado BLOCKED por R3/R4.

## W10 — Preferências e DPAPI

Pré-condições: E/D/A, R5; cross-profile só se autorizado. Capturar oráculos de
shortcuts v1 e retenção local de IA v1 sem exportar ai.json. Provar proteção/decifra
fictícia real no mesmo usuário antes/depois de upgrade/uninstall/reinstall, sem
rede/provedor/log de valor. Negativas futura/indecifrável conservam arquivo e bloqueiam
operação; outro perfil só no escopo permitido. Revisar backup JSON: apenas tarefas,
sem segredo/configuração/lixeira/undo. Esperado: prefs conservadas/DPAPI utilizável
no mesmo usuário; sem plaintext/overwrite/falsa portabilidade. Tasks 5.4/7.4/7.7;
instalado BLOCKED, probes NOT_RUN.

## W11 — Integrações reais do hash final

Pré-condições: E/D, hash instalado conferido. Subcasos: X→tray; Abrir; Quick Add;
captura explícita URL/texto copiado com app externo em foco; conflito de atalho;
rebind/restart; Sair/liberação; segundo lançamento; toast real/clique/COM/relay;
startup ON/OFF/desabilitado externamente; login opt-in/argumento oculto.
Executar gesto humano para toast/foco, comparar estado/preferência e processos;
um escritor por perfil e relay sem residual após Sair. Ler startup target/args
próprios e desativação externa; logoff/login real somente se R4 específico permitir.
Simulação WM_QUERYENDSESSION tem registro separado e não substitui login real.
Esperado: contratos existentes, sem leitura automática/monitoramento de clipboard;
sem autoativação startup. Task 7.5; instalado/humano BLOCKED; não repetir Q13/AI16/
homologação integral TFA-012.

## W12 — Uninstall, reinstall e isolamento

Pré-condições: E/B/D/A, R5 e segunda conta aprovada para o isolamento. Fazer
normal e `/S` em snapshots distintos: Sair; uninstall; comparar binários/atalhos/
metadata/COM/Run/StartupApproved próprios e estrangeiros; comparar perfil/cache/
credencial fictícia retidos; reinstall; reconhecer D e startup OFF. Repetir com
recursos de terceiros/ownership alterado. Na segunda conta, conferir que primeira
fica intacta e profiles/binários/atalhos não são compartilhados.
Esperado: sem admin/wipe/alteração alheia; cleanup somente próprio; dados retidos
e reinstall sem startup. Sem segunda conta: BLOCKED ou dispensa humana específica,
nunca PASS. Tasks 2.3/5.3/7.7; instalado BLOCKED.

## W13 — Falhas e recuperação

Pré-condições: E/P/B/D/X com snapshot e autorização de injeção para cada caso.
Uma falha por cópia: ACL/espaço/extração/registro/interrupção simulada; pacote
adulterado rejeitado antes de execução; DB corrupto/vazio/futuro; prefs futuras/
IA indecifrável; PowerShell/icacls indisponível dentro da fixture, sem modificar
componentes globais/política. Registrar exit/fase/bytes anteriores e efeitos parciais.
Reparar binários com mesma versão íntegra compatível e app encerrado; validar D.
Walkthrough seletivo DB+journals: Sair, ausência de writer, conservar originais,
copiar somente para workspace fictício confirmado, verificar compatibilidade;
ai.json fica no perfil. Nunca apagar journal/forçar schema/reset/restaurar snapshot
por cima. Explicitar regressão de revisions/markers/avisos em snapshot antigo.
Testar recusa de binário SQL1→dadosSQL2/downgrade incompatível sem tocar original.
Esperado: erro seguro/fase, dados intactos, sem sucesso/atomicidade/replay/bypass
prometidos; recuperação automática não existe. Tasks 2.5/5.2/7.8; instalado BLOCKED.

## W14 — Seleção, manifesto e revisão

Pré-condições: P/X e R7 para CI/upload. Subcasos: candidato exato; staging usado;
histórico coexistente; Setup ausente/duplicado/versão errada; architecture/commit/
run/hash/tamanho mismatch; reconstrução funcional; fonte suja; bundle sanitizado.
Selecionar exclusivamente a tupla esperada no root validado; negativos falham sem
primeiro glob ou apagar históricos. Validar proveniência/toolchain/checksums/lock/
runtime/SQLite/NSIS/assinatura/notices/inventário/manifests e hashes finais. Comparar
payload funcional de rebuild, declarar diferenças de timestamps/metadados/assinatura.
Revisar workflow actions por SHA/contents:read/--publish never; upload somente da
lista exata sanitizada, sem builder-debug bruto/Setup/release/signing automático.
Registrar acesso/custo/retenção reais (14 dias só após R7) e limites admin do runner.
Tasks 3.2–3.6/6.3; automatizado NOT_RUN, CI sem decisão/upload autorizado BLOCKED.

## W15 — Guia e revisão final

Pré-condições: decisões resolvidas, implementação/evidências anteriores; não
inventar conclusão se R4 bloqueado. Fazer walkthrough do guia com P/D/X no ambiente
permitido: conferir origem/hash/versão/arquitetura; instalar/abrir/Sair/manter/reparar/
uninstall/reinstall; retenção/exclusão manual separada; backup apenas tarefas;
recuperação seletiva sem ai.json; legado inseguro/downgrade; limites de lembretes/
IA offline opcional; PowerShell/icacls; unsigned/policy sem bypass.
Para exclusão manual apenas revisar o procedimento: root/ownership/perfil/perda
confirmados; tarefa não autoriza apagar. Conferir cada afirmação versus hash/prova;
CompanyName/publisher conforme R1 e suporte limitado a builds comprovadas. Se surgir
assinatura obrigatória: revisão/autorização próprias e provas pós-assinatura de
exe/Setup/uninstaller/cadeia/publisher/timestamp. Artefato de revisão não é release.
Esperado: guia verdadeiro, pendências/waives visíveis; relatório de verify para
aprovação antes de archive. Tasks 2.7/4.6/5.1–5.3/7.9/8.1–8.2; revisão NOT_RUN.

## Evidências históricas e fechamento

TFA-002 F01–F09, TFA-008, dispensas Q13/TFA-009 e AI16/TFA-010 só orientam fixtures.
Não reabri-las nem usar seus hashes/mocks/waives como PASS instalado do candidato.
Campanha sem ambiente permanece BLOCKED; casos permitidos ainda sem execução ficam
NOT_RUN. Conservar source/lock/par e evidência sanitizada na retenção aprovada.
Falhas do candidato suspendem readiness afetada; novo hash exige reteste pertinente.
Tasks não integralmente executadas permanecem `[ ]`, inclusive quando parte
automatizada passa. Ao fim: requirement→scenario→W/subcase→task→evidence→limitation
no verification; aprovação humana do relatório precede archive e README factual.

## Rastreabilidade dos deltas

A tabela de cenários é complementada a partir dos títulos exatos dos dois deltas;
cobertura documental não significa execução. Os subcasos/fixtures/passos/oráculos
acima devem ser usados junto com WHEN/THEN/AND das specs, que continuam normativos.

| Delta | Cenário normativo | Casos |
| --- | --- | --- |
| desktop-build-validation | Inventário do pacote | W08 |
| desktop-build-validation | ACL do runtime empacotado e instalado | W03 |
| desktop-build-validation | Cobertura integral do payload | W03/W08 |
| desktop-build-validation | Notices de código incorporado | W08 |
| desktop-build-validation | Arquivo ou conteúdo fictício proibido | W08 |
| desktop-build-validation | Diagnóstico permitido não é acesso de produção | W08 |
| desktop-build-validation | Componente do Windows indisponível | W08/W13 |
| desktop-build-validation | Run de revisão | W01/W14 |
| desktop-build-validation | Limite de CI documentado | W01/W14 |
| desktop-build-validation | Bundle de revisão rastreável | W14 |
| desktop-build-validation | Seleção ausente ou ambígua | W14 |
| desktop-build-validation | Matriz padrão completa | W02/W03/W04/W09/W12 |
| desktop-build-validation | Ambiente ou execução bloqueados | W02/W15 |
| desktop-build-validation | Proteção da origem e dos dados | W01/W15 |
| desktop-build-validation | Campanha do produto final | W01/W02/W15 |
| desktop-build-validation | Prova anterior ou simulada | W11/W15 |
| desktop-build-validation | Candidato alterado depois da campanha | W01/W14/W15 |
| desktop-build-validation | Construção rastreável | W01/W14 |
| desktop-build-validation | Saída reutilizada contém versões antigas | W14 |
| desktop-build-validation | Par de manutenção do produto | W05/W09 |
| desktop-build-validation | Integridade alterada | W08/W14 |
| desktop-build-validation | Reconstrução funcional | W01/W14 |
| desktop-build-validation | Ícones íntegros e legíveis | W07 |
| desktop-build-validation | Ícone ausente ou inválido | W07 |
| desktop-build-validation | Bandeja captura e atalhos reais | W11 |
| desktop-build-validation | Segunda instância e ativação de toast | W11 |
| desktop-build-validation | Inicialização opcional no login | W11 |
| desktop-build-validation | Guia operacional fiel | W15 |
| desktop-build-validation | Candidato não assinado | W15 |
| desktop-build-validation | Assinatura passa a ser exigida | W15 |
| desktop-build-validation | Revisão não é publicação | W14/W15 |
| windows-per-user-installation | Destino padrão com caracteres não ASCII | W02/W04 |
| windows-per-user-installation | Override equivalente ao permitido | W04 |
| windows-per-user-installation | Override fora do permitido | W04 |
| windows-per-user-installation | InstallLocation anterior não autorizado | W04 |
| windows-per-user-installation | Known Folder redirecionado | W04 |
| windows-per-user-installation | Known Folder dentro do perfil diverge do runtime | W04 |
| windows-per-user-installation | Atualização manual fictícia | W09 |
| windows-per-user-installation | Desinstalação e reinstalação | W12 |
| windows-per-user-installation | Instalação all-users legada | W04 |
| windows-per-user-installation | Identidade notificações e cleanup próprios | W06/W11/W12 |
| windows-per-user-installation | Atualização entre versões completas compatíveis | W09 |
| windows-per-user-installation | Retenção integral em uninstall normal e silencioso | W10/W12 |
| windows-per-user-installation | Preferência de startup em upgrade | W09/W11 |
| windows-per-user-installation | Credencial fictícia retida no mesmo usuário | W10 |
| windows-per-user-installation | App aberto ou oculto na bandeja | W05 |
| windows-per-user-installation | Manutenção silenciosa com app ativo | W05 |
| windows-per-user-installation | Detecção indisponível ou ownership incerto | W05 |
| windows-per-user-installation | Saída explícita concluída | W05 |
| windows-per-user-installation | Processo reabre entre fases | W05 |
| windows-per-user-installation | Desinstalador anterior sem garantia compatível | W05 |
| windows-per-user-installation | Upgrade com desinstalador seguro | W05 |
| windows-per-user-installation | Identidade estável em manutenção | W06 |
| windows-per-user-installation | Cadastro estrangeiro ou futuro | W06 |
| windows-per-user-installation | Ownership muda antes do cleanup | W06/W12 |
| windows-per-user-installation | Falha depois do início da instalação | W05/W13 |
| windows-per-user-installation | Reparo de binários | W09/W13 |
| windows-per-user-installation | Banco ou configuração não reconhecidos | W10/W13 |
| windows-per-user-installation | Recuperação seletiva autorizada | W13/W15 |
| windows-per-user-installation | Downgrade incompatível | W13/W15 |
| windows-per-user-installation | Usuário deseja apagar dados após uninstall | W12/W15 |
