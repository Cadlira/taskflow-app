# Domínio de recorrência e subtarefas

**Estado:** implementado no apply da TFA-005 (2026-10-04). Este documento descreve as regras puras
do domínio portável do aplicativo; a fronteira IPC, o armazenamento e a interface são descritos
nos documentos das respectivas áreas.

Origem consultada somente para leitura no HEAD `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`
(licença MIT, mesmo titular). A cópia é revisada linha a linha e mantém o comportamento observado,
com adaptações de TypeScript estrito e com erros tipados no lugar de `undefined`/exceção.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `src/domain/task-recurrence.ts` | Tipos/validação da regra, avanço civil local, cálculo da próxima ocorrência com resultado finito e construção pura da próxima ocorrência. |
| `src/domain/task-subtasks.ts` | Limites, resolução de drafts id/título, marcação por intenção, progresso derivado e cópia desmarcada. |
| `src/domain/task-draft.ts` | Draft/patch completos: básicos + regra + subtarefas, âncora e limite combinados. |
| `src/domain/identity.ts` | Alocação de identidades com até três tentativas por identidade por plano. |

Nada aqui importa Vue, Pinia, Electron, Chrome ou `node:*`; o domínio é portável e síncrono.

## Regras e limites

- **DAILY** aceita `intervalDays` inteiro de 1 a 365; **WEEKLY** aceita de 1 a 7 dias distintos de
  0 (domingo) a 6 (sábado); **MONTHLY** aceita `dayOfMonth` inteiro de 1 a 31. Não há frações,
  enums novos ou parâmetros de outra frequência.
- Recorrência exige prazo representável. `until` é opcional e inclusivo: igual ao prazo é válido;
  anterior é recusado (`UNTIL_BEFORE_DUE`). A comparação é contra o **prazo combinado** (valor
  atual + patch), nunca contra a âncora.
- Lembrete absoluto (`AT`) é incompatível com adicionar/alterar regra; o lembrete não é removido e
  a falha é de validação (`ABSOLUTE_REMINDER_INCOMPATIBLE`).

## Cálculo civil local

- A base é `anchorAt ?? dueAt`; o cálculo avança **pelo menos um passo** e continua até um instante
  **estritamente maior** que o relógio atual. Concluir antes do prazo ainda avança; candidato igual
  a `now` é pulado; períodos perdidos não viram backlog (uma única ocorrência futura).
- Avanço no calendário local do SO (relógio do main): DAILY soma dias civis; WEEKLY procura o
  próximo dia da fase a partir da base, sem reiniciar a semana; MONTHLY calcula o dia pedido em
  cada mês, reduzindo ao último dia apenas naquele mês, sem tornar o ajuste permanente
  (31/01 → 28 ou 29/02 → 31/03).
- Gaps de DST alcançados pelo cálculo usam a normalização civil do runtime e o resultado passa a
  ser a base seguinte (`07/03 02:30 → 08/03 03:30 → 09/03 03:30` em `America/New_York`); entradas
  manuais com gap continuam recusadas no formulário. Intervalos reais podem ter 23 h/25 h; hora
  repetida escolhe a ocorrência da conversão local, sem segunda ocorrência automática.
- Datas não editadas conservam texto ISO, segundos e milissegundos; uma alteração explícita
  normaliza o novo instante em ISO. O fuso da série não é persistido: a próxima decisão usa o fuso
  corrente do SO.
- `until` igual ao candidato gera; candidato posterior encerra naturalmente a série sem gerar.

## Resultado finito e limites de recurso

`resolveNextScheduledAt` devolve união fechada:

| Resultado | Significado |
| --- | --- |
| `NEXT` | Instante calculado (ISO) estritamente posterior ao relógio, dentro do `until`. |
| `EXHAUSTED` | Primeiro candidato válido posterior ao `until`: fim natural da série. |
| `OUT_OF_RANGE` | Base/candidato/`until` não representável ou avanço não positivo. |
| `RESOURCE_LIMIT` | A decisão exigiria mais de **32.768 passos**. |

