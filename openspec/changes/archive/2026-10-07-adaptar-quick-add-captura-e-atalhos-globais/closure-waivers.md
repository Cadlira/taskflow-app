# Dispensas para fechamento — TFA-009

Data: **2026-10-07**. Mensagem humana: **“Pode pular essas validações. vamos fechar essa change”**. Decisão registrada após tentativa Q13 e preparação da campanha instalada/humana.

## Escopo dispensado

As validações Windows ainda pendentes das tasks **7.4 e 7.5** não serão exigidas para o fechamento solicitado: conclusão de Q13 nativo e confirmação por artefato da conta/pacote instalado, campanha offline/conta padrão/clipboard/foco, Q12 humano (teclado/IME/zoom/DPI/leitor de tela) e eventos reais de energia/logoff. A dispensa é do usuário nesta Change, não herdada da TFA-008.

Isso não prova comportamento nem muda os contratos do produto. **43/45 tasks executadas; duas dispensadas, com checkboxes de encerramento identificados DISPENSADA; não foram integralmente verificadas.** Não transformar dispensa em PASS, teste executado ou sucesso instalado.

## Evidência que permanece

- Q13 pelo agente: conflito real observado, falha `FOREGROUND_UNAVAILABLE` antes de F20, `runs:[]`, `ok:false`, `cleanup:true`; ASAR final identificado no relatório.
- Operador inicialmente informou `ok:true`, mas a saída enviada depois contém a tentativa falha e `WRONG_TEST_ACCOUNT` do teste de guard. Não há artefato novo de aprovação Q13.
- Operador informou instalação/abertura sem UAC/erro. Esse relato é conservado como informação humana; o helper não produziu `installed-evidence.json`, e a leitura do perfil da conta dedicada foi negada. Hash/conta/instalação corretos e H02–H12 não foram confirmados.
- Setup0.1.0 correto conferido/copiado para a pasta pública de teste; helper de instalação/roteiro preparados e guard de conta errada verificado antes de Setup. Preparação não é instalação. Nenhuma credencial ou política foi alterada.
- Validate/OpenSpec/package/verify:package/smoke/Q14 anteriores aprovados; nenhum erro novo no aplicativo foi encontrado nesta retomada. Lint adicional aprovado. Não há nova versão do pacote; o modo de foco manual apenas esboçado foi retirado sem execução após a dispensa.

## Limites do fechamento

O pedido autoriza o fechamento com essas dispensas. A aprovação explícita do relatório exigida pelo AGENTS.md42 foi recebida em2026-10-07, conforme mensagem registrada abaixo. Archive concluído; commit/push/PR autorizados. Merge/distribuição/próxima Change continuam não autorizados.

Após aprovação do relatório, arquivar com os sete deltas consolidados e atualizar README/documentação/roadmap. Registrar as duas tasks não concluídas como dispensadas na conclusão do archive; não exigir novamente testes já dispensados. Após archive/gates finais, criar commits coerentes, push da branch própria e PR; marcar READY_FOR_MERGE, preservando dispensas/evidências. Não marcar DONE antes da integração aprovada.

## Aprovação/autorização recebida — 2026-10-07

O usuário confirmou o fechamento após o relatório final: **“aprove o relatório, faça o archive, commit, faça o push e crie o PR”**. A aprovação/autorização expressa substitui o estado de espera anterior. Executar archive com consolidação e documentação atual, depois commit/push/PR; dispensas permanecem não verificadas. Nenhum merge/distribuição autorizado.
