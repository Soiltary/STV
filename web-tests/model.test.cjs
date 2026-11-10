const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.join(__dirname, '../app/src/main/assets/site/js');
function load() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(JS, 'model.js'), 'utf8'), ctx);
  return ctx.window.TVModel;
}
const tr = (k) => k;
// Arrays created inside the vm context have another realm's prototype: compare plain copies.
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);
function fresh(M) {
  const s = { categories: M.sanitizeCategories(undefined), homeRows: [], homeRowsHidden: [] };
  s.homeRows = M.sanitizeRows(s.homeRows, s.categories);
  return s;
}

test('defaults: four built-in categories, shown as tabs and rows, manual sort', () => {
  const M = load();
  const s = fresh(M);
  eq(s.categories.map((c) => c.id), ['live', 'movies', 'anime', 'music']);
  assert.ok(s.categories.every((c) => c.tab && c.row && !c.hidden && c.sort === 'manual' && c.apps.length === 0));
  eq(s.homeRows, ['favorites', 'live', 'movies', 'anime', 'music']);
});

test('an existing empty list stays empty (user deleted every category)', () => {
  const M = load();
  eq(M.sanitizeCategories([]), []);
});

test('sanitize drops bad entries, duplicates and unnamed user categories, keeps user data', () => {
  const M = load();
  const out = M.sanitizeCategories([
    { id: 'live', apps: ['a', 'a', 'empty-slot-1', 'b'], sort: 'weird', tab: false },
    { id: 'live', name: 'dup' },
    { id: 'BAD ID', name: 'x' },
    { id: 'c1', name: '' },
    { id: 'c2', name: '  My <b>  list ', hidden: true },
    null, 5
  ]);
  eq(out.map((c) => c.id), ['live', 'c2']);
  eq(out[0].apps, ['a', 'b']);
  assert.equal(out[0].sort, 'manual');
  assert.equal(out[0].tab, false);
  assert.equal(out[1].name, 'My b list');
  assert.equal(out[1].hidden, true);
});

test('create / rename reject empty and duplicate names (case-insensitive, built-in labels included)', () => {
  const M = load();
  const s = fresh(M);
  assert.equal(M.create(s, '   ', tr), null);
  assert.equal(M.create(s, 'music', tr), null);
  const c = M.create(s, 'Kids', tr);
  assert.ok(c && /^c[a-z0-9]+$/.test(c.id));
  assert.ok(s.homeRows.includes(c.id));
  assert.equal(M.create(s, 'kids', tr), null);
  assert.equal(M.rename(s, c.id, 'Live', tr), false);
  assert.equal(M.rename(s, c.id, 'أطفال', tr), true);
  assert.equal(M.find(s, c.id).name, 'أطفال');
  assert.equal(M.label(M.find(s, 'anime'), tr), 'Anime');
});

test('an app can live in several categories; remove/move affect only the named categories', () => {
  const M = load();
  const s = fresh(M);
  assert.ok(M.addApp(s, 'movies', 'com.stremio.one'));
  assert.ok(M.addApp(s, 'live', 'com.stremio.one'));
  assert.equal(M.addApp(s, 'live', 'com.stremio.one'), false, 'no duplicates inside one category');
  eq(M.membership(s, 'com.stremio.one'), ['live', 'movies']);
  assert.ok(M.removeApp(s, 'live', 'com.stremio.one'));
  eq(M.membership(s, 'com.stremio.one'), ['movies']);
  M.addApp(s, 'anime', 'com.stremio.one');
  assert.ok(M.moveApp(s, 'movies', 'music', 'com.stremio.one'));
  eq(M.membership(s, 'com.stremio.one'), ['anime', 'music']);
});

test('deleting a category removes only the grouping and its Home row', () => {
  const M = load();
  const s = fresh(M);
  s.homeRowsHidden = ['live'];
  M.addApp(s, 'live', 'tv.twitch.android.app');
  assert.ok(M.remove(s, 'live'));
  assert.equal(M.find(s, 'live'), null);
  assert.ok(!s.homeRows.includes('live'));
  eq(s.homeRowsHidden, []);
  assert.equal(M.remove(s, 'live'), false);
});

