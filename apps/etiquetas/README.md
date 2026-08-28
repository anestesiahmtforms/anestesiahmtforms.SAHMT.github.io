# ETIQUETAS SAHMT

PWA para smartphone Android/iOS para leitura de etiquetas SAHMT com IA.

## Leitura da etiqueta

O app nao usa mais OCR local. O botao `Ler com IA` envia a foto capturada ao Google Apps Script, que chama a OpenAI API com visao e retorna:

- `Nome do Paciente`: texto depois de `Nome:` e antes de `Pront:`.
- `Cirurgia`: numero abaixo do primeiro codigo de barras, na area inferior esquerda.
- `Atendimento`: numero abaixo do segundo codigo de barras, na area inferior direita.

Exemplo na etiqueta de referencia:

```text
Nome do Paciente: Celio Cardoso
Cirurgia: 109231
Atendimento: 7525561
```

## Campos do app

- `Data`, preenchida automaticamente com a data atual e editavel para dias anteriores.
- `Nome do Paciente`, preenchido pela IA e editavel.
- `Cirurgia`, preenchida pela IA e editavel.
- `Atendimento`, preenchido pela IA e editavel.
- `Tipo`: `Particular`, `Complementação`, `Unimed`, `Outros`.
- `Credor`: `Caixa`, `Plantão`, `Plantão/Caixa`.
- `Plantonista(s)`: caixa de selecao multipla. Quando `Credor` for `Caixa`, o campo fica desativado.
Antes do envio, o app mostra uma confirmacao para conferencia dos dados.

## Busca e edicao de registros

O app nao tem mais a caixa separada `Observacoes de Registros lancados`. As correcoes posteriores agora acontecem pelo `Resumo do dia`:

1. Use `Escolher outro dia` para listar uma data especifica, ou `Buscar registro` para pesquisar em qualquer periodo.
2. Toque duas vezes no registro desejado.
3. Corrija os campos no painel `Editar registro`.
4. Toque em `Salvar edicao`.

O app mantem quem fez o primeiro lancamento e grava tambem quem fez a ultima edicao.

## Acesso

O acesso do usuario acontece uma unica vez na autenticacao Google da pagina principal SAHMT. Depois que o ETIQUETAS e aberto por essa pagina, o app usa a mesma sessao no cliente.

O `apps-script/Code.gs` nao repete a autenticacao antiga do app separado. O Web App do ETIQUETAS deve ser implantado com acesso que permita as chamadas do PWA; a protecao de entrada permanece na pagina principal.

As colunas de responsavel usam o `userEmail` enviado pela sessao da pagina principal. Chamadas diretas sem esse campo usam `autenticacao-pagina-principal`.

Client ID configurado no PWA:

```text
908976987584-o59p0obmvq013lg3t9726itf06e15v2c.apps.googleusercontent.com
```

## Planilha Google

Planilha de destino:

- Link: https://docs.google.com/spreadsheets/d/1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY/edit

O Apps Script em `apps-script/Code.gs` cria e ajusta automaticamente:

- aba `ETIQUETA`
- aba `Listas`
- cabecalhos
- listas de validacao para `Tipo` e `Credor`
- endpoint de leitura com IA
- endpoint de envio
- endpoint de resumo por data e por mes

Cabecalho esperado da aba `ETIQUETA`:

```text
Data | Nome do Paciente | Cirurgia | Atendimento | Tipo | Credor | Plantonista(s) | Observacoes | Criado em | Criado por | Observacao atualizada em | Observacao atualizada por
```

A coluna `Data` deve aparecer no padrao `dd/mm/aaaa`. As colunas `Criado em` e `Observacao atualizada em` usam `dd/mm/aaaa hh:mm:ss`.

Quando houver outro lancamento exatamente igual na mesma data, o app alerta antes do envio e exige justificativa. A justificativa fica registrada em `Observacoes`.

## Como ativar a IA

1. Abra a planilha nova.
2. Va em `Extensoes > Apps Script`.
3. Cole o conteudo de `apps-script/Code.gs`.
4. Em `Configuracoes do projeto > Propriedades do script`, crie a propriedade `OPENAI_API_KEY` com sua chave da OpenAI API.
5. Salve.
6. Execute a funcao `setup` uma vez para preparar as abas e autorizar o script.
7. Va em `Implantar > Nova implantacao`.
8. Escolha `Aplicativo da Web`.
9. Em `Executar como`, use `Voce`.
10. Em acesso, escolha uma opcao que permita o uso do app.
11. Copie a URL final `/exec`.
12. Copie a URL final `/exec` e substitua em `app.js`, no campo `defaultScriptUrl`.

```text
defaultScriptUrl: "https://script.google.com/macros/s/AKfycby5MJA1ARXHRPOsl_Qwol1pmQ2eqG4xVMseza9VVDvhqqDOEa4yqI2xU9NCRHQTCJHC1Q/exec"
```

Nao reutilize URLs antigas que retornem as listas `Caixa TOTAL`, `50%:Caixa/Plantao:50%` ou `Plantao TOTAL`.

## Publicacao no GitHub Pages

Envie estes arquivos para a raiz do repositorio:

- `index.html`
- `app.js`
- `styles.css`
- `sw.js`
- `manifest.webmanifest`
- `apps-script/Code.gs`
- `.github/workflows/deploy-pages.yml`
- `.gitignore`
- `.nojekyll`

Depois de subir na branch `main`, o GitHub Actions incluido pode publicar o site no GitHub Pages.
