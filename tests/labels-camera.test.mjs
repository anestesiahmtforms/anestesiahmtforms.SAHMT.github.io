import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const html = await fs.readFile('ui/templates/etiquetas.html', 'utf8');
const source = await fs.readFile('apps/etiquetas/app.js', 'utf8');
function setup(getUserMedia) {
  const {document} = parseHTML(html);
  const noop = () => {};
  const context = vm.createContext({document, URL, URLSearchParams, Intl, Date,
    navigator: {mediaDevices: {getUserMedia}},
    window: {addEventListener: noop, setInterval: noop},
    localStorage: {getItem: () => null}, console: {warn: noop},
  });
  document.querySelector('#camera').play = async () => {};
  vm.runInContext(source.replace('\nbootstrap();', '\n'), context);
  return {context, document};
}
function stream(focusMode) {
  let stops = 0;
  const constraints = [];
  const track = {stop: () => stops++, getCapabilities: () => ({focusMode}),
    applyConstraints: async value => constraints.push(value)};
  return {getTracks: () => [track], getVideoTracks: () => [track], constraints, stops: () => stops};
}

test('camera opens only one stream during repeated taps and clears the prior preview', async () => {
  let resolve, calls = 0;
  const {context, document} = setup(() => {calls++; return new Promise(r => resolve = r);});
  document.querySelector('#preview').classList.add('has-image');
  document.querySelector('#preview').src = 'previous-photo';
  const opening = context.handleCameraCaptureButton();
  await context.handleCameraCaptureButton();
  assert.equal(calls, 1);
  assert.equal(document.querySelector('#capture-image').disabled, true);
  assert.equal(document.querySelector('#preview').hasAttribute('src'), false);
  const media = stream(['continuous']); resolve(media); await opening;
  assert.equal(media.constraints[0].advanced[0].focusMode, 'continuous');
  assert.equal(document.querySelector('#capture-image').disabled, false);
});

test('leaving during camera permission stops the late stream and allows reopening', async () => {
  let resolve;
  const {context, document} = setup(() => new Promise(r => resolve = r));
  const opening = context.startCamera(); context.stopCamera();
  const media = stream(); resolve(media); await opening;
  assert.equal(media.stops(), 1);
  assert.equal(document.querySelector('#camera').srcObject, null);
  assert.equal(document.querySelector('#capture-image').disabled, false);
  assert.equal(vm.runInContext('state.cameraStarting', context), false);
});

test('a camera without focus controls still starts with native settings', async () => {
  const media = stream();
  const {context, document} = setup(async () => media);
  await context.startCamera();
  assert.equal(media.constraints.length, 0);
  assert.equal(document.querySelector('#camera').srcObject, media);
});

test('capture waits for a decoded frame instead of exporting a blank image', async () => {
  const {context, document} = setup(async () => stream());
  await context.startCamera();
  document.querySelector('#camera').videoWidth = 0;
  document.querySelector('#camera').videoHeight = 0;
  await context.captureFromCamera();
  assert.match(document.querySelector('#processing-status').textContent, /Aguarde a imagem/);
});
