import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../apps/etiquetas/apps-script/Code.gs', import.meta.url), 'utf8');
const secret = 'PRIVATE-TOKEN-PATIENT-IMAGE-KEY';
function run(action, mode) {
  const logs = [];
  const context = vm.createContext({
    console: { log: line => logs.push(JSON.parse(line)) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    UrlFetchApp: { fetch(url) {
      const auth = url.includes('script.google.com');
      if (!auth && mode === 'network') throw new Error(secret);
      const status = !auth && mode === 'http' ? 429 : 200;
      const body = auth ? (mode === 'auth-html' ? '<html>' + secret : JSON.stringify({ ok: true, email: 'test@example.test' }))
        : mode === 'bad-json' ? secret : JSON.stringify({ output_text: secret });
      return { getResponseCode: () => status, getHeaders: () => ({}), getContentText: () => body };
    } }
  });
  vm.runInContext(source, context);
  const response = context.doPost({ parameter: {}, postData: { contents: JSON.stringify({ action, deviceToken: secret, userEmail: 'test@example.test', imageDataUrl: 'data:image/png;base64,AAAA' }) } });
  assert.ok(logs.length);
  assert.ok(!JSON.stringify(logs).includes(secret));
  assert.ok(!JSON.stringify(logs).includes('test@example.test'));
  for (const row of logs) assert.ok(Object.keys(row).every(k => ['service','diagnosticVersion','stage','state','elapsedMs','httpStatus'].includes(k)));
  return { logs, result: JSON.parse(response.text) };
}
test('authentication HTML logs parsing failure and prevents AI', () => {
  const { logs, result } = run('aiHealth', 'auth-html');
  assert.equal(result.ok, false);
  assert.ok(logs.some(r => r.stage === 'auth.parse' && r.state === 'failed'));
  assert.ok(!logs.some(r => r.stage.startsWith('ai.')));
});
for (const action of ['aiHealth', 'aiExtract']) {
  const stage = action === 'aiHealth' ? 'ai.health' : 'ai.extract';
  for (const mode of ['network','http','bad-json']) test(action + ' diagnoses ' + mode, () => {
    const { logs, result } = run(action, mode);
    assert.equal(result.ok, false);
    assert.ok(logs.some(r => r.stage === stage && r.state === 'failed'));
    if (mode === 'http') assert.ok(logs.some(r => r.httpStatus === 429 && r.state === 'http_error'));
    if (mode === 'bad-json') assert.ok(logs.some(r => r.stage === stage + '.parse' && r.state === 'failed'));
  });
}
test('successful health logs completion without response contents', () => {
  const { logs, result } = run('aiHealth', 'success');
  assert.equal(result.ok, true);
  assert.ok(logs.some(r => r.stage === 'ai.health' && r.state === 'completed'));
});
