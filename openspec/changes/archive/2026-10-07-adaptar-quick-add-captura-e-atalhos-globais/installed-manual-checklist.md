# Campanha instalada e humana — TFA-009

**Atualização final: o usuário dispensou as validações pendentes e pediu o fechamento em2026-10-07.** Este roteiro é referência histórica/operacional; não continuar sua execução como requisito desta Change. Os itens abaixo permanecem não verificados, dispensados conforme [closure-waivers.md](closure-waivers.md). Relato humano de instalação/abertura sem UAC/erro não foi confirmado por conta/hash/artefato; não inferir PASS dos estados PENDING.

Preparada em 2026-10-07 após autorização explícita do usuário para Setup e testes nesta máquina, na conta de testes, com dados fictícios. **Preparação não significa execução/aprovação.** Tasks7.4/7.5 continuam abertas até evidência integral; relatório ainda não aprovado. Sem archive ou ações de Git.

## Instalação na conta TFAProva2

O Setup atual é **0.1.0**, SHA-256 `6444365d0bada92c39ea15a9b3bef6b3a37061c3dca0b1c38206ef3fd75e55c7`. O 0.1.1 existente em release é histórico e não serve para esta campanha.

1. Entre na conta TFAProva2 usando a interface normal do Windows. Não envie senha no chat. Saia de qualquer TaskFlow dessa conta pelo menu **Sair**.
2. Abra PowerShell normalmente, sem administrador. Execute:

   ```powershell
   & 'C:\Users\Public\Downloads\TaskFlow-TFA009-20261007\installed-tfa009-validation.ps1'
   ```

3. O roteiro confere SID dedicado, token/grupo, pastas reais e ambiente, hash do Setup; instala `/S /currentuser`, compara exe/ASAR instalados, registro HKCU e atalho do usuário; abre o aplicativo normal, sem harness. Não apaga banco, não muda credenciais/política, não desinstala outra conta e não exige Node/npm.
4. Se a execução de scripts for bloqueada por política, registre o bloqueio. Não altere a política. O operador pode executar manualmente o Setup conferido na mesma pasta, normalmente e sem administrador; avise para que a inspeção de hashes/registro seja feita separadamente.
5. Resultado sanitizado: `C:\Users\Public\Downloads\TaskFlow-TFA009-20261007\results\installed-evidence.json`. Não conclui interface pronta, offline ou testes humanos; estes dependem dos passos abaixo. Reporte se houve UAC, erro ou tela em branco.

## Roteiro humano por etapas

Informe **PASS, FAIL ou BLOCKED** por item e o comportamento observado. Use apenas valores fictícios. Não mande screenshots com dados reais. Pare em falha e descreva-a; nenhuma exceção vira aprovação por ausência de evidência.

| ID | Ação | Resultado esperado | Estado inicial |
| --- | --- | --- | --- |
| H01 | Instalação normal e abertura pelo Menu Iniciar na conta padrão | Sem administrador/UAC; tela carregada, sem erro de preload | PENDING |
| H02 | Desconectar a rede pelo Windows; abrir/criar/editar tarefa `Prova TFA009 offline`; Sair/reabrir; depois reconectar | Gerenciamento e tarefa persistida funcionam offline | PENDING |
| H03 | Criar rascunho no manager; abrir Quick Add; fechar/reabrir cada janela pela bandeja; criar tarefa rápida | Manager conserva todos os campos; Quick Add limpa somente após criação confirmada; close individual não encerra a outra | PENDING |
| H04 | Configurar captura em combo disponível; sair da configuração; focar Bloco de Notas com texto fictício e usar atalhos de Quick Add/manager/captura | Registro/hint confirmado; destino global é Quick Add; abertura simples não lê clipboard; captura não salva | PENDING |
| H05 | Copiar `https://example.com/tfa009?prova=1`; Capturar; depois copiar texto fictício de várias linhas; editar/remover origem e revisar descrição | URL inteira em origem, título inicialmente vazio e obrigatório; texto mapeado/revisável; sem abrir URL ou salvar sozinho | PENDING |
| H06 | Manter formulário preenchido; capturar duas vezes; testar também lixeira/backup e voltar à lista | Oferta/substituição anunciadas; draft preservado; só Revisar aplica quando seguro; Descarta não salva | PENDING |
| H07 | Tab/Shift+Tab por Quick Add e configuração; Enter no título, Enter na descrição, Escape; entrada IME quando disponível | Ordem/foco visíveis; textarea quebra linha; composição IME não envia; Escape fecha conservando rascunho; erros focam campo correto | PENDING |
| H08 | Quick Add estreito (360px), zoom200 e escala/DPI do Windows disponível | Campos/avisos/ações acessíveis, sem corte ou rolagem horizontal impeditiva; rolagem vertical funciona | PENDING |
| H09 | Leitor de tela disponível (ex.: Narrador) em campos, erro, oferta e alteração de atalho | Nomes/rótulos, foco e alertas anunciados; estado busy/erro compreensível | PENDING |
| H10 | Trocar/remover/restaurar atalho; fechar configuração; Sair/reabrir; tentar combo em conflito confirmado | Preferências persistem, hints refletem registro; conflito não trava aplicativo; antigo combo deixa de agir após rebind; liberado após Sair | PENDING |
| H11 | Com duas janelas/drafts e tarefa fictícia com lembrete, suspender e retomar o Windows | Agenda reconcilia antes das ações; drafts preservados na instância viva; sem lembrete duplicado ou gesto antigo reproduzido | PENDING |
| H12 | Anotar resultados; fazer logoff da conta de testes e entrar novamente; abrir aplicativo | Saída segura; tarefas/atalhos persistidos; rascunhos não recuperados; lembretes seguem política documentada sem duplicação | PENDING |

Q13 automatizado exige campanha inteira, incluindo outro processo real/conflicto/rebind/restart/cleanup; os passos humanos não substituem sua evidência. A repetição iniciada pelo agente nesta sessão local desbloqueada voltou a falhar em `FOREGROUND_UNAVAILABLE` antes de F20, com `cleanup:true`. Há solicitação ao operador para repetir pelo PowerShell local em foco.

Após cada etapa, registrar evidência/limitações aqui e em verification.md/evidence; marcar tasks somente pelos sourcePath/line atuais da CLI quando todos os critérios correspondentes estiverem comprovados. O usuário pediu parar após relatório atualizado, sem archive/commit/push/PR.
