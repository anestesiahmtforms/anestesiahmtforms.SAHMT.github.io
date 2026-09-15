const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('apps/etiquetas/apps-script/Code.gs', 'utf8');
const start = source.indexOf('function getRequestUser_(payload) {');
const end = source.indexOf('function handleAiHealth_()', start);
assert.ok(start >= 0 && end > start, 'getRequestUser_ nao encontrado');
const functionSource = source.slice(start, end);

function execute(payload, responseOrError) {
  const calls = [];
  const context = {
    ETIQUETAS_AUTH_ENDPOINT: 'https://auth.example.test/exec',
    UrlFetchApp: {
      fetch: (url, options) => {
        calls.push({ url, options });
        if (responseOrError && responseOrError.throwOnFetch) throw new Error('network');
        return responseOrError;
      }
    }
  };
  context.diagnoseStage_ = (_stage, operation) => operation();
  vm.runInNewContext(functionSource, context);
  return { result: context.getRequestUser_(payload), calls };
}

const validResponse = {
  getResponseCode: () => 200,
  getHeaders: () => ({ 'Content-Type': 'application/json' }),
  getContentText: () => JSON.stringify({ ok: true, email: 'WX2064@GMAIL.COM', name: 'Francisco' })
};
const valid = execute({ authToken: 'token', deviceToken: 'device', userEmail: ' WX2064@GMAIL.COM ' }, validResponse);
assert.equal(JSON.stringify(valid.result), JSON.stringify({ email: 'wx2064@gmail.com', name: 'Francisco' }));
assert.equal(valid.calls[0].options.contentType, 'application/json; charset=utf-8');
assert.equal(JSON.parse(valid.calls[0].options.payload).userEmail, 'wx2064@gmail.com');
assert.throws(() => execute({}, validResponse), /Sessão autenticada ausente/);
assert.throws(() => execute({ deviceToken: 'device' }, {
  getResponseCode: () => 200,
  getHeaders: () => ({ 'Content-Type': 'text/html' }),
  getContentText: () => '<!DOCTYPE html><html>ServiceLogin</html>'
}), /página de login/);
assert.throws(() => execute({ deviceToken: 'device' }, {
  getResponseCode: () => 401,
  getHeaders: () => ({ 'Content-Type': 'application/json' }),
  getContentText: () => JSON.stringify({ ok: false, message: 'Sessão inválida.' })
}), /Sessão inválida/);
console.log('etiquetas auth-session tests: ok');

