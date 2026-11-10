const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.join(__dirname, '../app/src/main/assets/site/js');
function load() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(JS, 'search.js'), 'utf8'), ctx);
  return ctx.window.TVSearch;
}
const APPS = [
  { id: 'com.stremio.one', name: 'Stremio' },
  { id: 'org.smarttube.stable', name: 'SmartTube' },
  { id: 'app.onetube.tv', name: 'Nuvio + IPTV + 1Tube' },
  { id: 'com.google.android.youtube.tv', name: 'YouTube' },
  { id: 'com.google.android.youtube.tvmusic', name: 'YouTube Music' },
  { id: 'com.alphainventor.filemanager', name: 'مدير الملفات +' },
  { id: 'com.android.vending', name: 'متجر Google Play' },
  { id: 'com.crunchyroll.crunchyroid', name: 'كرانشي رول' },
  { id: 'com.kick.mobile', name: 'Kick: البث المباشر' },
  { id: 'net.mbc.shahidTV', name: 'MBC Shahid' }
];
const ids = (list) => list.map((a) => a.id);

test('empty or blank query returns every app in the original order', () => {
  const S = load();
  assert.deepEqual(ids(S.filter(APPS, '')), ids(APPS));
  assert.deepEqual(ids(S.filter(APPS, '   ')), ids(APPS));
});

test('English: case-insensitive, extra spaces ignored, prefix ranks first', () => {
  const S = load();
  const r = S.filter(APPS, '  YOU  ');
  assert.deepEqual(ids(r).slice(0, 2), ['com.google.android.youtube.tv', 'com.google.android.youtube.tvmusic']);
  assert.ok(ids(S.filter(APPS, 'tube')).includes('org.smarttube.stable'));
  assert.equal(ids(S.filter(APPS, 'iptv'))[0], 'app.onetube.tv');
  assert.equal(ids(S.filter(APPS, 'youtube music'))[0], 'com.google.android.youtube.tvmusic');
});

test('Arabic: partial words, alef/taa-marbuta/harakat normalisation', () => {
  const S = load();
  assert.deepEqual(ids(S.filter(APPS, 'الملفات')), ['com.alphainventor.filemanager']);
  assert.deepEqual(ids(S.filter(APPS, 'ملف')), ['com.alphainventor.filemanager']);
  assert.deepEqual(ids(S.filter(APPS, 'كرانشي')), ['com.crunchyroll.crunchyroid']);
  assert.deepEqual(ids(S.filter(APPS, 'البَث')), ['com.kick.mobile']);
  assert.equal(S.normalize('أإآ مدرسة مستشفى'), 'ااا مدرسه مستشفي');
  assert.deepEqual(ids(S.filter(APPS, 'متجر')), ['com.android.vending']);
});

test('mixed Arabic/English names match either part', () => {
  const S = load();
  assert.deepEqual(ids(S.filter(APPS, 'google')), ['com.android.vending', 'com.google.android.youtube.tv', 'com.google.android.youtube.tvmusic']);
  assert.deepEqual(ids(S.filter(APPS, 'kick')), ['com.kick.mobile']);
});

test('no match returns an empty list; short queries do not match package ids', () => {
  const S = load();
  assert.deepEqual(S.filter(APPS, 'zzzz'), []);
  assert.deepEqual(ids(S.filter(APPS, 'co')), []);
});

test('large list (2000 apps) filters quickly', () => {
  const S = load();
  const big = [];
  for (let i = 0; i < 2000; i++) big.push({ id: 'pkg.' + i, name: (i % 2 ? 'تطبيق ' : 'App ') + i });
  const t = Date.now();
  for (let k = 0; k < 20; k++) S.filter(big, k % 2 ? 'تطبيق 19' : 'app 19');
  assert.ok(Date.now() - t < 500, 'filtering stays fast');
  assert.equal(S.filter(big, 'تطبيق 1999')[0].id, 'pkg.1999');
  assert.equal(S.filter(big, 'APP 1998')[0].id, 'pkg.1998');
});
