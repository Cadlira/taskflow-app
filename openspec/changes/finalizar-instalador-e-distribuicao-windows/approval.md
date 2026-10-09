# Aprovação e condições da TFA-011

## Evidência humana — 2026-10-08

Após o pedido de `$openspec-apply-change` e a apresentação das condições, o usuário
declarou **“pode aprovar os artefatos”**. Proposal, design, os dois deltas e tasks da
TFA-011 estão aprovados. O pedido de apply anterior continua vigente, permitindo
tarefas independentes dessas decisões materiais. Aprovação documental não autoriza
Setup, criação de contas/VM, alteração de máquina corporativa ou publicação.

O usuário respondeu a R1: **“Uso pessoal/controlado, sem atribuição empresarial”**.
Não atribuir QSI como responsável, nem tratar o nome do produto como publisher legal.
A política de metadados finais será ausência de atribuição empresarial, conservando
a identidade técnica; sua implementação ainda não foi executada.

| Revisão | Estado | Valor/evidência |
| --- | --- | --- |
| R1 | DECIDED | Uso pessoal/controlado, sem atribuição empresarial, resposta humana acima |
| R2 | DECIDED | Windows 11 Home Single Language x64, build 26200, ambiente conferido; suporte só poderá ser declarado conforme resultados do candidato |
| R3 | DECIDED | Par privado completo 0.2.0→0.2.1, recusa de upgrade direto do 0.1.0 inseguro; transição manual IR2 posteriormente autorizada/executada, sem alegação de upgrade seguro |
| R4 | AUTHORIZED LIMITED | Somente conta atual; Setup/upgrade/uninstall autorizados. Windows 11 x64 build 26200, token não elevado/sem Administrators, UAC ativo conferidos; segunda conta excluída, logoff/login e ausência de Node/npm não comprovados |
| R5 | DECIDED | Reter integralmente perfil/cache/IA cifrada após uninstall; exclusão manual separada, sem execução de remoção de dados |
| R6 | DECIDED | Pacotes unsigned para prova controlada, sem contratação/assinatura |
| R7 | DECIDED LOCAL | Build local rastreável por enquanto, sem upload/distribuição; retenção/acesso/custo de CI continuam sem decisão para uso externo |

Em resposta às perguntas nesta continuação, o usuário declarou **“Está tudo
liberado pode implementar”** para R2/R3/R5/R6/R7; **“Aprovo a revisão e adaptação
NSIS proposta”** para IR1; e **“Não vamos testar em conta de teste apenas na conta
atual. Pode testar tudo setup/upgrade/uninstall”** para R4. A prova de segunda conta
foi excluída por decisão humana, não executada e não convertida em PASS. A autorização
não comprova conta padrão/Unicode ou logoff real; resultados serão registrados
individualmente. Não criar ambiente/contas nem publicar por inferência.

IR1 está aprovado para adaptação versionada no projeto, com guardas antes de
SetOutPath, sem modificar node_modules, mantendo os contratos estritos. Custom
script do builder 26.17.0 não pré-gera/assina o uninstaller: o script deve incorporar
sua geração NSIS e sua inspeção; eventual assinatura futura exige nova revisão.

### Ambiente conferido nesta continuação

Leitura fora do sandbox: Windows 11 Home Single Language, build 26200, x64;
token não elevado, grupo Administrators ausente, UAC EnableLUA=1; conta atual.
Nenhum processo TaskFlowApp encontrado. Instalação existente **0.1.0**, com
executável e uninstaller presentes. Transição manual autorizada explicitamente em
[IR2](legacy-transition-review.md): **“Aprovo a transição manual na conta atual e seus limites”**.
SID e paths pessoais não são publicados. Espaços/Unicode por conta e isolamento
entre contas não são demonstrados pela escolha de usar somente a conta atual.

**Registro consolidado R4 (task1.3, 2026-10-08):** autorizada somente a conta atual
para Setup/upgrade/uninstall/reparo, com falhas simuladas restritas a
fixtures/cópias fictícias no escopo dessas operações; segunda conta excluída por
decisão humana (sem PASS de isolamento); logoff/login real e powercut não
autorizados especificamente. Verificação por leitura nesta data: OS/build/
arquitetura, token não elevado, grupo Administrators ausente, UAC ativo, zero
processos próprios, root binário per-user com exe/uninstaller e raiz de dados
presentes, sem reparse no root/ancestrais. Ausência de Node/npm no destino,
ambiente offline e perfil com espaços/Unicode não comprovados: subcasos W02/W15
permanecem BLOCKED/dispensa específica, nunca PASS.

### Decisão 4.2 e autorização do par — 2026-10-08 (continuação)