test('rows: unknown ids dropped, new categories appended, order kept, move bounded', () => {
  const M = load();
  const s = fresh(M);
  s.homeRows = M.sanitizeRows(['music', 'ghost', 'favorites', 'music'], s.categories);
  eq(s.homeRows, ['music', 'favorites', 'live', 'movies', 'anime']);
  assert.ok(M.moveRow(s, 'favorites', -1));
  eq(s.homeRows.slice(0, 2), ['favorites', 'music']);
  assert.equal(M.moveRow(s, 'favorites', -1), false);
  eq(M.sanitizeHiddenRows(['ghost', 'anime', 'anime'], s.homeRows), ['anime']);
});

test('sorting: manual keeps order, alpha by name, recent by last launch with manual tie-break; uninstalled hidden', () => {
  const M = load();
  const apps = { a: { id: 'a', name: 'Zeta' }, b: { id: 'b', name: 'alpha' }, c: { id: 'c', name: 'Mid' } };
  const lookup = (id) => apps[id] || null;
  const name = (x) => x.name;
  const cat = { apps: ['a', 'gone', 'b', 'c'], sort: 'manual' };
  eq(M.appsOf(cat, lookup, {}, name, 'en').map((x) => x.id), ['a', 'b', 'c']);
  cat.sort = 'alpha';
  eq(M.appsOf(cat, lookup, {}, name, 'en').map((x) => x.id), ['b', 'c', 'a']);
  cat.sort = 'recent';
  eq(M.appsOf(cat, lookup, { c: 50, a: 10 }, name, 'en').map((x) => x.id), ['c', 'a', 'b']);
});

test('reorderApp moves among installed apps and keeps uninstalled ids', () => {
  const M = load();
  const s = fresh(M);
  s.categories[0].apps = ['a', 'gone', 'b', 'c'];
  const inst = (id) => id !== 'gone';
  assert.equal(M.reorderApp(s, 'live', 'c', -1, inst), 1);
  eq(s.categories[0].apps, ['a', 'c', 'b', 'gone']);
  assert.equal(M.reorderApp(s, 'live', 'a', -1, inst), -1);
});

test('seed adds only installed suggestions, once, never into a category that already has apps', () => {
  const M = load();
  const s = fresh(M);
  const installed = new Set(['tv.twitch.android.app', 'com.kick.mobile', 'com.stremio.one', 'com.spotify.tv.android']);
  s.categories[3].apps = ['user.choice'];
  const n = M.seed(s, (id) => installed.has(id));
  assert.equal(n, 3);
  eq(M.find(s, 'live').apps, ['tv.twitch.android.app', 'com.kick.mobile']);
  eq(M.find(s, 'movies').apps, ['com.stremio.one']);
  eq(M.find(s, 'anime').apps, []);
  eq(M.find(s, 'music').apps, ['user.choice']);
});

test('recent map is cleaned and capped at 100 newest', () => {
  const M = load();
  const raw = { bad: 'x', '': 5, 'empty-slot-2': 9 };
  for (let i = 0; i < 120; i++) raw['p' + i] = i + 1;
  const out = M.sanitizeRecent(raw);
  assert.equal(Object.keys(out).length, 100);
  assert.equal(out.p119, 120);
  assert.equal(out.p0, undefined);
  assert.equal(out.bad, undefined);
});

test('screensaver clock: 12-hour shows 12:00 at midnight and noon, 24-hour pads', () => {
  const M = load();
  const at = (h, m) => new Date(2026, 10, 10, h, m);
  assert.equal(M.clockText(at(0, 0), true), '12:00');
  assert.equal(M.clockText(at(0, 5), true), '12:05');
  assert.equal(M.clockText(at(12, 0), true), '12:00');
  assert.equal(M.clockText(at(13, 7), true), '1:07');
  assert.equal(M.clockText(at(23, 59), true), '11:59');
  assert.equal(M.clockText(at(0, 0), false), '00:00');
  assert.equal(M.clockText(at(9, 3), false), '09:03');
});
