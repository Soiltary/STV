const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const JS = path.join(__dirname, '../app/src/main/assets/site/js');
function load() {
  const ctx = vm.createContext({ window: {} });
  for (const name of ['i18n.js', 'weather.js']) vm.runInContext(fs.readFileSync(path.join(JS, name), 'utf8'), ctx);
  return ctx.window;
}

test('only Arabic and English are offered; Arabic is the default', () => {
  const { TVI18n: L } = load();
  assert.equal(L.normalize('en-GB'), 'en-GB');
  assert.equal(L.normalize('en'), 'en-GB');
  assert.equal(L.normalize('pt-PT'), 'ar-SA');
  assert.equal(L.normalize(undefined), 'ar-SA');
});

test('every literal passed to tr() in main.js has an Arabic translation', () => {
  const { TVI18n: L } = load();
  const src = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/\btr\('([^']+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/label: '([^']+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/\[(?:true|false|'[^']*'), '([^']+)'\]/g)) if (!/[؀-ۿ]/.test(m[1]) && m[1] !== 'English') keys.add(m[1]);
  for (const m of src.matchAll(/(?:title|desc): '([^']+)'/g)) keys.add(m[1]);
  const qp = src.match(/var QP_LABEL = \{([\s\S]*?)\};/);
  assert.ok(qp, 'QP_LABEL found');
  for (const m of qp[1].matchAll(/: '([^']+)'/g)) keys.add(m[1]);
  const tabs = src.match(/var TAB_LABEL = \{([\s\S]*?)\};/);
  for (const m of tabs[1].matchAll(/: '([^']+)'/g)) keys.add(m[1]);
  for (const k of ['Good morning', 'Good afternoon', 'Good evening', 'Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha', 'General', 'Appearance', 'Home apps', 'Weather & prayer', 'Backup', 'About']) keys.add(k);
  const missing = [...keys].filter((k) => /[A-Za-z]/.test(k) && !/^[a-z]+[A-Z][A-Za-z]*$/.test(k) && !/^[a-z]+$/.test(k) /* ids such as 'minimal' */ && !Object.prototype.hasOwnProperty.call(L.dictionary, k));
  assert.deepEqual(missing, []);
  assert.ok(keys.size > 60, 'scanner found the strings');
});

test('index.html data-i18n keys are translated', () => {
  const { TVI18n: L } = load();
  const html = fs.readFileSync(path.join(JS, '../index.html'), 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((m) => m[1]);
  const missing = keys.filter((k) => !Object.prototype.hasOwnProperty.call(L.dictionary, k));
  assert.deepEqual(missing, []);
});

test('Arabic weather labels keep the weather kind and intensity', () => {
  const { TVI18n: L, TVWeather: W } = load();
  for (const code of [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99, 999]) {
    L.setLanguage('en-GB'); const en = W.describe(code);
    L.setLanguage('ar-SA'); const ar = W.describe(code);
    assert.match(ar.label, /[؀-ۿ]/, `code ${code}`);
    assert.equal(ar.kind, en.kind); assert.equal(ar.intensity, en.intensity);
  }
});

test('placeholders are substituted and unknown keys pass through', () => {
  const { TVI18n: L } = load();
  L.setLanguage('ar-SA');
  assert.equal(L.text('Slot {n}', { n: 3 }), 'الخانة 3');
  assert.equal(L.text('YouTube'), 'YouTube');
  L.setLanguage('en-GB');
  assert.equal(L.text('{count} apps', { count: 5 }), '5 apps');
});

test('the Arabic dictionary has no duplicate keys (a later duplicate silently overrides the first)', () => {
  const src = fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8');
  const body = src.slice(src.indexOf('var arabic = {'), src.indexOf('};', src.indexOf('var arabic = {')));
  const keys = [...body.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dupes, []);
  assert.ok(keys.length > 150);
});