Cada passo verifica instante representável/finito e avanço estritamente positivo **antes** de
converter para ISO. Erro de representabilidade ou excesso de passos **nunca** vira fim natural:
toda mutação é recusada conservando status, regra, dados e revisões. Mensal não é otimizado por
saltos aritméticos nem por milissegundos — isso mudaria DST/fase.

## Âncora, identidade e edição

- Regra omitida no patch **conserva** a regra e a âncora atuais; `null` **retira** a regra
  conservando status e `seriesId`; objeto valida frequência/parâmetros exatos.
- `until` omitido conserva o limite existente, `null` o retira e string o altera.
- Ao mudar prazo ou regra de portadora existente, a âncora é a antiga `anchorAt ?? dueAt`: ela
  permanece enquanto divergir do novo prazo e desaparece ao retornar ao mesmo texto ISO. Isso vale
  também quando regra e prazo mudam juntos. Regra nova sem regra anterior não recebe âncora e mantém
  `seriesId` histórico, quando existir.
- `seriesId` e `anchorAt` nunca são entradas do cliente: vêm da autoridade (main), com no máximo
  três tentativas por identidade.

## Criação, fechamento e próxima ocorrência

- Criação (mesmo terminal, DONE/CANCELLED) **somente cria** e não gera imediatamente.
- Edição efetiva que resulte em terminal com regra é fechamento: DONE/SKIP transferem a regra para
  **no máximo uma** próxima TODO; END fecha sem gerar; sem candidato (fim natural) a fechada perde
  a regra e nenhum `seriesId` novo é inventado. O fechamento remove a regra da anterior conservando
  o `seriesId` e grava anterior + gerada no mesmo commit.
- Reabrir uma ocorrência fechada vai para TODO conservando a série, **sem** recuperar a regra e
  **sem** gerar nova ocorrência.
- A próxima ocorrência copia título/descrição/pessoas/prioridade/tags/origem, recebe auditoria
  nova, prazo calculado, mesma série, campos/parâmetros/`until` da regra **sem** âncora antiga e
  **sem** `completedAt`. Subtarefas conservam títulos e ordem com IDs novos e `done=false`;
  lembretes OFFSET são copiados com IDs novos e **sem** `processedFor`.
- Gerador colidente resulta em `IDENTITY_CONFLICT` com rollback — nunca substituição de outra
  tarefa, item ou série.

## Subtarefas

- Até 20 itens, um nível, sem status/prazo/lembrete/filhos próprios. Título novo/renomeado usa
  trim 1–200; título exatamente igual ao atual permanece intacto (sem limite retroativo).
- Criação envia somente títulos; edição envia `{id?, title}` na ordem desejada, sem `done`.
  Ausente conserva a lista; `[]` limpa. Item com ID precisa existir na tarefa atual; IDs vazios,
  repetidos ou desconhecidos são erros posicionais, e item removido não ressuscita.
- Item com ID conserva a marcação atual; item sem ID recebe identidade nova (desmarcado). IDs iguais
  em tarefas distintas não são colisão de domínio.
- Marcação por intenção (`setSubtaskDone`) altera somente `done`/`updatedAt` da tarefa, opera em
  qualquer status e nunca fecha/gera ocorrência nem altera status, `completedAt`, prazo, regra ou
  lembretes. Valor já satisfeito é no-op; item ausente devolve `SUBTASK_NOT_FOUND`.
- Progresso é derivado (`done/total`) e nunca persistido; concluir/reabrir a tarefa não limpa
  marcações. Só a próxima ocorrência reinicia os passos.

## Operações futuras permanecem fora do domínio

Lembretes funcionais (settlement/reconciliação), desfazer com histórico, lixeira funcional e novas
frequências **não** são implementados por estes arquivos. Os contratos de próxima com OFFSET e de
reversão por conteúdo completo existem apenas como funções puras verificáveis; nenhum serviço,
token, IPC, UI ou agendador é anunciado como disponível.