O usuário respondeu **“1 - Aceita a limitação documentada”**: task4.2 concluída com
procedência completa e a limitação do SpiderBanner explícita no notice, sem
inferência de licença e sem remover integração/UI. O usuário respondeu
**“2 - autorizado”** aos **commits do par limpo0.2.0→0.2.1** (dois commits/hashes
distintos na branch), seguidos de package/verify/smoke dos dois lados e da campanha
W01–W15 no escopo R4. A autorização não inclui push/PR/merge/archive/upload/
distribuição/CI nem TFA-012.

Continuação 2026-10-09: achado W04 do `/currentuser` malformado apresentado ao
usuário; em resposta **“Pode continuar”**, a correção do guard foi executada
(commit `1195277`) e o candidato0.2.1 foi reconstruído como **B′** (Setup
f10c308e…). O B anterior (1152e1b, Setup144d413b…) permanece histórico/superseded;
as demais autorizações não foram ampliadas.

## Limites de execução

- Branch reutilizada `codex/tfa-011-finalizar-instalador-e-distribuicao-windows`,
  base `f91ce401c8648a8d0aa984975c72885f9c023ee6`.
- Trabalho preexistente: roadmap modificado e Change não rastreada, preservados.
- A preparação do protocolo 1.4 é independente das escolhas pendentes e não executa
  seus passos. Tooling genérico pode ser preparado sem escolher versões/canal.
- Tarefas com decisões pendentes ou aceitação instalada permanecem desmarcadas.
- Sem autorização de commit/push/PR/merge/archive, distribuição, TFA-012, criação
  de ambiente/contas ou chamada real/paga de IA. Manutenção na conta atual autorizada.
- Waives históricos permanecem históricos; não satisfazem provas do candidato final.

## Progresso e ponto material de revisão

Estado corrente: **28/41** tasks (1.3/4.2/6.1–6.3/7.9 e a entrega de8.1/8.2
registradas; par limpo0.2.0→0.2.1 construído, instalado, atualizado e reparado;
relatório de verificação entregue para aprovação com13 tasks abertas dependentes de
dispensa/ambiente).
Preview25 0.2.0 instalado/inspecionado, reparo15→25 exit0/52s, árvore completa dos dados e ACL
dos dados/pai dos binários intactas. Validate25 PASS (1.411+11 skipped/volume2/
lint/cinco tipos/build), package/verify/smoke integral42 e inspeção instalada PASS.
Procedência dos plugins NSIS resolvida com os pacotes oficiais; notice atualizado
(dc9ef68…); task4.2 concluída com a limitação do SpiderBanner aceita pelo usuário
(limitação explícita no notice). Nenhuma operação ativa.
Flags/extração/CompanyName
corrigidos; previews22/23 package/verify/smoke integral42 PASS, NSIS efetivo inspecionado.
Validate23 PASS (1.386+11 skipped/volume2/lint/typechecks/build).
Validate24-retry PASS (1.410+11 skipped/volume2/lint/cinco tipos/build), após timeout
localizado do teste de PE. Preview24 package/verify PASS; proveniência3.4 concluída.
Smoke24 inicial FAIL no heartbeat2.617ms/limite2.500ms; repetição dos mesmos bytes
exit0/42 PASS, heartbeat655,4ms. Falha inicial conservada e causa não isolada,
sem alterar orçamento ou converter a falha em WARN. Nenhuma sessão em execução.
5.2/5.4 concluídas: walkthrough/oráculos locais e DPAPI real/mesma conta PASS,
sem rede nem segredo/configuração exportados; 13 testes focados/lint/tipos PASS.
2.6/4.1/4.3/4.5 concluídas: NSIS/inventário/conteúdo/ícones. Restrição adicional
do diagnóstico ao perfil test confirmada em23 e por testes prod/dev; 4.4 concluída.
IR3 em silent-uninstall-review.md: prova isolada do retorno0 do launcher
NSIS versus111 com _?=. O usuário depois respondeu “Sim, aprovo” à recomendação de manter NSIS simples,
sem controlador PowerShell, e documentar a limitação do retorno do launcher normal.
IR3 APPROVED nessa opção; guardas/retencão/ownership e não zero do Setup/predecessor
executado de cópia verificada continuam exigidos. Não dispensa outros cenários.
Fonte dirty e par final limpo não preparado. Evidência em campaign-results.md;
registros seguintes são históricos. Aprovações de manutenção seguem vigentes.

Tasks 1.1/1.4/3.2 concluídas, **3/41** confirmadas pela CLI antes desta atualização.
IR1 aprovado e implementado por adaptação versionada, sem edição de node_modules.
O preview local 0.2.0 `nsis-preview-7` completou package:win e verify:package;
os três manifests são asInvoker/uiAccess=false. Fonte dirty explicitamente marcada
INVALID_CANDIDATE_DIRTY_SOURCE; não satisfaz par final limpo nem campanha instalada.
Trinta testes focados, lint e cinco typechecks passaram. Evidência final e tasks
restantes continuam dependentes de suas verificações, sem herdar PASS histórico.
