# Instalação e manutenção do TaskFlow App no Windows

Uso pessoal/controlado, sem atribuição empresarial. A distribuição é manual e
exige autorização própria; pacotes locais de revisão não são releases. Consulte
o [roadmap](roadmap.md#tfa-011--instalador-definitivo-e-distribuição-windows) para os
resultados reais e limites do candidato. Não presumir suporte a uma build do
Windows pela compatibilidade teórica: a campanha usa Windows 11 x64 e registra
edição/build de cada execução.

## Obter e verificar o pacote

O pacote de revisão local fica em `release/candidates/<build-id>`, com ID formado
por versão, arquitetura, commit e run. Conserve o Setup exato, `manifest.json`,
`inventory.json`, notices e evidências correspondentes. Confira origem confiável,
versão, arquitetura, tamanho e SHA-256 do Setup contra o manifesto. No PowerShell,
`Get-FileHash -Algorithm SHA256 -LiteralPath '<arquivo exato>'` só lê o arquivo.
Hash confirma integridade relativa ao manifesto; não prova publisher ou confiança
pública. Não escolher o primeiro Setup de uma pasta, nem o 0.1.1 histórico.

O candidato aprovado é **não assinado**. Se Windows ou política da organização
bloquear sua execução, pare e registre a limitação; não contorne políticas nem
instale certificados de confiança. Uma assinatura futura exige revisão própria.

## Instalar e abrir

1. Salve rascunhos/tarefas. Um backup JSON preventivo é opcional e contém somente
   tarefas; não transporta lixeira, credenciais, preferências ou desfazer.
2. Use **Sair** na bandeja/aplicativo e aguarde a drenagem. X/Alt+F4 pode manter o
   aplicativo na bandeja e não satisfaz a condição de manutenção.
3. Execute o Setup verificado na própria conta. O destino é o Known Folder
   UserProgramFiles, coerente com `%LOCALAPPDATA%\Programs\TaskFlowApp`; não há
   instalação all-users, escolha livre de destino ou serviço de sistema.
4. Abra manualmente **TaskFlow App** pelo Menu Iniciar. O instalador não abre o app
   automaticamente. Confirme os dados e recursos efetivamente provados na campanha.

O gerenciamento principal funciona sem backend/conta ou Node/npm externo.
PowerShell do Windows e `icacls` são componentes do SO necessários às operações
nativas; indisponibilidade/bloqueio causa erro seguro. Não instalar runtimes ou
modificar sandbox/política para compensar. IA é opcional, por gesto e consentimento;
requisições remotas exigem rede, e nenhuma prova de distribuição chama provedor pago.

## Atualizar e reparar

Verifique a nova versão íntegra e use Sair antes de instalar. O par homologado pela
TFA-011 foi 0.2.0→0.2.1 e permanece como registro; para o candidato **C `0.2.2`** em
homologação (TFA-012), o predecessor reconhecido pelo pacote é **B′ `0.2.1`/`1195277`**,
fixado pelo hash exato do Reader (`6e34919d…`) em `build/nsis/trusted-predecessors.nsh` —
alterar esse pin é ato de build revisado, não do operador. Ambos os lados devem conter
produto completo e guardas compatíveis. O Setup
recusa processo próprio ativo ou consulta inconclusiva, inclusive `/S`, sem kill.
Salve rascunhos, use Sair e investigue o motivo antes de tentar novamente.

O predecessor é verificado por identidade/caminho/versão **e bytes do uninstaller**.
Upgrade direto do 0.1.0 inseguro é recusado. A transição manual antiga é separada e
requer revisão explícita: seu desinstalador pode encerrar app reaberto e remover
startup. Não considerar essa transição prova de upgrade seguro do candidato.

Upgrade compatível conserva perfil, shortcuts v1, configuração de IA v1 cifrada
e escolha/desativação externa de startup. Reparo usa a **mesma versão íntegra**,
sem reset nem substituição do perfil. Uma recusa de preflight conserva recursos
existentes; falha depois de extração/remoção pode deixar binários parciais. Registre
a fase, conserve dados e use reparo compatível quando as guardas o permitirem.
Não existe rollback atômico do Setup ou recuperação automática de dados.

Use somente o procedimento do candidato identificado. O pin do pacote candidato fixa o
predecessor permitido (A `0.2.0` na campanha da TFA-011; **B′ `0.2.1`** para C `0.2.2`);
isso não libera upgrade entre previews quaisquer. A transição manual 0.1.0 foi revisada e
executada nesta conta, conservando seus limites; não é instrução para repetir o
legado nem autorização para substituir seu desinstalador.

As guardas recusam argumentos/destino, consulta de processo incerta, identidade
estrangeira/futura e predecessor sem procedência antes da manutenção persistente.
`/S` conserva essas guardas e suprime a mensagem visual; não contorna a recusa.
O Setup sinaliza a falha por retorno não zero. Uma fixture isolada comprovou que
o launcher NSIS retorna0 enquanto o processo temporário recusa com111; seu retorno
isolado não comprova conclusão nem aceitação. A [decisão IR3](../openspec/changes/archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/silent-uninstall-review.md)
foi aprovada: manter NSIS, sem controlador adicional. O retorno do launcher normal
não serve como contrato de automação; aguarde e confira o resultado efetivo.
O uso comum é desinstalar pela interface do Windows após Sair. Guardas e retenção
continuam exigidas. Setup e remoção anterior de cópia verificada propagam falha. A negativa
na instalação real permanece não executada, após bloqueio da revisão automática
e pedido de autorização específica; não é PASS.

Se a operação chegar a extração/ACL/registro/geração de uninstaller/remoção,
o erro identifica essa fase. Conserve o perfil e os binários parciais para revisão;
não os apague manualmente para contornar uma guarda. Repare somente com a mesma
versão e procedência reconhecida. Recusa de preflight e falha parcial têm oráculos
distintos; nenhum resultado implica rollback atômico.

## Desinstalar e reinstalar

Use Sair e a desinstalação própria registrada pelo Windows. `/S` mantém as guardas
e recusa a operação se não for seguro prosseguir; não representa confirmação para
encerrar processos. Cleanup confere ownership e conserva recursos estrangeiros.

Perfis, tarefas/lixeira válida, IDs/revisões/recorrências/subtarefas/markers,
atalhos personalizados, IA cifrada e cache/session-data ficam retidos em
`%LOCALAPPDATA%\TaskFlowApp\profiles\<dev|test|prod>`, separados dos binários.
Reinstalação compatível reconhece esses dados e começa com startup **OFF**.
Desinstalar não revoga uma credencial no provedor. Cache não é um backup.

## Recuperar dados com revisão explícita

Primeiro separe falha de binários de falha de dados. Não apagar banco/configuração
futura ou corrompida, forçar versão, apagar journals ou restaurar snapshot por cima
do perfil atual. Preserve originais e trabalhe com cópias fictícias na validação.

1. Use Sair e confirme ausência de writer/relay próprio. Se houver dúvida, não copie
   banco aberto nem trate cópia parcial como recuperação válida.
2. Confirme o perfil e o root reais. O banco de produto é
   `user-data\data\taskflow.sqlite`; conserve também os auxiliares SQLite existentes
   (`-wal`, `-shm`, `-journal`) junto ao original e às cópias seletivas necessárias.
3. Preserve os originais. Revise uma cópia seletiva de banco/auxiliares em local
   próprio restrito, sem incluir **ai.json**, credenciais, cache ou o perfil inteiro
   em backup de recuperação/evidência. Não copiar dados reais para o repositório.
4. Valide assinatura/schema/payload e compatibilidade antes de qualquer restauração.
   Se o banco/configuração continuar bloqueado, registre o motivo e peça revisão;
   não apagar auxiliares para conseguir abrir.
5. Snapshot antigo pode regredir revisões/markers e reenviar avisos. A agenda tem
   graça de cinco minutos e prevenção de duplicidade; manutenção pode perder aviso.
   Não há garantia de replay seguro ou entrega exactly-once.

SQL1 não lê SQL2. Downgrade sem compatibilidade demonstrada é recusado; não restaurar
banco antigo sobre o atual nem reativar startup incompatível. Backup JSON v1–v4
transporta tarefas e não equivale a backup/recuperação integral do perfil.

O walkthrough reproduzível usa somente fixtures em
`tests/tools/maintenance-fixture.test.ts`, com os adapters reais de armazenamento.
Execute `npm exec -- vitest run tests/tools/maintenance-fixture.test.ts` na raiz do projeto,
com a toolchain fixada. O teste fecha o writer, conserva o banco original e copia
somente DB/auxiliares existentes e preferências fictícias para outro diretório.
Compara tarefas, lixeira, revisões, SQL2/codec4, recorrências/subtarefas/markers e
shortcuts; **ai.json** fica excluído. Uma alteração posterior do marker evidencia
a regressão que a cópia antiga causaria. O leitor SQL1 recusa o banco SQL2 sem
alterar seus bytes; journal órfão é conservado e bloqueia abertura sem criar DB.
Essas provas validam o procedimento e seus oráculos, sem restaurar dados reais
nem comprovar retenção por Setup/upgrade/uninstall.

## Apagar dados retidos é uma operação separada

Se desejar, remova a configuração de IA pelo fluxo existente antes de desinstalar.
A revogação no provedor é uma ação separada do próprio titular. Para excluir dados
retidos: use Sair, confirme root canônico e ownership, selecione somente o perfil
pretendido e confirme a perda de tarefas/lixeira/markers/preferências/credencial/cache.
Use seleção manual explícita no Explorer; este guia não oferece wipe, checkbox ou
comando amplo e não autoriza executar a exclusão. Não seguir atalhos/junctions ou
apagar Known Folders pais, outra conta ou perfis não selecionados.

## Reproduzir uma inspeção local

Use Node 24.21.0/npm 11.21.0 e o lockfile, sem atualização implícita de dependências.
`npm run package:win -- --run <id>` cria uma saída exclusiva; saída já existente
reprova. Use o build-id emitido em `npm run verify:package -- --stage <build-id>` e
`npm run smoke:packaged -- --stage <build-id>`. O smoke usa cópia/perfil fictício e
não executa Setup. Runner CI administrador não comprova conta padrão/UAC.
O diagnóstico de fundação e o product-harness exigem o perfil `test` explícito;
o handler recusa o diagnóstico em `prod`/`dev` antes de executar a prova. O
catálogo público continua 43/14, sem caminho ou bridge de manutenção novos.

Para reproduzir a prova local de proteção nativa, execute
`node scripts/probe-maintenance-profile.mjs` no Windows, na raiz do projeto.
O tooling cria uma fixture exclusiva/restrita em `.tmp/tfa011-tests`, sem ler o
perfil real, iniciar agenda, conectar provedor ou adicionar IPC. Dois processos
Electron usam o adapter de produto e DPAPI real com uma credencial fictícia:
gravação cifrada, leitura na mesma conta, ausência do texto simples e recusa de
configuração futura/cifra ilegível sem alteração. Somente resultados sanitizados
ficam em `proof.json`; valores, configuração e hashes de credenciais não são
evidência exportável. Esta prova não substitui a campanha instalada nem demonstra
isolamento entre contas, excluído da execução atual por decisão humana.

O inventário cobre arquivos externos/resources/ASAR e distingue recursos gerados
na instalação. Notices Vue/Pinia e transitivas incorporadas acompanham o pacote;
Electron/Chromium/Node/SQLite têm notices runtime. Varredura de nomes/conteúdo é
defesa adicional à revisão de origem; ASAR não cifra código e scanner não certifica
ausência universal de segredos. A inspeção compara a derivação do master SVG e os
cinco PNGs 16/24/32/48/256 do ICO com RT_GROUP_ICON/RT_ICON de exe, Setup e
uninstaller; recursos ausentes/adulterados reprovam. Isso não substitui prova visual de
temas/DPI/atalho/tray/toast. Provas ausentes permanecem visíveis no roadmap/relatório.
Revisão dos notices dos plugins NSIS: a procedência foi concluída com os pacotes
oficiais dos autores; nsisunz traz licença completa, WinShell declara Freeware e o
SpiderBanner não publica licença — a limitação está explícita no notice entregue.
A licença do núcleo NSIS não cobre plugins externos. O pacote ainda não é candidato
final aceito.

Uploads de CI estão suspensos para entrega por decisão R7 local; não presumir
privacidade/gratuidade por `private` do npm. Acesso, custo, canal e retenção de um
futuro artifact externo exigem decisão própria. Preserve os bytes do par de prova;
Setup não é prometido determinístico byte a byte. Fonte suja invalida candidato
final, mesmo que o empacotamento técnico passe.

## Evidência disponível e provas pendentes

Este guia descreve o contrato implementado; a aceitação do produto final exige
a campanha no hash final. Referência histórica da TFA-011: **0.2.1 B′** (commit
`1195277`, Setup f10c308e…). A homologação corrente (TFA-012) constrói e avalia
**C `0.2.2`** e registra resultados em [desktop-homologation-results.md](desktop-homologation-results.md)
(roteiro: [desktop-homologation.md](desktop-homologation.md)).
Resultados detalhados e falhas históricas estão em
`openspec/changes/archive/2026-10-09-finalizar-instalador-e-distribuicao-windows/campaign-results.md`.

| Instrução | Verificação da implementação | Limite atual |
| --- | --- | --- |
| Instalar por usuário/abrir manualmente/unsigned | NSIS per-user/sem runAfterFinish; manifests reais asInvoker/uiAccess=false; instalação limpa normal do A e do B′ (exit0) com registro/atalho e payload conferido contra o manifesto; ACE AppContainer só no root | Destino offline sem Node/npm e conta com Unicode/espaços NOT_RUN |
| Salvar rascunhos e usar Sair | Guardas de processo recusam app visível e oculto na bandeja (exit111) e com duas superfícies; uninstall `/S` recusa efetiva; reparo após Sair exit0; encerramento por sessão gracioso | Jobs/relay/commit em voo e reabertura entre fases pendentes |
| Recusa silenciosa/destino/identidade | W04 14/14 no B′ (allusers/duplicados/malformados/`/D` externo recusam100; `/D` canônico e `/currentuser` válidos aceitam); HKCU inválido sim recusa100; versão futura129; estrangeiro/unpinned131 preservando bytes; IR3 aprovada | Known Folder redirecionado, ownership ACL, HKLM e reparse sem simulação instalada segura |
| Upgrade seguro/reparo | Par final A→B′ com pin do predecessor por Reader-hash: upgrade exit0/52s e reparo exit0/47s, dados/ACL intactos; `_?=` propaga não zero; upgrade legado literal não disponível | Corrida de processo durante a remoção do predecessor seguro pendente; 0.1.0 histórico |
| Retenção/uninstall/reinstall OFF | Uninstall normal e `/S` + reinstall do B′: dados byte a byte intactos, ACLs conservadas, atalho recriado e startup OFF; valor de startup ON simulado preservado no reparo; segundo lançamento único | Credencial fictícia instalada/DPAPI pós-manutenção e segunda conta BLOCKED/dispensa |
| Recuperação seletiva/compatibilidade | Walkthrough SQL2/codec4/markers/shortcuts/auxiliares/recusa SQL1 intacta, sem ai.json | Somente fixtures; não restaura dados reais nem autoriza replay/downgrade; perfil test instalado está vazio (sem semear) |
| Excluir dados/revogar IA | Exclusão manual separada do uninstall, root/perfil/ownership/Sair; revogação pelo titular | Exclusão não executada nem autorizada por este guia |
| Ícones/payload/diagnóstico | Inventário/notices (dc9ef68…) e bytes instalados do B′ conferidos contra o manifesto; cinco frames PE22, negativas de conteúdo/ícones; handler restrito a test | Visual/DPI humano, gestos nativos (tray/Quick Add/cópia/toast/COM) e registro CLSID prod (prod não aberto) pendentes |

Segunda conta foi excluída por decisão humana, sem PASS. Logoff/login real,
energia real e publicação não foram autorizados por inferência. Se uma política
impedir o componente nativo ou pacote unsigned, conserve a evidência e pare essa
operação; a ausência de prova não amplia o suporte declarado.

## Homologação TFA-012 no candidato C 0.2.2 (2026-10-10)

No escopo autorizado (somente a conta atual; perfil `prod` confirmado exclusivamente fictício), o par **B′ 0.2.1 → C 0.2.2** foi executado no root per-user real com resultados registrados em [desktop-homologation-results.md](desktop-homologation-results.md):

- **Upgrade `/S`:** exit 0 (46 s); `DisplayVersion 0.2.2`; bytes instalados idênticos ao candidato (exe `3de93f34…`, uninstaller `56b7e5ef…`, ASAR `1d07b23b…`); atalho recriado; perfil preservado **byte a byte**.
- **Uninstall/reinstall `/S`:** remoção efetiva de binários/atalho/registro com dados retidos byte a byte (incluindo `ai.json` de credencial fictícia); reinstall íntegro com **startup OFF** e reabertura conservando 10 tarefas/IDs. **IR3 em ação:** a primeira chamada do uninstaller retornou 0 **sem efeito** e o oráculo por estado recusou o PASS; a repetição idêntica removeu corretamente — conserve falhas e repita somente com razão concreta, conferindo o estado efetivo.
- **Pendências nativas (NOT_RUN):** toast visual/clique humano, diálogo nativo de backup, rebind/conflito de atalhos instalado, zoom de layout 200% (sem acesso a `webContents.setZoomFactor` pela janela instalada), DPI/leitor de tela/multimonitor, suspensão/offline reais. Nenhuma parcela simulada foi marcada como nativa.
