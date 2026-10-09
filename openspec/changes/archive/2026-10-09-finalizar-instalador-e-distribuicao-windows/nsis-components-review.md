# Revisão dos componentes incorporados ao instalador

Atualizado em2026-10-08 (continuação). Task4.2 permanece aberta apenas para a decisão
humana sobre o SpiderBanner: a procedência dos seis plug-ins foi concluída nesta
atualização (DLLs x86-unicode incorporadas comparadas byte a byte com os pacotes
oficiais dos autores) e os textos publicados foram incorporados ao recurso do pacote.
Os notices Vue/Pinia/transitivas e Electron/Chromium/Node/SQLite já são inventariados
no payload. Este registro não estende a licença de um componente aos demais nem
declara prontidão para distribuição.

## Componentes usados, distintos de exports disponíveis

Trace real de compilação e macro de parâmetros fixada identificam estas DLLs x86
incorporadas pelo builder26.17.0/NSIS3.0.4.1/resources3.4.1:

| Componente | SHA-256 dos bytes usados | Estado da revisão (2026-10-08) |
| --- | --- | --- |
| SpiderBanner | 996a259e53ca18b89ec36d038c40148957c978c0fd600a268497d4c92f882a93 | Byte a byte igual a `Plugins/x86-unicode/SpiderBanner.dll` do pacote oficial `SpiderBanner_plugin.zip` (zip45c79a02…). Autoria/copyright "Created by Jason Ross aka JasonFriday13" e "2006-2007, 2010-2011, 2013-2014, 2016 MouseHelmet Software" presentes nos fontes/docs; **nenhum texto de licença publicado** no pacote nem na página do autor (fórum oficial responde403, sem bypass). Limitação explícita no notice; licença não inferida. |
| StdUtils | b72e9013a6204e9f01076dc38dabbf30870d44dfc66962adbf73619d4331601e | DLL1.1.4.0; LGPL2.1 e esclarecimento do autor incorporados no notice. |
| System | 3eb38ae99653a7dbc724132ee240f6e5c4af4bfe7c01d31d23faf373f9f2eaca | Plug-in da distribuição NSIS fixada; COPYING incorporado no notice. |
| WinShell | 9be85b986ea66a6997dde658abe82b3147ed2a1a3dcb784bb5176f41d22815a6 | Byte a byte igual a `Plugins/x86-unicode/WinShell.dll` do pacote oficial `WinShell.zip` 20121005 (zip34e111f8…). Página do autor declara "License: Freeware"; nenhum texto adicional publicado no pacote. |
| nsExec | 5d9ceb1ce5f35aea5f9e5a0c0edeeec04dfefe0c77890c80c70e98209b58b962 | Plug-in da distribuição NSIS fixada; COPYING incorporado no notice. |
| nsisunz | c31b590cba443de87f0f4a81712f0883ac3b506f3868759d918d9a81f84ea922 | Byte a byte igual a `Plugin unicode/nsisunz.dll` do pacote oficial `NSISunzU.zip`, build Unicode de Gringoloco sobre o nsisunz de Saivert (zip8c2b7ad6…; DLL versão1.0). Texto integral da licença e créditos incorporados no notice, verificado idêntico ao readme oficial. |

O relatório real e a ordem das guardas estão em
[nsis-build-inspection.md](nsis-build-inspection.md); plugins apenas listados pelo
compilador não são tratados como incorporados. StdUtils reduz a verbosity e tem
evidência própria da macro de parâmetros pinada.

## Pacotes oficiais consultados em2026-10-08

Downloads oficiais concluídos sem bypass nesta continuação (as consultas anteriores
haviam encontrado bloqueio). SHA-256 dos pacotes consultados:
`SpiderBanner_plugin.zip` 45c79a024e5122834a3473a87649757bc11958a11602a3ce2d9f7ce006f0e2b7;
`WinShell.zip` 34e111f8aacf64c540d848fd06b9d6f3e2c10cb825ec9329a01d1141973e749b;
`NSISunzU.zip` 8c2b7ad6984e3137e4c51c763ec64cbd36364e72838b85e14fa287dac976c46b.
Textos consultados adicionais: `Docs/SpiderBanner/SpiderBanner.txt`
3dad83e5e71427f9e46d54a915a6289413f82ff0c23e60f14bf0a14fdb348f4b e
`Contrib/SpiderBanner/SpiderBanner.c`
536e72e2c9da7a793c58108bc410f4622e9714c504ebe0aac27df97b5a2bea27. Cópias locais
ignoradas em .tmp/tfa011-tests/license-sources; nenhum conteúdo baixado foi executado.

## Notices incorporados, inventário e manifesto

`build/nsis/THIRD-PARTY-NOTICES.txt` (SHA-256
dc9ef68eee69aae1d40f8bf5673a8c268c29ceeea7beee57ca5815d4de00b128) documenta
procedência, termos publicados e a limitação do SpiderBanner; é entregue como
`resources/NSIS-THIRD-PARTY-NOTICES.txt` e ligado ao inventário/verify. O preview25
continua com o recurso anterior (SHA-256 9cdcdfa8…), preservado como histórico:
o par final limpo deve ser construído com o recurso atualizado após autorização.
Inventário/verify exigem presença e bytes iguais ao recurso revisado; as negativas
de ausência/divergência permanecem. Cláusula da licença nsisunz verificada idêntica
ao readme oficial linha a linha (incluindo "alter it and redistribute").

## Fontes primárias e limites

- [NSIS COPYING do conjunto fixado](https://github.com/electron-userland/electron-builder-binaries/blob/nsis-resources-3.4.1/nsis/COPYING): core/plugins internos conforme suas exceções; não autoriza presumir a licença de plugins externos.
- [Templates electron-builder MIT](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.17.0/LICENSE): referência da adaptação, independente das DLLs.
- [StdUtils LGPL](https://github.com/lordmulder/stdutils/blob/master/LGPL.txt) e [esclarecimento do autor](https://github.com/lordmulder/stdutils/blob/master/LGPL_CLARIFICATION.txt): uso da DLL não modificada por sua interface de plugin; não é certificação jurídica desta entrega.
- [SpiderBanner, página do autor](https://nsis.sourceforge.io/SpiderBanner_plug-in): identifica JasonFriday13; pacote oficial obtido e conferido; a página não contém termos de licença.
- [WinShell, página do autor](https://nsis.sourceforge.io/WinShell_plug-in): Anders, versão20121005, "License: Freeware"; pacote oficial obtido e conferido.
- [nsisunz, página do componente](https://nsis.sourceforge.io/Nsisunz_plug-in): texto zlib e créditos próprios; pacote Unicode oficial obtido e conferido.

## Decisão registrada — 4.2 concluída (2026-10-08)

O usuário aceitou explicitamente a limitação documentada — resposta **“Aceita a
limitação documentada”** no chat desta continuação — e a task4.2 foi marcada como
concluída. Fundamentos: procedência dos seis plug-ins comprovada byte a byte contra
os pacotes oficiais; nsisunz com licença integral incorporada; WinShell com
declaração “Freeware” do autor; SpiderBanner sem licença publicada, com a limitação
explícita no notice entregue. Nenhuma licença foi inferida; nenhuma integração/UI
foi removida; sem upload ou distribuição autorizados (R7 local). O recurso revisado
deve ser incorporado pelo próximo pacote (par final).
