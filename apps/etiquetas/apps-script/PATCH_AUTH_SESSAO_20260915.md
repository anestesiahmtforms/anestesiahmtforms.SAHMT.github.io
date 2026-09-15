# Correção preparada — autenticação do backend de Etiquetas

Data: 2026-09-15

## Situação confirmada

O backend separado de Etiquetas valida cada requisição em `getRequestUser_()` fazendo uma chamada `UrlFetchApp.fetch()` para o endpoint central de autenticação. No iPhone, o frontend está autenticado, mas o backend recebe do endpoint central uma resposta que não consegue converter para JSON e retorna `Não foi possível confirmar a sessão.`.

A versão atual de `main` permanece intacta. Há um branch de retorno criado antes desta preparação:

`backup/etiquetas-auth-before-direct-validation-20260915`

## Opção preferida — corrigir a implantação do autenticador central

Antes de alterar código de segurança, verificar no Google Apps Script do autenticador central a implantação que atende ao endpoint já configurado no PWA.

A implantação precisa permitir que chamadas servidor-servidor feitas por `UrlFetchApp` cheguem ao `doPost` sem uma página intermediária de login do Google. O controle de acesso continua sendo feito pelo próprio código, que exige `deviceToken + userEmail` ou credencial Google válida.

Se o deployment central estiver restrito a usuários autenticados no navegador, uma chamada feita pelo Apps Script de Etiquetas não leva os cookies do usuário e pode receber HTML/redirecionamento em vez do JSON esperado.

**Não criar uma URL nova.** Atualizar a implantação existente para preservar a URL usada pelo PWA e pelos módulos dependentes.

## Patch de diagnóstico seguro no servidor de Etiquetas

Caso seja necessário confirmar o problema antes de alterar a implantação central, substituir temporariamente apenas `getRequestUser_()` por esta versão. Ela não expõe tokens e mostra se o servidor central devolveu HTML, status HTTP inesperado ou JSON de erro.

```javascript
function getRequestUser_(payload) {
  const authToken = String(payload && payload.authToken || '');
  const deviceToken = String(payload && payload.deviceToken || '');
  const userEmail = String(payload && payload.userEmail || '').trim().toLowerCase();

  if (!authToken && !deviceToken) {
    throw new Error('Sessão autenticada ausente. Entre novamente pelo SAHMT.');
  }

  let response;
  try {
    response = UrlFetchApp.fetch(ETIQUETAS_AUTH_ENDPOINT, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      muteHttpExceptions: true,
      followRedirects: true,
      payload: JSON.stringify({
        action: 'auth',
        authToken,
        deviceToken,
        userEmail,
        moduleId: 'ETIQUETAS',
        pageId: 'api'
      })
    });
  } catch (error) {
    throw new Error('Falha de comunicação entre Etiquetas e a autenticação central.');
  }

  const status = response.getResponseCode();
  const contentType = String(response.getHeaders()['Content-Type'] || response.getHeaders()['content-type'] || '');
  const text = String(response.getContentText() || '').trim();

  let result;
  try {
    result = JSON.parse(text);
  } catch (error) {
    const looksHtml = /<!doctype|<html|accounts\.google\.com|ServiceLogin/i.test(text);
    if (looksHtml) {
      throw new Error('A autenticação central devolveu uma página de login/HTML ao servidor de Etiquetas. Revise o acesso da implantação do Web App central.');
    }
    throw new Error('A autenticação central respondeu em formato inválido (HTTP ' + status + ', ' + contentType + ').');
  }

  if (status !== 200 || result?.ok !== true || !result.email) {
    throw new Error(String(result?.message || 'Sessão não autorizada. Entre novamente pelo SAHMT.'));
  }

  return {
    email: String(result.email).trim().toLowerCase(),
    name: String(result.name || '')
  };
}
```

## Fallback de contingência — validação direta do dispositivo confiável

Somente se a implantação central não puder aceitar chamadas servidor-servidor, pode-se eliminar a chamada HTTP e validar diretamente a tabela de dispositivos confiáveis. **Este fallback não deve ser aplicado sem homologação**, porque a autenticação central também verifica a lista de e-mails autorizados; validar somente o dispositivo `ATIVO` reduz essa verificação a uma única fonte de autorização.

Dados atualmente documentados no projeto central:

- planilha de autenticação: `1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY`
- aba: `DISPOSITIVOS_CONFIAVEIS`
- colunas: Device Token, Email, Nome, Criado em, Último acesso em, Válido até, Status

Exemplo de fallback para homologação, não para publicação imediata:

```javascript
const CENTRAL_AUTH_SPREADSHEET_ID = '1uvnn00jJOiE2KweCQ6IEFm8xN4kuuBIBs6VVYorkOtY';
const CENTRAL_TRUSTED_DEVICES_SHEET = 'DISPOSITIVOS_CONFIAVEIS';

function getRequestUser_(payload) {
  const deviceToken = String(payload && payload.deviceToken || '').trim().toLowerCase();
  const userEmail = String(payload && payload.userEmail || '').trim().toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(deviceToken) || !userEmail) {
    throw new Error('Sessão por dispositivo ausente ou inválida. Entre novamente pelo SAHMT.');
  }

  const book = SpreadsheetApp.openById(CENTRAL_AUTH_SPREADSHEET_ID);
  const sheet = book.getSheetByName(CENTRAL_TRUSTED_DEVICES_SHEET);
  if (!sheet) throw new Error('Cadastro central de dispositivos indisponível.');

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    const savedToken = String(row[0] || '').trim().toLowerCase();
    const savedEmail = String(row[1] || '').trim().toLowerCase();
    if (savedToken !== deviceToken || savedEmail !== userEmail) continue;

    const status = String(row[6] || '').trim().toUpperCase();
    const expiresAt = row[5] instanceof Date ? row[5] : new Date(row[5]);
    if (status !== 'ATIVO') throw new Error('Dispositivo revogado. Solicite a liberação ao administrador.');
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new Error('Autorização do dispositivo expirada. Entre novamente pelo SAHMT.');
    }

    return { email: savedEmail, name: String(row[2] || '').trim() };
  }

  throw new Error('Dispositivo não reconhecido pela autenticação central. Entre novamente pelo SAHMT.');
}
```

## Ordem recomendada de implantação

1. Exportar/salvar a versão atualmente implantada do projeto Apps Script de Etiquetas.
2. Confirmar qual projeto atende à URL de autenticação central configurada no PWA.
3. Verificar as permissões da implantação central e, se possível, corrigir o acesso sem alterar a URL.
4. Se necessário, usar primeiro o patch de diagnóstico acima no projeto de Etiquetas.
5. Publicar como **nova versão da implantação existente**, preservando a URL `/exec`.
6. Testar `aiHealth` e depois `aiExtract` com uma etiqueta real.
7. Só após a leitura funcionar, testar relatório diário, mensal, busca e registro manual.

## Rollback

O frontend em `main` não foi alterado por esta preparação. O estado do repositório antes deste trabalho está preservado no branch:

`backup/etiquetas-auth-before-direct-validation-20260915`

Se uma implantação nova do Apps Script causar regressão, retornar a implantação para a versão anterior no próprio Google Apps Script.