// Every English interface string used by main.js / index.html must have an Arabic translation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SITE = path.join(__dirname, '../app/src/main/assets/site');

function dictionary() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(SITE, 'js/i18n.js'), 'utf8'), ctx);
  return ctx.window.TVI18n.dictionary;
}
function usedKeys() {
  const src = fs.readFileSync(path.join(SITE, 'js/main.js'), 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
  // Labels that reach tr() indirectly: CHOICES values/labels, TAB_LABEL, QP_LABEL, WALL_NAME, SS_NAME, SORT_LABEL, IMPORT_ERR, help keys.
  const blocks = ['CHOICES', 'TAB_LABEL', 'QP_LABEL', 'WALL_NAME', 'SS_NAME', 'SORT_LABEL', 'IMPORT_ERR', 'MOOD'];
  for (const name of blocks) {
    const start = src.indexOf('var ' + name + ' = {');
    if (start < 0) continue;
    const end = src.indexOf('};', start);
    for (const m of src.slice(start, end).matchAll(/'([^'\n]*[A-Za-z][^'\n]*)'/g)) keys.add(m[1]);
  }
  const help = src.indexOf('var keys = [[');
  if (help >= 0) for (const m of src.slice(help, src.indexOf(']];', help)).matchAll(/'([^'\n]+)'/g)) keys.add(m[1]);
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)) keys.add(m[1]);
  return keys;
}
// Values that are ids/codes, not text, inside the scanned blocks.
const NOT_TEXT = /^(, |ar-SA|en-GB|C|F|12|24|auto|night|dawn|day|dusk|light|medium|strong|fast|normal|calm|manual|alpha|recent|soft|whisper|minimal|cinematic|low|high|off|fill|fit|crop|full|reduced|classic|digital|clear|partly|cloudy|fog|drizzle|rain|snow|storm|android-settings|app-settings|search|apps|favorites|ambient|refresh-weather|refresh-prayer|w0\d|scenery|orbit|nebula|stars|waves|midnight|cancel|nopicker|space|large|format|corrupt|unreadable|appearance|screensaver|categories|homescreen|sound|widgets|quickpanel|system|backup|language|clock|unit|effects|showWeather|showPrayers|focus3d|focusStrength|focusSpeed|motion|theme|wallFit|wallDim|ss[A-Z]\w*|snd[A-Z]\w*|qp[A-Z]\w*|العربية|English|OK|Hold OK|Menu|Back|Home|Arrows)$/;

test('every interface string has an Arabic translation', () => {
  const dict = dictionary();
  const missing = [...usedKeys()].filter((k) => !/^, /.test(k) && !NOT_TEXT.test(k) && !(k in dict));
  assert.deepEqual(missing, []);
});
