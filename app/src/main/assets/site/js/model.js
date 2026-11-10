// Pure data rules for categories and Home rows (no DOM). Every function returns new arrays/objects or
// mutates only the settings object it is given, so it can be unit-tested in Node (web-tests/model.test.cjs).
(function () {
  'use strict';

  var MAX_CATS = 40, MAX_APPS = 300, MAX_NAME = 40;
  var SORTS = ['manual', 'alpha', 'recent'];
  // Built-in categories: the name is a translation key until the user renames it.
  var BUILTIN = [
    { id: 'live', key: 'Live', icon: 'live' },
    { id: 'movies', key: 'Movies & Shows', icon: 'film' },
    { id: 'anime', key: 'Anime', icon: 'star' },
    { id: 'music', key: 'Music', icon: 'music' }
  ];
  // First-run suggestions. Only packages that are actually installed are ever added (see seed()).
  var SUGGEST = {
    live: ['tv.twitch.android.app', 'com.kick.mobile'],
    movies: ['com.netflix.ninja', 'net.mbc.shahidTV', 'com.stremio.one', 'tv.stremioorigin.app', 'com.disney.disneyplus',
      'com.osn.go', 'com.parsifal.starz', 'com.apple.atve.androidtv.appletv', 'com.plexapp.android', 'org.jellyfin.androidtv'],
    anime: ['com.crunchyroll.crunchyroid'],
    music: ['com.spotify.tv.android', 'com.google.android.youtube.tvmusic', 'com.anghami.odin', 'deezer.android.tv']
  };

  function validId(id) { return typeof id === 'string' && id.length > 0 && id.length < 256 && !/^empty-slot-/.test(id); }
  function cleanName(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME); }
  function uniq(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (id) {
      if (!validId(id) || seen[id]) return false;
      seen[id] = true; return true;
    });
  }

  function defaults() {
    return BUILTIN.map(function (b) {
      return { id: b.id, name: '', key: b.key, icon: b.icon, apps: [], hidden: false, tab: true, row: true, sort: 'manual' };
    });
  }

  function sanitizeCategory(c) {
    if (!c || typeof c !== 'object' || !/^[a-z0-9-]{1,40}$/.test(String(c.id))) return null;
    var b = BUILTIN.filter(function (x) { return x.id === c.id; })[0];
    var name = cleanName(c.name);
    if (!name && !b) return null; // a user category always needs a name
    return {
      id: String(c.id), name: name, key: b ? b.key : '', icon: b ? b.icon : 'folder',
      apps: uniq(c.apps).slice(0, MAX_APPS), hidden: c.hidden === true, tab: c.tab !== false, row: c.row !== false,
      sort: SORTS.indexOf(c.sort) >= 0 ? c.sort : 'manual'
    };
  }

  /** Returns a clean category list. `raw` undefined/null means "never set" and yields the defaults. */
  function sanitizeCategories(raw) {
    if (!Array.isArray(raw)) return defaults();
    var seen = {}, out = [];
    raw.forEach(function (c) {
      var s = sanitizeCategory(c);
      if (s && !seen[s.id] && out.length < MAX_CATS) { seen[s.id] = true; out.push(s); }
    });
    return out;
  }

  /** Home rows: 'favorites' plus category ids, in display order. Unknown ids are dropped, new categories appended. */
  function sanitizeRows(rows, cats) {
    var valid = ['favorites'].concat(cats.map(function (c) { return c.id; }));
    var out = (Array.isArray(rows) ? rows : []).filter(function (id, i, arr) { return valid.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    valid.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
  }
  function sanitizeHiddenRows(hidden, rows) {
    return (Array.isArray(hidden) ? hidden : []).filter(function (id, i, arr) { return rows.indexOf(id) >= 0 && arr.indexOf(id) === i; });
  }

  function find(s, id) { return s.categories.filter(function (c) { return c.id === id; })[0] || null; }
  function label(c, tr) { return c.name || tr(c.key); }

  function newId(s) {
    var id;
    do { id = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); } while (find(s, id));
    return id;
  }
  /** Creates a user category; returns it, or null when the name is empty/duplicate or the limit is reached. */
  function create(s, name, tr) {
    var n = cleanName(name);
    if (!n || s.categories.length >= MAX_CATS) return null;
    var lower = n.toLowerCase();
    if (s.categories.some(function (c) { return label(c, tr).toLowerCase() === lower; })) return null;
    var c = { id: newId(s), name: n, key: '', icon: 'folder', apps: [], hidden: false, tab: true, row: true, sort: 'manual' };
    s.categories.push(c);
    s.homeRows = sanitizeRows(s.homeRows, s.categories);
    return c;
  }
  function rename(s, id, name, tr) {
    var c = find(s, id), n = cleanName(name);
    if (!c || !n) return false;
    var lower = n.toLowerCase();
    if (s.categories.some(function (x) { return x.id !== id && label(x, tr).toLowerCase() === lower; })) return false;
    c.name = n;
    return true;
  }
  /** Deleting a category removes only the grouping: apps, favorites and Home slots are untouched. */
  function remove(s, id) {
    var before = s.categories.length;
    s.categories = s.categories.filter(function (c) { return c.id !== id; });
    s.homeRows = s.homeRows.filter(function (r) { return r !== id; });
    s.homeRowsHidden = s.homeRowsHidden.filter(function (r) { return r !== id; });
    return s.categories.length < before;
  }
  function moveCategory(s, id, delta) {
    var i = s.categories.map(function (c) { return c.id; }).indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= s.categories.length) return false;
    var t = s.categories[i]; s.categories[i] = s.categories[j]; s.categories[j] = t;
    return true;
  }
  function moveRow(s, id, delta) {
    var i = s.homeRows.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= s.homeRows.length) return false;
    s.homeRows[i] = s.homeRows[j]; s.homeRows[j] = id;
    return true;
  }

  function addApp(s, catId, appId) {
    var c = find(s, catId);
    if (!c || !validId(appId) || c.apps.indexOf(appId) >= 0 || c.apps.length >= MAX_APPS) return false;
    c.apps.push(appId);
    return true;
  }
  function removeApp(s, catId, appId) {
    var c = find(s, catId);
    if (!c || c.apps.indexOf(appId) < 0) return false;
    c.apps = c.apps.filter(function (x) { return x !== appId; });
    return true;
  }
  /** Moves an app out of one category into another; every other category keeps it. */
  function moveApp(s, fromId, toId, appId) {
    if (fromId === toId || !find(s, fromId) || !find(s, toId)) return false;
    removeApp(s, fromId, appId);
    addApp(s, toId, appId);
    return true;
  }
  function membership(s, appId) {
    return s.categories.filter(function (c) { return c.apps.indexOf(appId) >= 0; }).map(function (c) { return c.id; });
  }
  /** Reorders the visible (installed) apps of a category; uninstalled ids stay at the end, in order. */
  function reorderApp(s, catId, appId, delta, isInstalled) {
    var c = find(s, catId);
    if (!c) return -1;
    var vis = c.apps.filter(isInstalled), i = vis.indexOf(appId), j = i + delta;
    if (i < 0 || j < 0 || j >= vis.length) return -1;
    vis.splice(i, 1); vis.splice(j, 0, appId);
    c.apps = vis.concat(c.apps.filter(function (x) { return vis.indexOf(x) < 0; }));
    return j;
  }

  /** Installed apps of a category in its chosen order. `recent` maps app id -> last launch time (ms). */
  function appsOf(c, lookup, recent, nameOf, locale) {
    var list = c.apps.map(lookup).filter(Boolean);
    if (c.sort === 'alpha') return list.slice().sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b), locale, { sensitivity: 'base' }); });
    if (c.sort === 'recent') {
      var pos = {};
      list.forEach(function (a, i) { pos[a.id] = i; });
      return list.slice().sort(function (a, b) { return ((recent[b.id] || 0) - (recent[a.id] || 0)) || (pos[a.id] - pos[b.id]); });
    }
    return list;
  }

  /** Fills empty built-in categories once with suggested apps that are installed. Returns the number added. */
  function seed(s, isInstalled) {
    var added = 0;
    s.categories.forEach(function (c) {
      if (!SUGGEST[c.id] || c.apps.length) return;
      SUGGEST[c.id].forEach(function (id) { if (isInstalled(id) && addApp(s, c.id, id)) added++; });
    });
    return added;
  }

  function sanitizeRecent(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).filter(validId).map(function (k) { return [k, Number(raw[k])]; })
      .filter(function (p) { return p[1] > 0 && isFinite(p[1]); })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 100)
      .forEach(function (p) { out[p[0]] = p[1]; });
    return out;
  }

  /** h:mm (12-hour: midnight = 12:00, noon = 12:00) or HH:mm (24-hour). */
  function clockText(d, hour12) {
    var mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    if (!hour12) return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + mm;
    return (d.getHours() % 12 || 12) + ':' + mm;
  }

  window.TVModel = {
    clockText: clockText,
    BUILTIN: BUILTIN, SORTS: SORTS, MAX_NAME: MAX_NAME, validId: validId, cleanName: cleanName,
    sanitizeCategories: sanitizeCategories, sanitizeRows: sanitizeRows, sanitizeHiddenRows: sanitizeHiddenRows, sanitizeRecent: sanitizeRecent,
    find: find, label: label, create: create, rename: rename, remove: remove, moveCategory: moveCategory, moveRow: moveRow,
    addApp: addApp, removeApp: removeApp, moveApp: moveApp, membership: membership, reorderApp: reorderApp, appsOf: appsOf, seed: seed
  };
})();
