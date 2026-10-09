# IR2 — transição manual da instalação existente 0.1.0

**Estado: APPROVED em 2026-10-08.** O usuário respondeu **“Aprovo a transição manual
na conta atual e seus limites”**. A conta atual autorizada contém 0.1.0. Leitura conferiu
executável/desinstalador presentes e zero processos TaskFlowApp; não houve remoção.
O candidato novo recusa predecessor sem prova de bytes/guarda, conforme design D3.
Isto impede iniciar instalação limpa e o par 0.2.0→0.2.1 sobre a instalação atual.

## Procedimento concreto proposto

1. Conferir novamente conta/token, destino canônico, identidade, versão e bytes do
   executável/desinstalador existente por leitura. Não usar caminho do registro sem
   validação. Verificar arquivos e ancestrais sem reparse/escape.
2. Salvar rascunhos/Sair. Confirmar ausência dos processos próprios e pedir que o
   operador não abra TaskFlow durante essa operação. Não encerrar processos.
3. Executar **somente o desinstalador antigo próprio verificado**, na conta atual,
   como transição manual explicitamente autorizada. Não pelo Setup novo; não
   sobrescrever/modificar esse binário, passar bypass ou elevá-lo.
4. Conferir resultado/retorno, retenção dos perfis/cache/credencial cifrada sem
   exportação, limpeza própria e terceiros preservados. Não apagar/resetar dados.
5. Instalar o predecessor completo novo 0.2.0 e depois provar o par aprovado
   0.2.0→0.2.1 com os bytes e guardas novos. Reinstalação inicia startup OFF.

## Limites que exigem revisão explícita

O desinstalador legado contém política de encerramento forçado. A consulta anterior
não impede um app reaberto durante sua execução; esta transição **não satisfaz** o
contrato de upgrade seguro do candidato nem será registrada como PASS de W05/W09.
Não existe promessa de atomicidade; eventual falha parcial é relatada e os dados
permanecem fora da remoção. Startup opt-in/desativação externa pode ser perdido
pelo cleanup antigo; revisar/reativar explicitamente depois, sem autoativação.
Não executar a transição se houver identidade incerta/processo ativo ou sem esta
revisão aprovada. Alternativa: manter 0.1.0 intacto e registrar campanha BLOCKED.

Esta aprovação, se concedida, autoriza somente essa transição na conta atual.
Não autoriza outras contas, publicação, assinatura, release, merge ou TFA-012.

## Execução autorizada — 2026-10-08

Transição executada após revalidação; launcher retornou 0 e consulta posterior
confirmou binários/registro/metadata removidos. Não repetir a transição: 0.1.0 já
foi removido. Limites e evidência parcial de retenção registrados em
[campaign-results.md](campaign-results.md). Nenhuma instalação positiva nova ainda.
