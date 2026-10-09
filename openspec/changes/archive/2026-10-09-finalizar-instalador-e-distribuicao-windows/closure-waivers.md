# Dispensas para fechamento — TFA-011

Data: **2026-10-09**. Mensagem humana: **“Já fiz alguns testes em off. Então acho que
pode aprovar, arquivar, commitar, fazer o push e abrir o PR”**, após a proposta de
fechamento apresentada (relatório + dispensas específicas). O usuário relatou ter
executado testes adicionais fora da sessão; nenhum detalhe foi registrado nesta Change.

## Escopo dispensado (não é PASS)

As parcelas não comprovadas das 13 tasks abertas ficam dispensadas para este
fechamento, conforme [verification.md](verification.md):

- **2.1 / 7.2**: Known Folder redirecionado/divergente, HKLM e reparse instalado sem
  simulação segura (exigem alteração de sistema/admin, não autorizada). Cobertura
  estrutural e HKCU simulado permanecem.
- **2.2 / 7.3**: commit/job de arquivo/IA em voo/relay COM, consulta incerta/timeout e
  reabertura entre fases; executado: app visível, bandeja, duas superfícies, `/S`,
  Sair, uninstaller direto `_?=`, predecessor `_?=`, concorrência.
- **2.3**: mudança de ownership ACL e registro CLSID/COM prod (prod não aberto por
  regra); executado: own/ausente/futuro/estrangeiro.
- **2.4**: corrida durante a remoção do predecessor seguro; executado: compatível
  aceito com pin, unpinned recusado131 preservado, propagação direta111/129.
- **2.5 / 7.8**: injeções instaladas de falha (ACL/espaço/extração/registro/
  interrupção); executado: concorrência e cobertura de fault-points em testes/fixtures.
- **7.1**: destino offline sem Node/npm e perfil com espaços/Unicode (ambiente não
  disponível; segunda conta excluída por decisão humana); executado: instalação
  limpa, bytes/manifests, efeitos do usuário e ACE.
- **7.4**: fixtures lógicas instaladas (perfil test vazio; semear proibido) e IA
  protegida pós-manutenção; executado: upgrade/reparo, retenção byte a byte, startup
  ON/OFF e desativação externa.
- **7.5**: gestos nativos (tray/Quick Add/cópia com foco/toast/COM) e logoff real;
  executado: segundo lançamento, startup e guardas; usuário relatou testes off-session.
- **7.6**: prova visual claro/escuro × DPI; executado: ícones/inventário/payload
  instalado; usuário relatou testes off-session.
- **7.7**: credencial fictícia instalada/DPAPI pós-manutenção e segunda conta
  (excluída por decisão humana); executado: uninstall normal e `/S`, reinstall,
  retenção e startup OFF.

## Limites

A dispensa não é PASS, não comprova comportamento e não autoriza distribuição. Os
itens de ambiente/homologação seguem para a **TFA-012**; a pergunta antiga sobre
`/S /allusers` permanece não executada e não integra estas dispensas. Archive, commit,
push e PR foram autorizados na mensagem acima; merge/distribuição/próxima Change
continuam não autorizados.
