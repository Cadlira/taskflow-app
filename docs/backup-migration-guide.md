# Backup e migração manual das atividades (TFA-007)

Guia operacional do percurso **exportar na extensão inalterada → guardar o original → selecionar,
revisar e confirmar no aplicativo → conferir**, com as fases, decisões e limitações verificadas no
apply. O formato do arquivo e o orçamento de recursos estão em [backup-format.md](backup-format.md).

## Percurso manual

1. **Na extensão (inalterada):** abra o recurso existente de backup e exporte o JSON das tarefas.
   Nada é movido ou excluído; a extensão continua sendo a fonte dos dados até a conferência.
2. **Guarde o arquivo original** (e mantenha os dados da extensão) até conferir a importação.
3. **No aplicativo:** entre em **Backup** (botão no cabeçalho ou no estado vazio) e use
   **Exportar tarefas atuais** se quiser um backup preventivo opcional; ele não confirma a
   importação, não renova a prévia e não limpa ofertas de outras janelas.
4. **Selecionar backup…** abre o diálogo nativo, lê e valida o arquivo no main e publica a **prévia
   imutável**: versão original (v1–v4) e normalizada (v4), data de exportação, aplicativo de
   origem, contagem do arquivo e das tarefas locais, e prazo de 5 minutos.
5. **Revisar:** a prévia explica a substituição total irreversível, a preservação da lixeira atual
   e a ausência de lixeira, credenciais/configuração de IA e desfazer no arquivo. Um arquivo sem
   tarefas avisa que todas as tarefas ativas serão removidas.
6. **Confirmar** no diálogo irreversível; Escape ou “Voltar à prévia” abandona o modal sem enviar a
   confirmação e mantém a prévia/token. A confirmação usa exatamente a base apresentada: qualquer
   mudança em tarefas, lixeira ou claim interno exige nova prévia.
7. **Conferir** as tarefas no aplicativo (campos, recorrências, subtarefas, lembretes) e, se
   necessário, exportar de novo pelo aplicativo e reimportar como nova decisão explícita.

## Decisão, fases e falhas

| Fase | Resultado e conduta |
| --- | --- |
| Cancelar seleção (abrir/salvar) | Neutro: nada é gravado/alterado; nenhuma oferta de outra sessão é invalidada. |
| Arquivo excessivo/inválido/futuro/encoding | Recusa integral antes de qualquer efeito; dados e lixeira intactos. |
| Dado histórico não exportável | `LOCAL_DATA_NOT_EXPORTABLE`: nada é exportado, normalizado ou omitido; os dados permanecem. |
| Conflito de portadora | `SERIES_CONFLICT` quando há mais de uma portadora da mesma série entre as tarefas importadas e **toda** a lixeira preservada, qualquer status; sem expurgo, reparação ou retirada de regra. |
| Base mudou depois da prévia | `BACKUP_BASE_CHANGED`; nada é escrito e uma nova prévia é exigida, mesmo com contagens iguais. |
| Prévia expirada/cancelada/trocada | `BACKUP_PREVIEW_EXPIRED`/`BACKUP_PREVIEW_INVALID`; a preparação anterior é liberada. |
| Divergência na conferência pré-commit | `BACKUP_VERIFICATION_FAILED` (commitState `NOT_APPLIED`): rollback integral da unidade. |
| Commit confirmado, conferência pendente | Sucesso durável com `verification: PENDING`; o commit não é anunciado como rollback e o estado exige reopen/contenção. |
| Commit/rollback incerto ou resposta perdida | `commitState: UNKNOWN`; a conexão é bloqueada até reopen validado, a época avança para uma barreira conservadora e o token **não** é reconstruído nem repetido. |

A substituição troca **somente tarefas** numa única unidade (CAS global), preservando lixeira,
configurações, IDs, timestamps e ordens do arquivo. Tarefas removidas não vão para a lixeira e a
importação **não oferece desfazer**. A verificação compara conjuntos exatos por ID e todos os
campos/opcionais/listas (inclusive `seriesId`/`recurrence` e `subtask id/title/done/ordem`); a
metadata SQL (revisões) é conferida separadamente, dentro da mesma unidade, antes do COMMIT.

