# Proposal

## Why

O TaskFlow App conserva lembretes importados, mas ainda bloqueia sua edição e as transições relacionadas; fechar a janela encerra o processo. A TFA-007 integrada permite entregar agendamento nativo e ciclo de vida explícito, preservando concorrência, backups e desfazer existentes.

## What Changes

- Editar até dez lembretes AT/OFFSET, com presets 0/15/60/1440, validações e precisão da origem; IDs novos, relógio e processamento continuam sob autoridade do main. Retirar D8 somente junto da integração funcional completa.
- Agendar no main a partir de estado persistido, com índice descartável e um timer, invalidações por tarefas afetadas e recuperação limitada. Todas as mutações/claims compartilham StorageCoordinator; marker durável antecede uma única tentativa de submissão externa.
- Aplicar a decisão humana de recuperar pendentes ativos em startup/reabertura e resume quando `triggerAt <= now <= triggerAt + 300000`; atraso maior é consumido sem aviso. Criação/edição/transição/restore/undo/importação continuam liquidando vencidos sem aviso retroativo.
- Integrar fechamento/geração atômicos, cancelamento, exclusão, reversão, recuperação validada e backups APPLIED/UNCHANGED/empty; claim não muda conteúdo/edição/auditoria, mas conflita com prévia por revisão global.
- Fechar para bandeja; minimizar conserva sessão e sair encerra. A decisão humana conserva draft/filtros somente em memória no close, retirando admissão IPC e transientes. Abrir cria sessão/snapshot novos, sem replay. Falha de tray conserva janela visível.
- Entregar Notification do main, identidade Windows por usuário e abertura da tarefa atual por tag limitada, inclusive ativação com processo encerrado. Explicar perda possível após claim, bloqueio pelo SO e limite de remoção após submissão, sem prometer entrega exatamente uma vez.
- Oferecer iniciar com usuário desligado por padrão, opt-in explícito e startup na bandeja. Registro próprio do Windows será a preferência durável versionada e fonte de verdade, fora do backup; nenhuma segunda configuração a sincronizar ou migração SQL será criada.
- **BREAKING:** create v4 e update v5 aceitam drafts fechados de lembretes; status v4/check v3/estado v3 permanecem. Cinco wrappers desktop v1 completam catálogo26; eventos desktop v1 suspendem/retomam e transportam intenção de localizar por tag, sem API livre de notificações.
- Comprovar M01–M12 por testes portáveis, SQLite/bridge no pacote fictício e roteiro separado no Windows instalado em conta padrão; conservar pendências herdadas e documentação factual.

## Capabilities

### New Capabilities

- `desktop-task-reminders`: configuração, elegibilidade, processamento durável, reconciliação, submissão Windows e localização segura da tarefa.
- `desktop-application-lifecycle`: janela/bandeja/sessões, saída, instância única, suspensão e inicialização opcional do usuário.

### Modified Capabilities

- `desktop-foundation`: catálogo26, identidades nativas isoladas e ownership com close para bandeja.
- `desktop-state-ipc`: drafts/versionamento, eventos desktop, suspensão real da admissão e resolução por snapshot.
- `desktop-task-management`: formulário de lembretes e remoção dos guards provisórios, comunicação/foco e prova do novo lifecycle.
- `local-task-persistence`: decisão temporal/claim e fronteira ordenada de submissão após liberação da transação.
- `desktop-task-recurrence`: OFFSET na geração, settlement atômico e integração real sem D8.
- `desktop-task-undo`: close invalida ofertas; reversão conserva marks e não reentrega vencidos.
- `desktop-task-backup`: reconciliação pós-restore incluindo UNCHANGED, mantendo liquidação sem replay.
- `windows-per-user-installation`: AUMID/CLSID/atalho e manutenção/remoção do registro de startup próprio.

## Impact

Domínio/aplicação de lembretes, tarefas/recorrência/storage, coordenador, main/lifecycle/notifier, contratos/preload/Vue, NSIS, testes/harness e documentação operacional/paridade. Base integrada `c7dcf845ba82a74e7027e764626decf6e0bfd82c`; branch `codex/tfa-008-migrar-lembretes-e-ciclo-de-vida-desktop`. Origem `a763e7a0d646c664ecd4f979528bc2c3589fa8c4`, somente leitura; recortes futuros revisados. Manter Electron44.5.1, SQL2, codec4, backupv1–v4 e dependências existentes.

Fora do escopo: serviço Windows, tarefa agendada, inicialização obrigatória, acordar PC, avisos com processo encerrado, retry/snooze/histórico, persistência de drafts/filtros, captura/Quick Add/atalhos009, IA010, assinatura/release/auto-update011, redesign ou correção conveniente de D10/a11y/energia herdados. Esta entrega não executa Setup, publica, implementa, arquiva nem aprova os artefatos.
