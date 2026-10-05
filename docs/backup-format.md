# Formato de backup e migração de dados (TFA-007)

Documento técnico do contrato de arquivo `taskflow-backup` implementado pelo núcleo portável do
aplicativo. Ele descreve o formato, a cadeia de migrações, a validação/projeção e a diferença entre
os três números versionados do sistema. A entrega funcional completa (diálogos nativos, prévia,
confirmação e área de Backup) é integrada pela mesma Change e somente é anunciada após as
verificações do apply.

## Envelope

A exportação gera exatamente as chaves `format`, `formatVersion`, `exportedAt`, `app` e `tasks`,
com indentação de 2 espaços:

```json
{
  "format": "taskflow-backup",
  "formatVersion": 4,
  "exportedAt": "2026-10-05T12:00:00.000Z",
  "app": { "version": "0.1.0" },
  "tasks": []
}
```

- `format` é a constante `taskflow-backup`; qualquer outro valor recusa o arquivo.
- `formatVersion` é um inteiro ≥ 1. O leitor aceita 1–4, normaliza para 4 e recusa versão futura.
- `exportedAt` é um instante ISO 8601 UTC canônico (`toISOString()`); formatos equivalentes são
  recusados.
- `app.version` é informativa: **não** seleciona migração, codec nem schema.
- `tasks` é a lista de tarefas; propriedades desconhecidas no envelope, na tarefa, no lembrete, na
  regra, na subtarefa ou na lista não são persistidas nem exportadas.

## Versões e migrações

| Versão | Conversão | Preservação verificada |
| --- | --- | --- |
| 1 | Lembretes legados recebem `type: "OFFSET"`; `lastTriggeredFor` vira `processedFor = lastTriggeredFor − offsetMinutes` | Valor inválido **não** é descartado: continua inválido e recusa o arquivo inteiro |
| 2 | `v2→v3` apenas habilita o modelo de séries | OFFSET/AT e marcadores intactos; nenhuma série é inventada |
| 3 | `v3→v4` acrescenta `subtasks: []` a cada tarefa | Histórico de `seriesId`, regra, âncora e `until` intacto |
| 4 | Nenhuma migração | `subtasks` é obrigatório; ordem e marcação preservadas |

A leitura sempre devolve a **versão original** (`sourceFormatVersion`) separada da versão
normalizada (4). A prévia de importação mostra as duas; nenhuma rotina usa a versão do app para
decidir migração.

## Validação estrita e projeção

A validação segue os contratos estritos do backup (textos com limites e sem espaços nas
extremidades, enums, instantes canônicos, relação `DONE`/`completedAt`, tags distintas, URL
HTTP(S), até 10 lembretes com ids/instantes distintos e `AT` até o prazo, até 20 subtarefas com
ids únicos dentro da tarefa, regra de recorrência com frequência/parâmetros válidos, prazo e
`seriesId`). Um único registro inválido recusa o arquivo inteiro — nada é importado parcialmente.

Diferenças deliberadas do desktop em relação ao validador da origem:

- os problemas são dados seguros: `taskIndex`, `field`, `code` e índices posicionais
  (`reminderIndex`/`subtaskIndex`), sem título, mensagem livre, valor, URL ou caminho;
- o coletor retém no máximo **5** problemas e conta o restante (`extraIssueCount`), sem construir
  lista ilimitada;
- a projeção é explícita em todos os níveis: propriedades desconhecidas são descartadas,
  inclusive dentro de `recurrence`, e não viram configuração persistida;
- `until` histórico aceito pelo backup não recebe retroativamente a regra de edição de formulário
  (`until >= dueAt`).

## Limite de arquivo e encoding

- Limite simétrico de **20 MiB (20 971 520 bytes) do arquivo completo**, inclusive envelope e BOM
  inicial opcional de entrada. Igualdade é aceita; excedente recebe `FILE_TOO_LARGE`.
- Entrada: UTF-8 estrito, com no máximo um BOM inicial opcional; UTF-16, BOM repetido e sequência
  malformada recebem `INVALID_ENCODING`. A leitura usa um único handle de arquivo regular e coleta
  no máximo `limite + 1` bytes, mesmo que o arquivo cresça depois do `stat`.
- Saída: UTF-8 **sem BOM**; a serialização mede os pedaços em bytes antes de materializar a
  string/Buffer completa e recusa acima do limite sem truncar.

## Codec × schema SQL × formato de backup

Três números independentes — confundi-los é um erro de projeto:

| Contrato | Versão atual | Papel |
| --- | --- | --- |
| Codec de payload (`stored-task-codec`) | 4 | Como uma tarefa é gravada/validada no banco, inclusive com dados históricos mais amplos |
| Schema SQL (`product-schema`) | 2 | Estrutura das tabelas de tarefas/lixeira e metadados de revisão |
| Formato de backup (`taskflow-backup`) | 4 | Envelope e contrato de arquivo para importação/exportação |