Somente lembretes **pendentes com gatilho ≤ agora** são liquidados (`processedFor`), sem alterar
timestamps, status, âncoras ou marcações futuras e sem agendar/notificar nada durante a importação.
A partir da TFA-008, scheduler/notificações/bandeja compostos recompõem a projeção após
APPLIED/UNCHANGED/empty sem replay pela graça; evidência instalada segue pendente
([guia desktop](desktop-reminders-and-lifecycle.md)).

## Gravação do arquivo exportado

A exportação captura o snapshot **depois** do diálogo de salvar, grava em um temporário exclusivo
no mesmo diretório (`wx`), escreve os bytes completos, sincroniza, fecha e faz **uma única**
substituição. O destino nunca é truncado ou removido antes; não há fallback copy-delete. Depois da
substituição, a releitura exata de bytes confirma o arquivo ou produz `SAVED_WITH_WARNING` (falha
posterior não volta a gravar nem restaura o arquivo anterior). Um fingerprint do destino é
capturado depois da escolha e conferido antes da substituição; mudança observável recebe
`DESTINATION_CHANGED` sem sobrescrever.

**Janela residual e energia:** o fingerprint não é um lock/CAS contra terceiros — existe uma janela
residual entre a última conferência e a substituição. Energia não é comprovada: queda de energia,
flush físico e semântica de `rename` no dispositivo real não são certificados por estes testes, e
kill/rename não valem como prova de durabilidade sob falta de energia (mesma distinção do SQLite,
documentada na TFA-003).

## Roteiro manual nativo (evidência separada)

Os testes e o harness usam uma **escolha stub** de arquivo determinística, que nunca é apresentada
como diálogo nativo. A evidência nativa do Windows é um roteiro humano separado, a executar no
pacote empacotado, com evidência sanitizada (sem dados reais):

1. Abrir o app empacotado pelo atalho/executável e entrar em Backup.
2. **Exportar**: confirmar o diálogo nativo, salvar em um destino novo e em um destino existente
   (conferir a confirmação de sobrescrita), com nome e caminho contendo acentos/Unicode; repetir em
   uma pasta sincronizada ou unidade removível, se disponível.
3. **Cancelar** a seleção e o salvamento por teclado (Escape) e confirmar que nada foi gravado.
4. **Importar**: selecionar o arquivo pelo diálogo nativo, revisar a prévia e cancelar a prévia;
   repetir confirmando e conferir o resultado.
5. Registrar por cenário: fase, teclado/foco, resultado e estado do destino. Pendência ou bloqueio
   (por exemplo, política do Windows) é registrada como tal, sem contornar e sem chamar o stub de
   prova nativa.

### Roteiro humano de acessibilidade da área

A verificação humana de acessibilidade permanece pendente e separada (não é substituída por
testes de componente):

- Navegar por teclado: entrar, exportar, selecionar, cancelar, revisar, abrir/abandonar o modal e
  voltar; conferir foco em título → seletor → alerta → ação principal → Voltar e a ausência de foco
  no `body`.
- Janela mínima, zoom 200%, escala do Windows e DPI alto: rótulos/ações acessíveis com rolagem e
  sem sobreposição; contraste ≥ 4,5:1 e foco ≥ 3:1.
- Leitor de tela: anúncios de loading/prévia/restauração/exportação/sucesso/erro e a descrição da
  irreversibilidade.

## Exclusões explícitas

Este percurso **não** inclui: mesclagem de backups, extração do perfil/storage do Chrome, alteração
da extensão, importação de SQLite, lixeira dentro do arquivo, credenciais/configuração de IA,
desfazer temporário ou histórico persistente, undo de importação, sincronização/nuvem, criptografia
nova, scheduler/notificações/bandeja (compostos pela TFA-008), captura/atalhos/IA, redesign,
recuperação de banco que não abre (reset/“conserto” de SQLite), instalação corporativa, release ou
publicação. O JSON não é criptografado e pode conter dados pessoais das próprias tarefas;
erros/registros não reproduzem conteúdo, títulos, caminhos ou tokens.
