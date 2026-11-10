const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/site/js/apps.js'), 'utf8');

function load(bridge) {
  const window = bridge ? { AndroidTV: bridge } : {};
  const ctx = vm.createContext({ window, Promise, JSON, encodeURIComponent });
  vm.runInContext(SRC, ctx);
  return window.TVApps;
}

test('Android bridge: lists installed apps from the native JSON', async () => {
  const api = load({ listApps: () => JSON.stringify([{ id: 'com.stremio.one', name: 'Stremio', icon: 'x' }, { id: 'system.settings', name: '', system: true }]) });
  assert.equal(api.isAndroid, true);
  const list = await api.list();
  assert.deepEqual(list.map((a) => a.id), ['com.stremio.one', 'system.settings']);
});

test('Android bridge: launch resolves on success and rejects when the app cannot open', async () => {
  const launched = [];
  const api = load({ listApps: () => '[]', launch: (id) => { launched.push(id); return id === 'ok.app'; } });
  await api.launch('ok.app');
  await assert.rejects(api.launch('missing.app'));
  assert.deepEqual(launched, ['ok.app', 'missing.app']);
});

test('Android bridge: Back on Home asks the native side to leave', () => {
  let left = 0;
  const api = load({ listApps: () => '[]', exit: () => { left++; } });
  api.exit();
  assert.equal(left, 1);
});

test('desktop preview: sample apps, launching is refused', async () => {
  const api = load(null);
  assert.equal(api.isAndroid, false);
  const list = await api.list();
  assert.ok(list.length >= 10);
  assert.ok(list.every((a) => a.id && (a.icon || a.system)));
  await assert.rejects(api.launch('com.stremio.one'));
});