O backup **não** é um dump do SQLite, não contém metadados de revisão, lixeira, credenciais,
configuração de IA ou estado temporário de desfazer. A lixeira existente no app é preservada por
uma substituição de importação; ela não é transportada no arquivo.

## Dados históricos não exportáveis

O codec histórico aceita valores que o contrato estrito do backup recusa (por exemplo, espaços nas
extremidades em textos antigos ou instantes não canônicos). A exportação valida o snapshot pelo
**próprio leitor** e, se qualquer tarefa não for representável, recusa a operação inteira com
`LOCAL_DATA_NOT_EXPORTABLE` (campos/códigos/índices seguros, no máximo cinco). Nenhum texto é
normalizado, omitido ou truncado para gerar um arquivo parcial; nenhum limite do codec é elevado.

## Recursos, orçamento e limites

O backup tem orçamento lógico próprio de **128 MiB** (`BACKUP_BUDGET_BYTES`), independente dos
64 MiB do desfazer, que permanecem intactos. O charge é reservado **antes** de alocar e liberado em
`finally`; a falta de reserva recusa a operação antes de qualquer efeito.

- Leitura/parse: `3 × bytesDoArquivo + 128 × nós + 4096`.
- Preparação/snapshot/expectativa/clone: `2 × bytesCanônicosDasTarefas + 128 × nósConhecidos + 4096`.
- Bytes serializados mantidos em memória: `2 × bytesSerializados + 4096`.

Antes de `JSON.parse`, um scanner léxico limita profundidade a **64** e o total de nós a
**262 144** (cada chave, container e valor escalar conta), recusando com `RESOURCE_LIMIT` sem
parse/clone excessivo; o excesso não é confundido com arquivo inválido. O charge permanece
sobreposto (parse + preparação) somente quando os dois cabem juntos; a preparação publicada é a
única referência retida. O job nativo de backup é único e até **8 preparações** (uma por documento)
cabem no orçamento, sem truncamento e sem novo teto de codec.

Medições unitárias (fixtures fictícias v1–v4, `tests/fixtures/backups`): o arquivo v4 tem 2 497
bytes, 169 nós de scan e 4 tarefas (1 710 bytes canônicos, 155 nós conhecidos), resultando em
charge de parse de 33 219 bytes e de preparação de 27 356 bytes; as fixtures v1–v3 ficam entre
19 752 e 25 472 bytes de parse. Os testes verificam que a reserva libera em `release`, que a troca
de fase não conta duas vezes e que oito preparações independentes cabem no orçamento.

Medições do apply (script fora do repositório, runtime Node 24.21.0): um arquivo válido de
20 475 967 bytes (4 762 tarefas, 214 303 nós) foi codificado em ~99 ms, varrido em ~46 ms e
validado em ~74 ms; o charge de parse é 88 862 781 bytes e o de preparação 65 613 484 bytes — a
sobreposição das fases **não cabe** nos 128 MiB para esse formato específico (fase de preparação
recebe `RESOURCE_LIMIT` com dados intactos; composições com menos nós cabem). Limite+1 é recusado
por `FILE_TOO_LARGE`; profundidade 65 é recusada em <1 ms e ~280 mil nós em ~22 ms, ambos antes do
parse. O orçamento de 128 MiB aceita oito reservas de 16 MiB e recusa a nona, com liberação de
volta a zero. A restauração de 1 000 e 10 000 tarefas (com 100 entradas de lixeira preservadas)
levou ~9 ms e ~71 ms de unidade, com maior bloqueio síncrono de ~38 ms e ~274 ms respectivamente.
Heap/RSS são medidos separadamente e não são promessa de teto; os 64 MiB do undo e o lockfile não
foram alterados.

O charge é orçamento lógico, **não** garantia de heap: heap/RSS/pico/liberação são medidos
separadamente (ver evidência de produto). Um arquivo válido pode receber `RESOURCE_LIMIT` com os
dados intactos. O banco já mediu 23,9 MiB de payload em cenário anterior — isso não mede um arquivo
de backup; uma coleção legítima grande pode não caber nos 20 MiB e a exportação recusa (não trunca,
não normaliza). Ampliar 20 MiB ou 128 MiB exige números e provas de memória/bloqueio e revisão
coerente dos artefatos; nada é ampliado por conveniência e o lockfile não muda nesta Change.

## Evidência dos testes

`tests/application/backup-file.test.ts`, `backup-serializer.test.ts`, `backup-comparison.test.ts`,
`backup-scanner.test.ts` (recursos) e `backup-resources.test.ts` cobrem B01–B04 no núcleo portável:
fixtures v1–v4 com resultados canônicos, recusas integrais, projeção de desconhecidos, limites,
round-trip pelo próprio leitor e comparação campo a campo. As fixtures v1–v4 são cópias revisadas
das fixtures fictícias da origem (`taskflow-extension@a763e7a`).
