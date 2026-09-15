import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html = await fs.readFile('ui/templates/etiquetas.html', 'utf8');
const source = await fs.readFile('apps/etiquetas/app.js', 'utf8');
function setup(result) {
  const {document} = parseHTML(html);
  const storage = new Map();
  const requests = [];
  const noop = () => {};
  const context = vm.createContext({
    document, URL, URLSearchParams, Intl, Date,
    navigator: {userAgent: 'test'},
    window: {addEventListener: noop, setInterval: noop},
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value)},
    console: {warn: noop, error: noop},
    fetch: async (url, options) => {
      requests.push({url, body: JSON.parse(options.body)});
      return {ok: true, json: async () => result};
    },
  });
  vm.runInContext(source.replace('\nbootstrap();', '\n'), context);
  vm.runInContext(`
    state.imageBlob = {};
    state.auth = {email:'test@example.invalid', deviceToken:'test-device'};
    state.aiReady = false;
    state.aiHealth = {ok:false, message:'Temporary network failure'};
    prepareAiImageSet = async () => ({imageDataUrl:'data:image/png;base64,test', numericImageDataUrls:[]});
    stopCamera = () => {};
    applyDataToForm = () => {};
    showEntryPanel = () => {};
    syncPlantonistasRequirement = () => {};
  `, context);
  return {context, document, requests, storage};
}

test('labels can read after startup health failure and restore AI availability', async () => {
  const {context, document, requests, storage} = setup({ok:true, model:'test-model', nomePaciente:'TESTE', convenio:'TESTE', cirurgia:'123', atendimento:'456'});
  await context.processCurrentImage();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.action, 'aiExtract');
  assert.equal(requests[0].body.deviceToken, 'test-device');
  assert.equal(vm.runInContext('state.aiReady', context), true);
  assert.match(document.querySelector('#processing-status').textContent, /Leitura Concluída/);
  assert.equal(document.querySelector('#process-image').disabled, false);
  assert.equal(JSON.parse(storage.get('etiqueta-hmt-ai-health-v1')).ok, true);
});

test('labels displays service rejection after failed health and remains retryable', async () => {
  const {context, document, requests} = setup({ok:false, message:'Sessão não autorizada.'});
  await context.processCurrentImage();
  assert.equal(requests.length, 1);
  assert.match(document.querySelector('#processing-status').textContent, /Sessão não autorizada/);
  assert.equal(document.querySelector('#process-image').disabled, false);
  assert.equal(vm.runInContext('state.aiReady', context), false);
});
