// App search matching (Arabic + English). Pure functions so they can be unit tested.
(function () {
  'use strict';

  function normalize(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')        // harakat + tatweel
      .replace(/[أإآٱ]/g, 'ا')   // alef forms -> ا
      .replace(/ة/g, 'ه')                        // ة -> ه
      .replace(/ى/g, 'ي')                        // ى -> ي
      .replace(/[‌-‏‪-‮]/g, '')        // bidi marks
      .replace(/\s+/g, ' ').trim();
  }

  // 0 = no match. Higher is better: exact > prefix > word prefix > substring > package id.
  function score(name, id, query) {
    var q = normalize(query);
    if (!q) return 1;
    var n = normalize(name);
    if (n === q) return 100;
    if (n.indexOf(q) === 0) return 80;
    if (n.split(/[\s\-+:·.،]+/).some(function (w) { return w && w.indexOf(q) === 0; })) return 60;
    if (n.indexOf(q) >= 0) return 40;
    var compact = q.replace(/\s/g, '');
    if (compact.length >= 3 && String(id || '').toLowerCase().indexOf(compact) >= 0) return 10;
    return 0;
  }

  // items: [{ name, id, ... }] -> matching items, best first, stable for equal scores.
  function filter(items, query, nameOf) {
    if (!normalize(query)) return items.slice();
    return items.map(function (a, i) { return { a: a, i: i, s: score(nameOf ? nameOf(a) : a.name, a.id, query) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (x, y) { return y.s - x.s || x.i - y.i; })
      .map(function (x) { return x.a; });
  }

  window.TVSearch = { normalize: normalize, score: score, filter: filter };
})();
