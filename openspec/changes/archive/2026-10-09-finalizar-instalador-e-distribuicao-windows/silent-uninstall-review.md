# IR3 — Retorno do launcher NSIS no uninstall silencioso

**Estado: APPROVED em2026-10-08, opção manter NSIS.** O usuário respondeu **“Sim, aprovo”** à recomendação de manter o instalador simples, sem controlador PowerShell novo, e documentar como limitação conhecida o retorno da desinstalação por comando automático.

O launcher normal do uninstall, inclusive /S, pode retornar0 antes do filho; seu exit code não é contrato de automação. Observar recusa/conclusão efetiva. Guardas, ausência de kill/elevação, retenção e ownership continuam obrigatórios. Setup e predecessor executado de cópia verificada com _?= continuam propagando não zero. Tasks2.2/2.5/7.3/7.7 ficam abertas até suas demais provas; a decisão não é PASS nem dispensa guardas ou retenção em /S.

## Prova concreta e efeito no contrato

Em 2026-10-08 foi compilada uma fixture exclusiva, sem Delete/RMDir/registro,
app ou perfil real. Seu un.onInit executa somente SetErrorLevel111 e Quit.
O compilador NSIS3.0.4.1 usado tem SHA-256
e277b7378931b74392015f5ad6b1d744dcd8a347baa4480350a75ebeab8d8e3d.
Arquivos locais ignorados: .tmp/tfa011-tests/nsis-launcher-semantics-01.

| Invocação da fixture | Esperado pelo contrato | Observado |
| --- | --- | --- |
| Launcher normal com /S | 111 | 0 |
| Execução direta com /S e _?= apontando à própria fixture | 111 | 111 |

O launcher normal copia/reabre o uninstaller e termina antes do processo que
executa un.onInit. O código desse processo não é propagado pelo launcher.
O [manual NSIS, opções do uninstaller](https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.2)
documenta que _?= impede essa cópia/reabertura e permite aguardar com ExecWait.
Foi consultado como fonte primária; a conclusão acima também tem prova local.

O Setup já usa uma cópia verificada do predecessor fora do root binário e _?=;
essa rota conserva o retorno direto. A invocação normal do uninstaller instalado
motivou a revisão do requisito original de código não zero nessa rota.
SetErrorLevel sozinho não corrige o launcher. Passar _?= ao executável ainda no
root instalado não é solução de cleanup: ele pode permanecer em uso durante a
remoção. Não trocar os bytes do uninstaller instalado nem anunciar W05 PASS.

## Alternativa discutida e não escolhida — registro histórico

Opção recomendada para investigação/implementação: tornar a entrada canônica de
manutenção um controlador PowerShell versionado, usando o componente do Windows
já exigido pelo projeto. O controlador executaria guardas sem efeitos, verificaria
ownership/versão/hash do uninstaller, criaria staging próprio exclusivo fora dos
binários/dados, copiaria somente o uninstaller comprovado e o executaria com _?=,
aguardando o término e propagando o código. Cleanup do staging teria ownership
comprovado. Sem kill, elevação, serviço, rede, runtime adicional, IPC novo ou
ExecutionPolicy bypass; política que impeça o script deve bloquear a manutenção.

Essa opção muda a entrada pública registrada e seu formato de argumentos, exige
revisão de UninstallString/QuietUninstallString, preflight do predecessor, inventário,
procedência/guardas do controlador, cleanup e testes. O comando silencioso suportado
passaria a ser essa entrada controlada; chamar o binário interno diretamente não
seria a interface pública de automação. Esses ajustes de arquitetura e contrato
precisam de aprovação explícita pelo AGENTS.md13 antes de serem implementados.
Não presumir que IR1 autorizou um controlador novo. O par final precisa ser
reconstruído e a campanha afetada refeita; previews existentes não são predecessores
definitivos. A viabilidade será comprovada primeiro em fixture exclusiva, inclusive
erro do filho, timeout, argumentos inválidos, preservação e remoção dos arquivos.
Se essa prova falhar, parar o ponto e retornar à revisão, sem fallback inseguro.

Alternativa: manter a entrada NSIS atual e aprovar explicitamente a limitação de
retorno do launcher normal, com espera/verificação posterior como oráculo. Isso
reduz o requisito aprovado de código não zero para essa rota e requer alterar os
artefatos e registrar dispensa; não é uma correção equivalente nem PASS implícito.
Também é possível manter o contrato e deixar esse ponto BLOCKED até outra solução.

## Autorização específica de execução ainda pendente

A revisão automática rejeitou executar /S /allusers no uninstaller próprio do
preview15 instalado: se a guarda falhar, pode remover a instalação; considerou que
a autorização geral de uninstall não cobria esse payload inseguro específico.
O script .tmp/tfa011-tests/probe-uninstall-silent-refusal.ps1 não foi executado.
A aprovação da limitação não autoriza esse payload específico. O pedido de execução continua sem resposta; essa execução não é necessária para a exceção aprovada. Não contornar essa
rejeição por outro processo ou flag. A fixture acima não usa a instalação real.

R4/IR2 continuam válidas dentro de seus limites; não repetir a transição legada.
Proveniência, inspeção e demais trabalhos independentes podem prosseguir.

Consulta somente por leitura do PowerShell do Windows na conta atual:
MachinePolicy/UserPolicy/Process/LocalMachine Undefined; CurrentUser RemoteSigned.
Nenhuma política alterada. Isso permite avaliar a viabilidade local da proposta,
sem provar scripts distribuídos ou execução em políticas mais restritas. Um
bloqueio deve permanecer visível; não acrescentar ExecutionPolicy bypass.
