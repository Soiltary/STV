(function () {
  'use strict';

  var CFG = window.TV_HOME_CONFIG, I = window.TVIcons, W = window.TVWeather, L = window.TVI18n, tr = L.text, M = window.TVModel;
  var NATIVE = window.AndroidTV || null;
  var $ = function (id) { return document.getElementById(id); };
  var SLOTS = 5;
  // Started by SolitaryDream (system screensaver): show only the screensaver, never write settings.
  var DREAM = /[?&]dream=1/.test(location.search) || !!(NATIVE && NATIVE.isDream && NATIVE.isDream());
  // Desktop preview only: ?offline=1 simulates a receiver without internet.
  if (!NATIVE && /[?&]offline=1/.test(location.search)) window.fetch = function () { return Promise.reject(new Error('offline (preview)')); };
  var PAGES = ['home', 'apps', 'favorites', 'category', 'store', 'settings'];
  function has(fn) { return !!(NATIVE && typeof NATIVE[fn] === 'function'); }

  // ================================================================ logging
  function log(stage, detail) { console.log('[TVBoot] ' + stage + (detail ? ': ' + detail : '')); }
  function fail(stage, e) { console.error('[TVBoot] FAILED ' + stage + ' - ' + (e && e.message ? e.message : String(e))); }
  window.addEventListener('error', function (e) { console.error('[TVError] ' + (e.message || e) + ' ' + (e.filename || '') + ':' + (e.lineno || 0)); });
  window.addEventListener('unhandledrejection', function (e) { console.error('[TVError] promise ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))); });

  // ================================================================ settings
  var KEY = 'solitary.settings.v3', OLD_KEY = 'tvhome.settings.v2';
  var DEFAULTS = {
    language: 'ar-SA', clock: '12', unit: 'C', scenery: 'auto', effects: false,
    showWeather: true, showPrayers: true, homeSlots: [null, null, null, null, null], favorites: [], importHash: '',
    // 3D focus
    focus3d: true, focusStrength: 'medium', focusSpeed: 'normal',
    // Quick panel
    qpMenuKey: true, qpNetwork: true, qpOrder: [], qpHidden: [],
    // 1.3.0 — categories & Home rows (see js/model.js); recent = last launch time per app (real launches only)
    categories: null, catsSeeded: false, homeRows: [], homeRowsHidden: [], recent: {},
    // 1.3.0 — appearance: wallpaper id ('w01'..'w06', 'scenery', 'u<digits>'), fit, dimming, theme, motion
    wallpaper: 'w01', wallFit: 'crop', wallDim: 'low', theme: 'cinematic', motion: 'full',
    // 1.4.0 — fonts, chosen separately for Arabic and English text ('system' = the receiver's own fonts)
    fontAr: 'system', fontEn: 'system',
    // 1.5.0 — header logo: 'default' (= Logo 03), 's01'..'s09', or 'text' (the original spark + "Solitary TV")
    logo: 'default',
    // 1.3.0 — screensaver (replaces Ambient mode; old values are migrated in sanitize)
    ssOn: true, ssIdle: 5, ssStyle: 'nebula', ssSlide: false, ssSlideItems: [], ssSlideEvery: 1, ssShuffle: true,
    ssClock: true, ssClockStyle: 'digital', ssHour12: true, ssAmPm: true, ssDate: true, ssWeather: true, ssPrayer: true, ssDim: 25,
    // 1.3.0 — interface sounds
    sndOn: true, sndStyle: 'soft', sndLevel: 'low',
    savedAt: 0
  };
  var WALLS = ['w01', 'w02', 'w03', 'w04', 'w05', 'w06'];
  var SS_STYLES = ['orbit', 'nebula', 'stars', 'waves', 'midnight'];
  var SS_IDLE = [1, 2, 5, 10, 15, 20, 30, 60, 0];
  var SS_EVERY = [0.5, 1, 2, 5, 10];
  // Font choices (1.4.0). Defined here because sanitize() needs them while settings load at start-up.
  var FONT_AR = { system: { name: 'System (Noto Naskh)', css: '"Noto Naskh Arabic UI", "Noto Naskh Arabic"' },
    cairo: { name: 'Cairo', css: '"Sol Ar Cairo"' }, tajawal: { name: 'Tajawal', css: '"Sol Ar Tajawal"' },
    plex: { name: 'IBM Plex Sans Arabic', css: '"Sol Ar Plex"' } };
  var FONT_EN = { system: { name: 'System (Roboto)', css: 'Roboto' }, inter: { name: 'Inter', css: '"Sol En Inter"' },
    plex: { name: 'IBM Plex Sans', css: '"Sol En Plex"' }, cairo: { name: 'Cairo (Latin)', css: '"Sol En Cairo"' } };
  function validArt(id) { return WALLS.indexOf(id) >= 0 || SS_STYLES.indexOf(id) >= 0 || /^u[0-9]{10,16}$/.test(id); }
  var QP_ITEMS = ['android-settings', 'app-settings', 'search', 'apps', 'favorites', 'ambient', 'refresh-weather', 'refresh-prayer'];
  function oneOf(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function sanitize(raw) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) { out[k] = raw && k in raw ? raw[k] : DEFAULTS[k]; });
    out.language = L.normalize(out.language);
    if (out.clock !== '24') out.clock = '12';
    if (out.unit !== 'F') out.unit = 'C';
    if (['auto', 'night', 'dawn', 'day', 'dusk'].indexOf(out.scenery) < 0) out.scenery = 'auto';
    out.effects = out.effects === true;
    out.showWeather = out.showWeather !== false;
    out.showPrayers = out.showPrayers !== false;
    var slots = Array.isArray(out.homeSlots) ? out.homeSlots.slice(0, SLOTS) : [];
    while (slots.length < SLOTS) slots.push(null);
    out.homeSlots = slots.map(function (id) { return validId(id) ? id : null; });
    var seen = {};
    out.favorites = (Array.isArray(out.favorites) ? out.favorites : []).filter(function (id) {
      if (!validId(id) || seen[id]) return false;
      seen[id] = true; return true;
    }).slice(0, 200);
    out.importHash = typeof out.importHash === 'string' ? out.importHash : '';
    out.savedAt = Number(out.savedAt) > 0 ? Number(out.savedAt) : 0;
    out.focus3d = out.focus3d !== false;
    out.focusStrength = oneOf(out.focusStrength, ['light', 'medium', 'strong'], 'medium');
    out.focusSpeed = oneOf(out.focusSpeed, ['fast', 'normal', 'calm'], 'normal');
    ['qpMenuKey', 'qpNetwork'].forEach(function (k) { out[k] = out[k] !== false; });
    // ---- 1.3.0 migration: Ambient mode (1.2.x) -> Screensaver. Only keys the 1.2.x copy really had are carried over.
    if (raw && !('ssOn' in raw) && ('ambientAuto' in raw || 'ambientIdle' in raw)) {
      if ('ambientAuto' in raw) out.ssOn = raw.ambientAuto !== false;
      if ('ambientIdle' in raw) out.ssIdle = raw.ambientIdle === 3 ? 2 : raw.ambientIdle;
      if ('ambientClock' in raw) out.ssClock = raw.ambientClock !== false;
      if ('ambientDate' in raw) out.ssDate = raw.ambientDate !== false;
      if ('ambientWeather' in raw) out.ssWeather = raw.ambientWeather !== false;
      if ('ambientPrayer' in raw) out.ssPrayer = raw.ambientPrayer !== false;
      if ('ambientDim' in raw) out.ssDim = raw.ambientDim;
      if ('ambientInterval' in raw) out.ssSlideEvery = raw.ambientInterval === 3 ? 2 : raw.ambientInterval;
      log('SETTINGS_MIGRATED_AMBIENT');
    }
    ['ssOn', 'ssShuffle', 'ssClock', 'ssHour12', 'ssAmPm', 'ssDate', 'ssWeather', 'ssPrayer', 'sndOn'].forEach(function (k) { out[k] = out[k] !== false; });
    out.ssSlide = out.ssSlide === true;
    out.ssIdle = oneOf(out.ssIdle, SS_IDLE, 5);
    out.ssSlideEvery = oneOf(out.ssSlideEvery, SS_EVERY, 1);
    out.ssDim = oneOf(out.ssDim, [0, 25, 50, 70], 25);
    out.ssClockStyle = oneOf(out.ssClockStyle, ['digital', 'minimal'], 'digital');
    out.ssStyle = validArt(out.ssStyle) ? out.ssStyle : 'nebula';
    out.ssSlideItems = (Array.isArray(out.ssSlideItems) ? out.ssSlideItems : []).filter(function (id, i, arr) { return validArt(id) && arr.indexOf(id) === i; }).slice(0, 80);
    out.wallpaper = out.wallpaper === 'scenery' || validArt(out.wallpaper) && SS_STYLES.indexOf(out.wallpaper) < 0 ? out.wallpaper : 'w01';
    out.wallFit = oneOf(out.wallFit, ['fill', 'fit', 'crop'], 'crop');
    out.wallDim = oneOf(out.wallDim, ['off', 'low', 'medium', 'high'], 'low');
    out.theme = oneOf(out.theme, ['cinematic', 'classic'], 'cinematic');
    out.motion = oneOf(out.motion, ['full', 'reduced'], 'full');
    out.fontAr = FONT_AR[out.fontAr] ? out.fontAr : 'system';
    out.fontEn = FONT_EN[out.fontEn] ? out.fontEn : 'system';
    out.logo = /^(default|text|s0[1-9])$/.test(out.logo) ? out.logo : 'default';
    out.sndStyle = oneOf(out.sndStyle, ['soft', 'whisper', 'minimal', 'cinematic'], 'soft');
    out.sndLevel = oneOf(out.sndLevel, ['low', 'medium', 'high'], 'low');
    out.categories = M.sanitizeCategories(raw && 'categories' in raw ? raw.categories : null);
    out.catsSeeded = out.catsSeeded === true;
    out.homeRows = M.sanitizeRows(out.homeRows, out.categories);
    out.homeRowsHidden = M.sanitizeHiddenRows(out.homeRowsHidden, out.homeRows);
    out.recent = M.sanitizeRecent(out.recent);
    var order = (Array.isArray(out.qpOrder) ? out.qpOrder : []).filter(function (id, i, arr) { return QP_ITEMS.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    QP_ITEMS.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
    out.qpOrder = order;
    out.qpHidden = (Array.isArray(out.qpHidden) ? out.qpHidden : []).filter(function (id, i, arr) { return QP_ITEMS.indexOf(id) >= 0 && arr.indexOf(id) === i; });
    return out;
  }
  var validId = M.validId;

  function loadSettings() {
    // Two copies: WebView localStorage and the native SharedPreferences mirror. WebView storage is
    // committed lazily and can be lost when Android freezes/kills the app, so the newer copy wins and
    // the native copy wins ties (it is written synchronously-ish via apply()).
    var local = null, mirror = null, raw = null;
    try { local = JSON.parse(localStorage.getItem(KEY)); } catch (e) { local = null; }
    if (NATIVE) { try { mirror = JSON.parse(NATIVE.loadSettings() || 'null'); } catch (e) { mirror = null; } }
    if (local && mirror) raw = (+local.savedAt || 0) > (+mirror.savedAt || 0) ? local : mirror;
    else raw = local || mirror;
    if (raw) log('SETTINGS_SOURCE', (raw === mirror ? 'native' : 'local') + ' lang=' + raw.language + ' saved=' + (raw.savedAt || 0));
    if (!raw) {
      var old = null;
      try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) { old = null; }
      if (old) {
        // Migration from 1.0.x: keep real choices, drop the "empty-slot-N" placeholders.
        raw = { language: old.language, unit: old.unit, scenery: old.scenery, effects: old.effects,
          showWeather: old.showWeather, showPrayers: old.showPrayers,
          homeSlots: (old.homeApps || []).filter(validId), favorites: (old.favoriteApps || []).filter(validId) };
        log('SETTINGS_MIGRATED_FROM_V2');
      }
    }
    return sanitize(raw || {});
  }
  var settings = loadSettings();
  function save() {
    if (DREAM) return; // the system screensaver only reads settings
    settings.savedAt = Date.now();
    var json = JSON.stringify(settings);
    try { localStorage.setItem(KEY, json); } catch (e) { fail('SAVE_LOCAL', e); }
    if (NATIVE) try { NATIVE.saveSettings(json); } catch (e) { fail('SAVE_NATIVE', e); }
  }

  // ================================================================ formatting
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(d) {
    if (settings.clock === '24') return pad(d.getHours()) + ':' + pad(d.getMinutes());
    return (d.getHours() % 12 || 12) + ':' + pad(d.getMinutes());
  }
  /** Screensaver clock: 12-hour by default (midnight shows 12:00, never 00:00), independent of the Home clock setting. */
  function ssTime(d) { return M.clockText(d, settings.ssHour12); }
  function fmtHHMM(s) { var p = String(s).split(':'), d = new Date(); d.setHours(+p[0], +p[1], 0, 0); return fmtTime(d); }
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  var EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function fmtDate(d) { return d.getDate() + ' ' + (L.isArabic() ? AR_MONTHS : EN_MONTHS)[d.getMonth()] + ' ' + d.getFullYear(); }
  function dayName(d) { return (L.isArabic() ? AR_DAYS : EN_DAYS)[d.getDay()]; }
  function temp(c) { return Math.round(settings.unit === 'F' ? c * 9 / 5 + 32 : c) + '°'; }
  function wind(k) { return settings.unit === 'F' ? Math.round(k * 0.621) + ' mph' : Math.round(k) + (L.isArabic() ? ' كم/س' : ' km/h'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function city() { return L.isArabic() ? CFG.location.name : (CFG.location.nameEn || CFG.location.name); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  // ================================================================ apps model
  var allApps = [], appIndex = {}, appsLoaded = false;
  function appName(a) { return a.id === 'system.settings' ? tr('TV settings') : a.name; }
  function app(id) { return id && appIndex[id] || null; }
  function sortApps(list) {
    var locale = L.isArabic() ? 'ar' : 'en';
    return list.slice().sort(function (a, b) {
      if (a.system !== b.system) return a.system ? 1 : -1;
      return appName(a).localeCompare(appName(b), locale, { sensitivity: 'base' });
    });
  }
  function isFav(id) { return settings.favorites.indexOf(id) >= 0; }
  function homeIndex(id) { return settings.homeSlots.indexOf(id); }

  function loadApps() {
    return window.TVApps.list().then(function (list) {
      allApps = sortApps(list);
      appIndex = {};
      allApps.forEach(function (a) { appIndex[a.id] = a; });
      appsLoaded = true;
      log('APPS_LOADED', String(allApps.length));
      seedCategories();
      renderApps();
    }).catch(function (e) {
      fail('APPS_LOAD', e);
      toast(tr('Could not read installed apps'));
    });
  }

  // ================================================================ weather
  var weather = W.cached(), weatherError = null, lastAttempt = 0, weatherLoading = false;
  function refreshWeather(force) {
    var age = weather ? Date.now() - weather.fetchedAt : Infinity;
    if (!force && age < CFG.weatherRefreshMinutes * 60e3) return;
    if (weatherLoading || (!force && weatherError && Date.now() - lastAttempt < 2 * 60e3)) return;
    lastAttempt = Date.now();
    weatherLoading = true;
    W.fetch(CFG.location).then(function (w) {
      weather = w; weatherError = null;
      log('WEATHER_LOADED');
    }).catch(function (e) {
      weatherError = e;
      fail('WEATHER_FETCH', e);
    }).then(function () { weatherLoading = false; renderAll(); });
  }
  function todayWx(now) { return weather && weather.daily.filter(function (d) { return sameDay(d.date, now); })[0]; }
  function sunTimes(now) {
    var t = todayWx(now);
    if (t) return { rise: t.sunrise, set: t.sunset };
    var r = new Date(now), s = new Date(now);
    r.setHours(5, 50, 0, 0); s.setHours(17, 45, 0, 0);
    return { rise: r, set: s };
  }
  function phase(now) {
    if (settings.scenery !== 'auto') return settings.scenery;
    var st = sunTimes(now), t = now.getTime(), m = 40 * 60e3;
    if (Math.abs(t - st.rise) < m) return 'dawn';
    if (Math.abs(t - st.set) < m) return 'dusk';
    return t > st.rise && t < st.set ? 'day' : 'night';
  }
  function period(h) { return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'evening'; }
  var MOOD = { clear: ['Clear skies over {p}', 'Clear night over {p}'], partly: ['A mix of sun and cloud', 'A few clouds tonight'],
    cloudy: ['Cloudy and calm', 'Cloudy and calm'], fog: ['Foggy outside', 'Foggy outside'], drizzle: ['Light drizzle outside', 'Light drizzle outside'],
    rain: ['Rain outside', 'Rain outside'], snow: ['Snow outside', 'Snow outside'], storm: ['Thunderstorms around', 'Thunderstorms around'] };

  // ================================================================ prayers
  var prayer = {};
  var PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  window.TVPersonal = { update: function (data) { prayer = data || {}; try { renderPrayers(); } catch (e) { fail('PRAYER_RENDER', e); } } };
  function nextPrayerText() {
    if (!prayer.prayerReady || !prayer.nextAt) return '';
    var mins = Math.max(1, Math.ceil((prayer.nextAt - Date.now()) / 60000));
    var left = mins >= 60 ? (mins % 60 ? tr('{h} h {m} min', { h: Math.floor(mins / 60), m: mins % 60 }) : tr('{h} h', { h: mins / 60 })) : tr('{m} min', { m: mins });
    return tr(prayer.tomorrow ? '{prayer} tomorrow in {left}' : '{prayer} in {left}', { prayer: tr(PRAYER_NAMES[prayer.nextKey] || ''), left: left });
  }
  function renderPrayers() {
    $('prayerTitle').textContent = tr('Prayer times') + ' · ' + city();
    var title = nextPrayerText();
    if (!title) title = prayer.prayerError && !prayer.prayerReady ? tr('Prayer times unavailable') : tr('Loading prayer times…');
    $('nextPrayer').textContent = title;
    var html = '';
    (prayer.prayers || []).forEach(function (p) {
      var next = !prayer.tomorrow && prayer.nextKey === p.key;
      html += '<div class="pt' + (next ? ' next' : '') + '"><span>' + esc(tr(PRAYER_NAMES[p.key] || p.key)) + '</span><b>' +
        (p.time ? esc(fmtHHMM(p.time)) : '—') + '</b></div>';
    });
    $('prayerTimes').innerHTML = html;
    var src = tr('Umm al-Qura · Saudi time');
    if (prayer.prayerError && prayer.prayerReady) src += ' · ' + tr('Saved copy');
    $('prayerSource').textContent = src;
  }

  // ================================================================ rendering: home
  function renderClock(now) {
    $('clock').textContent = fmtTime(now);
    $('date').textContent = fmtDate(now);
    var p = period(now.getHours());
    $('greet').textContent = tr(p === 'morning' ? 'Good morning' : p === 'afternoon' ? 'Good afternoon' : 'Good evening');
    var sub = '';
    if (weather) {
      var d = W.describe(weather.current.code);
      sub = tr(MOOD[d.kind][weather.current.isDay ? 0 : 1], { p: city() });
    }
    $('sub').textContent = sub;
    if (!$('ambient').hidden) renderAmbient(now);
  }

  function renderWeather() {
    var now = new Date(), card = $('weather');
    card.hidden = !settings.showWeather;
    if (!weather) {
      $('wxIcon').innerHTML = '';
      $('wxTemp').textContent = '--°';
      $('wxCond').textContent = weatherError ? tr('Weather unavailable') : tr('Loading weather…');
      $('wxHilo').textContent = city();
      $('wxDetails').innerHTML = weatherError ? '<span class="link">' + tr('Retry') + '</span>' : '';
      $('wxSun').innerHTML = '';
      card.dataset.action = weatherError ? 'retry-weather' : 'forecast';
      return;
    }
    card.dataset.action = 'forecast';
    var c = weather.current, d = W.describe(c.code), t = todayWx(now) || weather.daily[0];
    $('wxIcon').innerHTML = I.weather(d.kind, c.isDay);
    $('wxTemp').textContent = temp(c.temp);
    $('wxCond').textContent = d.label + ' · ' + city();
    $('wxHilo').textContent = t ? tr('High {high} · Low {low}', { high: temp(t.max), low: temp(t.min) }) : '';
    var stale = Date.now() - weather.fetchedAt > 60 * 60e3;
    $('wxDetails').innerHTML = '<span>' + esc(tr('Feels like {t}', { t: temp(c.feels) })) + '</span><span>' +
      esc(tr('Wind {w}', { w: wind(c.wind) })) + '</span><span>' + esc(tr('Humidity {h}', { h: Math.round(c.humidity) + '%' })) + '</span>' +
      (stale || weatherError ? '<span class="muted">' + esc(tr('Updated {time}', { time: fmtTime(new Date(weather.fetchedAt)) })) + '</span>' : '');
    var st = sunTimes(now);
    $('wxSun').innerHTML = '<span>' + I.ui.sunrise + esc(tr('Sunrise {time}', { time: fmtTime(st.rise) })) + '</span><span>' +
      I.ui.sunset + esc(tr('Sunset {time}', { time: fmtTime(st.set) })) + '</span>';
  }

  var skyKey = '';
  var precip = window.TVSky.Precip($('precip'), $('flash'));
  function renderSky(now) {
    if (shownWall !== 'scenery') { precip.set(null, 0); return; } // static wallpaper: the live scenery does no work at all
    var ph = phase(now), cur = weather ? weather.current : null;
    var d = cur ? W.describe(cur.code) : { kind: 'clear', intensity: 0 };
    var cloud = cur ? cur.cloud : 0.1;
    var key = [ph, Math.round(cloud * 10), d.kind, now.getDate()].join('|');
    if (key !== skyKey) {
      skyKey = key;
      window.TVSky.render($('sky'), { phase: ph, cloud: cloud, kind: d.kind, date: now });
      window.TVLandscape.render($('landscape'), { phase: ph, cloud: cloud, kind: d.kind });
      document.body.dataset.phase = ph;
    }
    precip.set(settings.effects ? d.kind : null, d.intensity);
  }

  function renderAll() {
    var now = new Date();
    try { renderClock(now); } catch (e) { fail('CLOCK', e); }
    try { renderWeather(); } catch (e) { fail('WEATHER', e); }
    try { renderSky(now); } catch (e) { fail('SKY', e); }
    try { renderPrayers(); } catch (e) { fail('PRAYERS', e); }
    $('prayer').hidden = !settings.showPrayers;
    document.body.classList.toggle('no-cards', !settings.showPrayers && !settings.showWeather);
  }

  // ================================================================ fonts (1.4.0)
  // Each bundled face is limited to its script with unicode-range (css/fonts.css), so the stack
  // "<English face>, <Arabic face>, system fallbacks" gives Latin text the English font and Arabic text the Arabic font.
  var FALLBACK = '"Noto Naskh Arabic UI", "Noto Naskh Arabic", Roboto, "Segoe UI", Tahoma, Arial, sans-serif';
  function fontStack(ar, en) { return FONT_EN[en].css + ', ' + FONT_AR[ar].css + ', ' + FALLBACK; }
  function applyFonts(ar, en) {
    var a = ar || settings.fontAr, e = en || settings.fontEn;
    document.documentElement.style.setProperty('--font', fontStack(a, e));
    document.body.dataset.fontAr = a;
    document.body.dataset.fontEn = e;
  }
  var FONT_SAMPLE = { ar: 'مرحبًا بك في Solitary TV · ٠١٢ 123', en: 'Welcome to Solitary TV · 12:30 PM' };
  /** Font picker: focus previews the font on the whole interface, OK keeps it, Back restores the saved font. */
  function openFontPicker(lang) {
    var table = lang === 'ar' ? FONT_AR : FONT_EN, key = lang === 'ar' ? 'fontAr' : 'fontEn', at = 0;
    var ids = Object.keys(table);
    var items = ids.map(function (id, i) {
      if (id === settings[key]) at = i;
      var stack = lang === 'ar' ? fontStack(id, settings.fontEn) : fontStack(settings.fontAr, id);
      return { label: table[id].name + '  —  ' + FONT_SAMPLE[lang], fontCss: stack, checked: id === settings[key],
        preview: function () { if (lang === 'ar') applyFonts(id, null); else applyFonts(null, id); },
        run: function () { settings[key] = id; save(); applyFonts(); renderSettingsRows(true); toast(tr('Font applied')); } };
    });
    openModal(tr(lang === 'ar' ? 'Arabic font' : 'English font'), items, { cls: 'fonts', focus: at, onClose: function () { applyFonts(); } });
  }

  // ================================================================ header logo (1.5.0)
  var LOGO_DEFAULT = 's03';
  var LOGO_WIDE = { s02: 1, s03: 1, s07: 1 }; // long wordmarks (aspect > 1.9 after the tight crop); the others are taller marks
  function logoId(v) { return v === 'default' ? LOGO_DEFAULT : v; }
  function logoLabel(v) { return v === 'default' ? tr('Default logo') : v === 'text' ? tr('Classic text (Solitary TV)') : tr('Logo {n}', { n: v.slice(1) }); }
  /** Shows the chosen STV logo in place of the old brand text (or the text itself for 'text'). */
  function applyLogo(preview) {
    var v = logoId(preview || settings.logo), img = $('brandLogo'), brand = $('brand');
    if (v === 'text') { img.hidden = true; brand.classList.remove('has-logo'); return; }
    var url = 'logos/stv-' + v.slice(1) + '.png';
    img.onerror = function () { fail('LOGO', url); img.hidden = true; brand.classList.remove('has-logo'); };
    img.onload = function () { img.hidden = false; brand.classList.add('has-logo'); };
    brand.classList.toggle('logo-wide', !!LOGO_WIDE[v]);
    if (img.getAttribute('src') !== url) img.setAttribute('src', url); else { img.hidden = false; brand.classList.add('has-logo'); }
  }
  /** Logo gallery: focus previews in the header, OK keeps it, Back restores the saved logo. */
  function openLogoGallery() {
    var ids = ['default', 's01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 'text'], at = 0;
    var items = ids.map(function (v, i) {
      if (v === settings.logo) at = i;
      var id = logoId(v);
      return { label: logoLabel(v), thumb: id === 'text' ? null : 'logos/stv-' + id.slice(1) + '-thumb.png', glyph: id === 'text' ? 'spark' : null,
        checked: v === settings.logo, cls: 'logo-item',
        preview: function () { applyLogo(v); },
        run: function () { settings.logo = v; save(); applyLogo(); renderSettingsRows(true); toast(tr('Logo applied')); } };
    });
    openModal(tr('App logo'), items, { cls: 'gallery logos', focus: at, onClose: function () { applyLogo(); } });
  }

  // ================================================================ wallpapers (1.3.0)
  var WALL_NAME = { w01: 'Midnight Blue', w02: 'Violet Atmosphere', w03: 'Deep Space', w04: 'Blue Light Flow', w05: 'Pure Dark',
    w06: 'Aurora Horizon', scenery: 'Live scenery (time & weather)' };
  var WALL_FILE = { w01: 'wall-01-midnight-blue', w02: 'wall-02-violet-atmosphere', w03: 'wall-03-deep-space',
    w04: 'wall-04-blue-light-flow', w05: 'wall-05-pure-dark', w06: 'wall-06-aurora-horizon' };
  var SS_FILE = { orbit: 'ss-dark-orbit', nebula: 'ss-nebula-drift', stars: 'ss-minimal-stars', waves: 'ss-abstract-waves' };
  var SS_NAME = { orbit: 'Dark Orbit', nebula: 'Nebula Drift', stars: 'Minimal Stars', waves: 'Abstract Waves', midnight: 'Midnight Gradient' };
  var userImages = [], shownWall = '';
  function loadUserImages() {
    try { userImages = has('listImages') ? JSON.parse(NATIVE.listImages() || '[]') : []; } catch (e) { userImages = []; }
    return userImages;
  }
  function userImage(id) { return userImages.filter(function (u) { return u.id === id; })[0] || null; }
  /** Full-size and thumbnail URL for any art id (wallpaper, screensaver style or user image); null if unknown. */
  function artUrl(id, thumb) {
    if (WALL_FILE[id]) return 'art/' + WALL_FILE[id] + (thumb ? '-thumb' : '') + '.jpg';
    if (SS_FILE[id]) return 'art/' + SS_FILE[id] + (thumb ? '-thumb' : '') + '.jpg';
    var u = userImage(id);
    return u ? (thumb ? u.thumb : u.url) : null;
  }
  function artName(id) {
    if (WALL_NAME[id]) return tr(WALL_NAME[id]);
    if (SS_NAME[id]) return tr(SS_NAME[id]);
    var u = userImage(id);
    return u ? tr('My image') + ' · ' + fmtDate(new Date(u.at)) : tr('Image not available');
  }
  var wallLoadToken = 0;
  /** Shows a wallpaper (the saved one unless `preview` is given). A missing/broken image falls back to the default. */
  function applyWallpaper(preview) {
    var id = preview || settings.wallpaper, token = ++wallLoadToken;
    var scenery = id === 'scenery';
    $('wall').hidden = scenery;
    ['sky', 'landscape', 'precip'].forEach(function (n) { $(n).hidden = !scenery; });
    document.body.dataset.wallFit = settings.wallFit;
    document.body.dataset.wallDim = settings.wallDim;
    if (scenery) { shownWall = 'scenery'; skyKey = ''; renderSky(new Date()); return; }
    var url = artUrl(id, false);
    if (!url) { // e.g. a user image that was removed, or a restored backup that points to an image not on this TV
      if (!preview && id !== 'w01') { log('WALLPAPER_FALLBACK', id); settings.wallpaper = 'w01'; save(); }
      id = 'w01'; url = artUrl('w01', false);
    }
    var img = new Image();
    img.onload = function () {
      if (token !== wallLoadToken) return;
      $('wallImg').style.backgroundImage = 'url("' + url + '")';
      shownWall = id;
      precip.set(null, 0);
    };
    img.onerror = function () {
      if (token !== wallLoadToken) return;
      fail('WALLPAPER_IMAGE', id);
      if (id !== 'w01') { $('wallImg').style.backgroundImage = 'url("' + artUrl('w01', false) + '")'; shownWall = 'w01'; toast(tr('Wallpaper unavailable — showing the default')); }
    };
    img.src = url;
  }

  // ================================================================ tiles
  function tileHtml(a, extra) {
    var name = esc(appName(a));
    var badges = '';
    if (extra && extra.badges) {
      if (isFav(a.id)) badges += '<i class="badge">' + I.ui.heart + '</i>';
      if (homeIndex(a.id) >= 0) badges += '<i class="badge">' + I.ui.home + '</i>';
    }
    var visual = a.icon ? '<img alt="" src="' + esc(a.icon) + '">' : '<span class="glyph">' + (a.system ? I.ui.sliders : esc(name.charAt(0))) + '</span>';
    return '<span class="art">' + visual + '</span><span class="name">' + name + '</span>' + (badges ? '<span class="badges">' + badges + '</span>' : '');
  }
  function wireImages(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.art img'), function (img) {
      function done() {
        var art = img.parentNode;
        if (img.naturalWidth > img.naturalHeight * 1.3) art.classList.add('banner');
        else art.classList.add('icon');
      }
      function failed() {
        var art = img.parentNode, tile = art && art.parentNode;
        if (!art || !tile) return;
        art.innerHTML = '<span class="glyph">' + esc((tile.querySelector('.name') || {}).textContent || '?').charAt(0) + '</span>';
      }
      img.onerror = failed;
      if (img.complete) { if (img.naturalWidth) done(); else failed(); } // already settled (cache hit or earlier failure)
      else img.onload = done;
    });
  }

  function renderHome() {
    var html = '';
    for (var i = 0; i < SLOTS; i++) {
      var a = app(settings.homeSlots[i]);
      var moving = reorder && reorder.list === 'home' && reorder.index === i ? ' moving' : '';
      if (a) html += '<button class="tile slot focusable' + moving + '" data-app="' + esc(a.id) + '" data-slot="' + i + '">' + tileHtml(a) + '</button>';
      else html += '<button class="tile slot empty focusable' + moving + '" data-slot="' + i + '" data-empty="1"><span class="art"><span class="glyph">' +
        I.ui.plus + '</span></span><span class="name">' + esc(tr('Add app')) + '</span></button>';
    }
    $('homeGrid').innerHTML = html;
    wireImages($('homeGrid'));
  }

  function renderAppsPage() {
    var grid = $('appsGrid'), list = searchResults(), q = normalizeText(searchQuery);
    grid.innerHTML = list.length ? list.map(function (a) {
      return '<button class="tile focusable" data-app="' + esc(a.id) + '" data-list="apps">' + tileHtml(a, { badges: true }) + '</button>';
    }).join('') : '<div class="empty">' + esc(q ? tr('No apps match “{q}”', { q: searchQuery.trim() }) : tr('No apps to show')) + '</div>';
    $('appsCount').textContent = q ? tr(list.length === 1 ? '{count} result' : '{count} results', { count: list.length }) : tr(allApps.length === 1 ? '{count} app' : '{count} apps', { count: allApps.length });
    $('searchClear').hidden = !q;
    $('searchHint').hidden = !!$('searchInput').value;
    wireImages(grid);
  }

  function favApps() { return settings.favorites.map(app).filter(Boolean); }
  function renderFavPage() {
    var list = favApps();
    var html = list.map(function (a, i) {
      var moving = reorder && reorder.list === 'fav' && reorder.index === i ? ' moving' : '';
      return '<button class="tile focusable' + moving + '" data-app="' + esc(a.id) + '" data-list="fav" data-index="' + i + '">' + tileHtml(a, { badges: false }) + '</button>';
    }).join('');
    html += '<button class="tile empty focusable" data-action="add-favorite"><span class="art"><span class="glyph">' + I.ui.plus +
      '</span></span><span class="name">' + esc(tr('Add favorite')) + '</span></button>';
    $('favGrid').innerHTML = html;
    $('favCount').textContent = list.length ? tr(list.length === 1 ? '{count} app' : '{count} apps', { count: list.length }) : tr('No favorites yet');
    wireImages($('favGrid'));
  }

  // ================================================================ categories: nav tabs, Home rows, category page (1.3.0)
  var currentCat = null;
  function catLabel(c) { return M.label(c, tr); }
  function visibleCats() { return settings.categories.filter(function (c) { return !c.hidden; }); }
  function catApps(c) { return M.appsOf(c, app, settings.recent, appName, L.isArabic() ? 'ar' : 'en'); }
  var NAV_ICON = { live: 'live', film: 'film', star: 'star', music: 'music', folder: 'folder' };
  function navBtn(attrs, icon, text, active) {
    return '<button class="nav-btn focusable' + (active ? ' active' : '') + '" ' + attrs + '><span>' + (I.ui[icon] || '') + '</span><b>' + esc(text) + '</b></button>';
  }
  /** Top bar: Home · Apps · Favorites · [category tabs] · Store · Settings · screensaver · quick panel. */
  function renderNav() {
    var focusedNav = focused && focused.closest && focused.closest('#nav') ? (focused.dataset.cat ? 'cat:' + focused.dataset.cat : focused.dataset.nav || focused.dataset.action) : null;
    var h = navBtn('data-nav="home"', 'home', tr('Home'), page === 'home') + navBtn('data-nav="apps"', 'grid', tr('Apps'), page === 'apps') +
      navBtn('data-nav="favorites"', 'heart', tr('Favorites'), page === 'favorites');
    visibleCats().forEach(function (c) {
      if (c.tab) h += navBtn('data-nav="category" data-cat="' + esc(c.id) + '"', NAV_ICON[c.icon] || 'folder', catLabel(c), page === 'category' && currentCat === c.id);
    });
    h += navBtn('data-nav="store"', 'bag', tr('Store'), page === 'store') + navBtn('data-nav="settings"', 'sliders', tr('Settings'), page === 'settings');
    h += '<button class="nav-btn nav-icon focusable" data-action="ambient" aria-label="' + esc(tr('Screensaver')) + '"><span>' + I.ui.moon + '</span></button>' +
      '<button class="nav-btn nav-icon focusable" data-action="quickpanel" aria-label="' + esc(tr('Quick panel')) + '"><span>' + I.ui.panel + '</span></button>';
    $('nav').innerHTML = h;
    if (focusedNav) {
      var again = focusedNav.indexOf('cat:') === 0 ? $('nav').querySelector('[data-cat="' + focusedNav.slice(4) + '"]')
        : $('nav').querySelector('[data-nav="' + focusedNav + '"]:not([data-cat])') || $('nav').querySelector('[data-action="' + focusedNav + '"]');
      focusEl(again || activeNav());
    } else keepActiveNavVisible();
  }
  function activeNav() {
    return page === 'category' ? $('nav').querySelector('[data-cat="' + currentCat + '"]') : $('nav').querySelector('[data-nav="' + page + '"]:not([data-cat])');
  }
  function keepActiveNavVisible() { var a = activeNav(); if (a) scrollIntoRow(a, true); else updateNavFade(); }

  // 1.4.0: Home is back to the original design (clock, weather, prayer, 5 slots only). Category rows are no
  // longer rendered; categories live in their own top-bar pages. Stored row settings are kept untouched.
  function renderHomeRows() { if ($('homeRows').innerHTML) $('homeRows').innerHTML = ''; }

  function renderCatPage() {
    var c = currentCat && M.find(settings, currentCat);
    if (!c) { $('catGrid').innerHTML = ''; return; }
    var list = catApps(c);
    $('catTitle').textContent = catLabel(c);
    $('catCount').textContent = list.length ? tr(list.length === 1 ? '{count} app' : '{count} apps', { count: list.length }) : tr('No apps in this category yet');
    $('catSort').textContent = tr('Sort') + ': ' + tr(SORT_LABEL[c.sort]);
    $('catGrid').innerHTML = list.map(function (a, i) {
      var moving = reorder && reorder.list === 'cat' && reorder.index === i ? ' moving' : '';
      return '<button class="tile focusable' + moving + '" data-app="' + esc(a.id) + '" data-list="cat" data-index="' + i + '">' + tileHtml(a) + '</button>';
    }).join('') + '<button class="tile empty focusable" data-action="cat-edit" data-cat="' + esc(c.id) + '"><span class="art"><span class="glyph">' + I.ui.plus +
      '</span></span><span class="name">' + esc(tr('Add apps')) + '</span></button>';
    wireImages($('catGrid'));
  }
  var SORT_LABEL = { manual: 'Manual', alpha: 'Alphabetical', recent: 'Recently used' };

  var STORES = [
    { id: 'com.android.vending', title: 'Google Play Store', desc: 'Official Android TV app store' },
    { id: 'com.hkinnovate.downloader_for_tv', desc: 'Download files and installers by URL' },
    { id: 'com.esaba.downloader', desc: 'Download files and installers by URL' },
    { id: 'com.downloader.tv.installer.xapk', desc: 'Install APK and XAPK packages' },
    { id: 'cm.aptoide.pt', desc: 'Official Android TV app store' }
  ];
  function renderStore() {
    var found = STORES.filter(function (s) { return app(s.id); });
    $('storeList').innerHTML = found.length ? found.map(function (s) {
      var a = app(s.id);
      return '<button class="store-item focusable" data-app="' + esc(a.id) + '" data-list="store">' +
        '<span class="art">' + (a.icon ? '<img alt="" src="' + esc(a.icon) + '">' : '<span class="glyph">' + I.ui.bag + '</span>') + '</span>' +
        '<span class="store-text"><b>' + esc(s.title ? tr(s.title) : appName(a)) + '</b><span>' + esc(tr(s.desc)) + '</span></span>' +
        '<span class="store-go">' + esc(tr('Open')) + '</span></button>';
    }).join('') + '<div class="note">' + esc(tr('Back returns to Solitary TV')) + '</div>' :
      '<div class="empty">' + esc(tr('No app store found on this receiver')) + '</div>';
    wireImages($('storeList'));
  }

  function renderApps() {
    try { renderHome(); } catch (e) { fail('HOME_TILES', e); }
    try { renderHomeRows(); } catch (e) { fail('HOME_ROWS', e); }
    try { renderAppsPage(); } catch (e) { fail('APPS_PAGE', e); }
    try { renderFavPage(); } catch (e) { fail('FAV_PAGE', e); }
    try { renderCatPage(); } catch (e) { fail('CAT_PAGE', e); }
    try { renderStore(); } catch (e) { fail('STORE', e); }
    if (page === 'settings') renderSettingsRows(true);
    restoreFocus();
  }

  // ================================================================ settings page
  var TABS = ['appearance', 'screensaver', 'categories', 'homescreen', 'favorites', 'sound', 'widgets', 'quickpanel', 'system', 'backup'];
  var TAB_LABEL = { appearance: 'Appearance', screensaver: 'Screensaver', categories: 'Categories', homescreen: 'Home screen',
    favorites: 'Favorites', sound: 'Interface sounds', widgets: 'Widgets', quickpanel: 'Quick panel', system: 'System & general', backup: 'Backup & restore' };
  var CHOICES = {
    language: { label: 'Language', values: [['ar-SA', 'العربية'], ['en-GB', 'English']] },
    clock: { label: 'Clock format', values: [['12', '12-hour'], ['24', '24-hour']] },
    unit: { label: 'Temperature', values: [['C', 'Celsius'], ['F', 'Fahrenheit']] },
    scenery: { label: 'Live scenery time', values: [['auto', 'Time & weather'], ['night', 'Night'], ['dawn', 'Dawn'], ['day', 'Day'], ['dusk', 'Dusk']] },
    effects: { label: 'Rain & snow effects', values: [[true, 'On'], [false, 'Off']] },
    showWeather: { label: 'Weather card', values: [[true, 'Shown'], [false, 'Hidden']] },
    showPrayers: { label: 'Prayer card', values: [[true, 'Shown'], [false, 'Hidden']] },
    focus3d: { label: '3D focus effect', values: [[true, 'On'], [false, 'Off']] },
    focusStrength: { label: '3D focus strength', values: [['light', 'Light'], ['medium', 'Medium'], ['strong', 'Strong']] },
    focusSpeed: { label: 'Animation speed', values: [['fast', 'Fast'], ['normal', 'Normal'], ['calm', 'Calm']] },
    motion: { label: 'Animation', values: [['full', 'Full'], ['reduced', 'Reduced']] },
    theme: { label: 'Theme', values: [['cinematic', 'Cinematic (blue glow)'], ['classic', 'Classic (white ring)']] },
    wallFit: { label: 'Display mode', values: [['fill', 'Fill (stretch)'], ['fit', 'Fit (whole image)'], ['crop', 'Center crop']] },
    wallDim: { label: 'Background dimming', values: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
    ssOn: { label: 'Screensaver', values: [[true, 'On'], [false, 'Off']] },
    ssIdle: { label: 'Start after', values: [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'],
      [20, '20 minutes'], [30, '30 minutes'], [60, '60 minutes'], [0, 'Never']] },
    ssSlide: { label: 'Slideshow', values: [[false, 'Off'], [true, 'On']] },
    ssSlideEvery: { label: 'Change every', values: [[0.5, '30 seconds'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes']] },
    ssShuffle: { label: 'Shuffle', values: [[true, 'On'], [false, 'Off']] },
    ssClock: { label: 'Clock', values: [[true, 'Shown'], [false, 'Hidden']] },
    ssClockStyle: { label: 'Clock style', values: [['digital', 'Digital'], ['minimal', 'Minimal']] },
    ssHour12: { label: 'Clock format', values: [[true, '12-hour'], [false, '24-hour']] },
    ssAmPm: { label: 'AM / PM', values: [[true, 'Shown'], [false, 'Hidden']] },
    ssDate: { label: 'Date', values: [[true, 'Shown'], [false, 'Hidden']] },
    ssWeather: { label: 'Weather', values: [[true, 'Shown'], [false, 'Hidden']] },
    ssPrayer: { label: 'Next prayer', values: [[true, 'Shown'], [false, 'Hidden']] },
    ssDim: { label: 'Dimming', values: [[0, 'Off'], [25, 'Low'], [50, 'Medium'], [70, 'High']] },
    sndOn: { label: 'Interface sounds', values: [[true, 'On'], [false, 'Off']] },
    sndStyle: { label: 'Sound style', values: [['soft', 'Soft'], ['whisper', 'Whisper'], ['minimal', 'Minimal'], ['cinematic', 'Cinematic']] },
    sndLevel: { label: 'Sound level', values: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
    qpMenuKey: { label: 'Menu button opens the panel', values: [[true, 'On'], [false, 'Off']] },
    qpNetwork: { label: 'Show network info', values: [[true, 'Shown'], [false, 'Hidden']] }
  };
  var settingsTab = 'appearance';
  function choiceValue(key) {
    var c = CHOICES[key], v = c.values.filter(function (x) { return x[0] === settings[key]; })[0] || c.values[0];
    return tr(v[1]);
  }
  function row(attrs, label, value, cls) {
    return '<button class="srow focusable' + (cls ? ' ' + cls : '') + '" ' + attrs + '><span>' + esc(label) + '</span>' +
      (value !== undefined && value !== null ? '<b>' + esc(value) + '</b>' : '') + '</button>';
  }
  function renderSettingsTabs() {
    var hadFocus = focused && focused.classList.contains('stab');
    $('settingsTabs').innerHTML = TABS.map(function (t) {
      return '<button class="stab focusable' + (t === settingsTab ? ' active' : '') + '" data-tab="' + t + '">' + esc(tr(TAB_LABEL[t])) + '</button>';
    }).join('');
    if (hadFocus) focusEl($('settingsTabs').querySelector('.stab.active'));
  }
  function renderSettingsRows(keepFocus) {
    var key = keepFocus && focused && focused.closest('#settingsRows') ? rowKey(focused) : null;
    var h = '', ch = function (k) { return row('data-choice="' + k + '"', tr(CHOICES[k].label), choiceValue(k)); };
    var head = function (t) { return '<div class="sgroup">' + esc(t) + '</div>'; };
    if (settingsTab === 'appearance') {
      h = head(tr('App logo')) + row('data-action="logo"', tr('App logo'), logoLabel(settings.logo), 'accent') +
        head(tr('Wallpaper')) + row('data-action="wallpapers"', tr('Wallpapers'), artName(settings.wallpaper), 'accent') +
        ch('wallFit') + ch('wallDim') + (settings.wallpaper === 'scenery' ? ch('scenery') + ch('effects') : '') +
        head(tr('Fonts')) + row('data-action="font-ar"', tr('Arabic font'), FONT_AR[settings.fontAr].name) +
        row('data-action="font-en"', tr('English font'), FONT_EN[settings.fontEn].name) +
        (settings.fontAr !== 'system' || settings.fontEn !== 'system' ? row('data-action="font-reset"', tr('Restore default fonts'), null) : '') +
        head(tr('Look & motion')) + ch('theme') + ch('motion') + ch('focus3d') + ch('focusStrength') + ch('focusSpeed');
    } else if (settingsTab === 'screensaver') {
      h = ch('ssOn') + ch('ssIdle') + row('data-action="ss-preview"', tr('Preview screensaver'), null, 'accent') +
        head(tr('What to show')) + row('data-action="ss-style"', tr('Screensaver'), settings.ssSlide ? tr('Slideshow') : artName(settings.ssStyle)) +
        ch('ssSlide') + (settings.ssSlide ? row('data-action="ss-items"', tr('Slideshow pictures'), tr('{n} selected', { n: slideItems().length })) + ch('ssSlideEvery') + ch('ssShuffle') : '') +
        ch('ssDim') + head(tr('On screen')) + ch('ssClock') + ch('ssClockStyle') + ch('ssHour12') + (settings.ssHour12 ? ch('ssAmPm') : '') + ch('ssDate') + ch('ssWeather') + ch('ssPrayer') +
        head(tr('Android system screensaver')) + row('data-info="dream"', tr('System screensaver'), dreamStatus(), 'info wrap');
    } else if (settingsTab === 'categories') {
      h = settings.categories.map(function (c) {
        var n = catApps(c).length, bits = [tr(n === 1 ? '{count} app' : '{n} apps', { n: n, count: n })];
        if (c.hidden) bits.push(tr('Hidden')); else if (!c.tab) bits.push(tr('No tab'));
        return row('data-catrow="' + esc(c.id) + '"', catLabel(c), bits.join(' · '), c.hidden ? 'dim' : '');
      }).join('');
      h += row('data-action="cat-new"', '+ ' + tr('New category'), null, 'accent');
    } else if (settingsTab === 'homescreen') {
      h = head(tr('Your apps (5 slots)'));
      for (var i = 0; i < SLOTS; i++) {
        var a = app(settings.homeSlots[i]);
        h += row('data-slotrow="' + i + '"', tr('Slot {n}', { n: i + 1 }), a ? appName(a) : tr('Empty slot'), a ? '' : 'dim');
      }
    } else if (settingsTab === 'favorites') {
      h = favApps().map(function (a, i) { return row('data-favrow="' + i + '" data-id="' + esc(a.id) + '"', (i + 1) + '. ' + appName(a), null); }).join('');
      h += row('data-action="add-favorite"', '+ ' + tr('Add favorite'), null, 'accent');
    } else if (settingsTab === 'sound') {
      h = ch('sndOn') + ch('sndStyle') + ch('sndLevel') + row('data-action="snd-preview"', tr('Preview sound'), null, 'accent');
    } else if (settingsTab === 'widgets') {
      h = head(tr('Clock')) + ch('clock') + head(tr('Weather')) + ch('showWeather') + ch('unit') +
        row('data-action="retry-weather"', tr('Refresh weather now'), weather ? tr('Updated {time}', { time: fmtTime(new Date(weather.fetchedAt)) }) : '') +
        row('data-info="city"', tr('City'), city(), 'info') + head(tr('Prayer times')) + ch('showPrayers') +
        row('data-action="refresh-prayer"', tr('Refresh prayer times now'), prayer.prayerUpdated ? tr('Updated {time}', { time: fmtTime(new Date(prayer.prayerUpdated)) }) : '') +
        row('data-info="method"', tr('Prayer method'), L.isArabic() ? 'أم القرى' : 'Umm al-Qura', 'info') +
        row('data-info="tz"', tr('Time zone'), tr('Saudi Arabia (Riyadh)'), 'info');
    } else if (settingsTab === 'quickpanel') {
      h = ch('qpMenuKey') + ch('qpNetwork') + settings.qpOrder.map(function (id) {
        return row('data-qprow="' + id + '"', tr(QP_LABEL[id]), tr(settings.qpHidden.indexOf(id) >= 0 ? 'Hidden' : 'Shown'), settings.qpHidden.indexOf(id) >= 0 ? 'dim' : '');
      }).join('') + row('data-action="quickpanel"', tr('Open quick panel'), null, 'accent');
    } else if (settingsTab === 'system') {
      var hs = homeStatus(), v = {};
      try { v = NATIVE ? JSON.parse(NATIVE.appVersion()) : { name: 'preview', code: 0, package: 'tv.customhome.launcher' }; } catch (e) { v = {}; }
      h = ch('language') + head(tr('Home button')) +
        row('data-info="home"', tr('Default Home app'), hs.isDefault ? 'Solitary TV' : hs.holder === 'tv.nexus.launcher' ? 'SMART TV' : hs.holder || '—', 'info');
      if (!hs.isDefault && hs.roleRequest) h += row('data-action="home-request"', tr('Make Solitary TV the default Home'), null, 'accent');
      if (has('openHomeSettings')) h += row('data-action="home-settings"', tr('Choose the default Home app'), tr('Android settings'));
      if (has('openLauncher') && NATIVE.isInstalled('tv.nexus.launcher')) h += row('data-action="open-smarttv"', tr('Open SMART TV'), null);
      h += head(tr('General')) + row('data-action="android-settings"', tr('Open Android settings'), null) +
        row('data-action="remote-help"', tr('Remote control help'), null) +
        row('data-info="version"', tr('Version'), (v.name || '') + ' (' + (v.code || '') + ')', 'info') +
        row('data-info="package"', tr('Package'), v.package || '', 'info') +
        row('data-info="updates"', tr('Updates'), tr('Installed manually (no automatic updates)'), 'info');
    } else if (settingsTab === 'backup') {
      var at = has('backupTime') ? NATIVE.backupTime() : 0;
      h = row('data-action="backup-save"', tr('Save backup now'), tr('Last backup') + ': ' + (at ? fmtDate(new Date(at)) + ' ' + fmtTime(new Date(at)) : tr('Never'))) +
        row('data-action="backup-export"', tr('Export backup to Downloads'), null) +
        row('data-action="backup-restore"', tr('Restore last backup'), null) +
        row('data-action="backup-import"', tr('Restore from a backup file'), null) +
        row('data-action="import-smarttv"', tr('Import SMART TV favorites'), null);
    }
    $('settingsRows').innerHTML = h;
    if (key) { var again = $('settingsRows').querySelector(key); if (again) focusEl(again); }
  }
  function rowKey(el) {
    var attrs = ['data-choice', 'data-slotrow', 'data-favrow', 'data-qprow', 'data-catrow', 'data-homerow', 'data-action', 'data-info'];
    for (var i = 0; i < attrs.length; i++) if (el.hasAttribute(attrs[i])) return '[' + attrs[i] + '="' + el.getAttribute(attrs[i]) + '"]';
    return null;
  }
  function selectTab(tab) {
    if (settingsTab === tab) return;
    settingsTab = tab;
    Array.prototype.forEach.call($('settingsTabs').children, function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    renderSettingsRows(false);
    $('settingsRows').scrollTop = 0;
  }

  // ================================================================ pages
  var page = 'home', focused = null, memory = {};
  function showPage(name, focusTarget, catId) {
    if (PAGES.indexOf(name) < 0) name = 'home';
    if (name === 'category' && !(catId && M.find(settings, catId))) name = 'home';
    if (focused && pageOf(focused) === page) memory[page] = focused;
    if (name === 'category' && currentCat !== catId) { memory.category = null; currentCat = catId; }
    if (reorder) endReorder();
    page = name;
    document.body.dataset.page = name;
    PAGES.forEach(function (p) { $('page-' + p).hidden = p !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn[data-nav]'), function (b) {
      b.classList.toggle('active', b.dataset.nav === name && (name !== 'category' || b.dataset.cat === currentCat));
    });
    if (name === 'settings') { renderSettingsTabs(); renderSettingsRows(false); }
    if (name === 'category') { renderCatPage(); $('catScroller').scrollTop = 0; }
    if (focusTarget === 'nav') focusEl(activeNav());
    else focusEl(focusTarget || firstIn(name));
    keepActiveNavVisible();
    updateHint();
  }
  function firstIn(name) {
    if (name === 'home') return $('homeGrid').querySelector('.tile');
    if (name === 'category') return $('catGrid').querySelector('.tile');
    if (name === 'settings') return $('settingsTabs').querySelector('.stab.active') || $('settingsTabs').querySelector('.stab');
    if (name === 'apps') return $('appsGrid').querySelector('.tile') || $('searchBox');
    return $('page-' + name).querySelector('.focusable');
  }
  function pageOf(el) {
    var p = el && el.closest && el.closest('.page');
    return p ? p.id.replace('page-', '') : null;
  }
  function restoreFocus() {
    if (modalOpen() || qpOpen() || !$('ambient').hidden) return;
    if (focused && document.contains(focused) && isVisible(focused)) { focused.classList.add('focused'); return; }
    var d = focused && focused.dataset, key = null;
    if (d) {
      if (d.app && d.row) key = '[data-row="' + d.row + '"][data-app="' + d.app + '"]';
      else if (d.app) key = '[data-app="' + d.app + '"]';
      else if (d.slot) key = '[data-slot="' + d.slot + '"]';
    }
    var again = key && $('page-' + page).querySelector(key);
    focusEl(again || firstIn(page) || activeNav());
  }

  // ================================================================ focus engine
  function isVisible(el) { return !!el && el.offsetParent !== null && !el.closest('[hidden]'); }
  function scopeRoots() {
    if (modalOpen()) return [$('modalBox')];
    if (qpOpen()) return [$('qpanel')];
    if (reorder) return [];
    return [$('topbar'), $('page-' + page)];
  }
  function candidates() {
    var out = [];
    scopeRoots().forEach(function (root) {
      Array.prototype.forEach.call(root.querySelectorAll('.focusable'), function (el) { if (isVisible(el)) out.push(el); });
    });
    return out;
  }
  function focusEl(el) {
    if (!el) return;
    if (focused && focused !== el) focused.classList.remove('focused');
    focused = el;
    el.classList.add('focused');
    var scroller = el.closest('.scroller');
    if (scroller) {
      var r = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      var scale = sr.height / (scroller.offsetHeight || 1) || 1, inset = 30;
      var top = (r.top - sr.top) / scale + scroller.scrollTop, height = r.height / scale;
      if (top - inset < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - inset);
      else if (top + height + inset > scroller.scrollTop + scroller.clientHeight)
        scroller.scrollTop = top + height + inset - scroller.clientHeight;
    }
    if (el.closest('.hscroll')) scrollIntoRow(el, !!el.closest('#nav'));
    if (page === 'home' && el.closest('#topbar') && $('homeScroll').scrollTop) $('homeScroll').scrollTop = 0; // show the clock again
    if (el.classList.contains('stab')) selectTab(el.dataset.tab);
    if (pageOf(el)) memory[pageOf(el)] = el;
    if (el.classList.contains('mitem') && modalOpen()) { var it = currentItems[+el.dataset.item]; if (it && it.preview) it.preview(); }
    updateHint();
  }
  /** Horizontal rows and the top bar scroll inside their own box; `center` keeps the element near the middle. */
  function scrollIntoRow(el, center) {
    var box = el.closest('.hscroll');
    if (!box) return;
    var r = el.getBoundingClientRect(), b = box.getBoundingClientRect(), sc = b.width / (box.offsetWidth || 1) || 1;
    if (center) box.scrollLeft += ((r.left + r.right) / 2 - (b.left + b.right) / 2) / sc;
    else {
      var pad = 70 * sc;
      if (r.left < b.left + pad) box.scrollLeft -= (b.left + pad - r.left) / sc;
      else if (r.right > b.right - pad) box.scrollLeft += (r.right - (b.right - pad)) / sc;
    }
    if (box.id === 'nav') setTimeout(updateNavFade, 260); // after the smooth scroll settles
  }
  /** Soft fade on the side(s) of the top bar that have more tabs, instead of a hard cut through a label. */
  function updateNavFade() {
    var box = $('nav'), first = box.firstElementChild, last = box.lastElementChild;
    if (!first) return;
    var b = box.getBoundingClientRect(), a = first.getBoundingClientRect(), z = last.getBoundingClientRect();
    var leftEdge = Math.min(a.left, z.left), rightEdge = Math.max(a.right, z.right);
    box.classList.toggle('more-left', leftEdge < b.left - 2);
    box.classList.toggle('more-right', rightEdge > b.right + 2);
  }
  function move(dir) {
    var list = candidates();
    if (!focused || list.indexOf(focused) < 0) {
      var again = focused && focused.dataset && focused.dataset.choice && $('settingsRows').querySelector('[data-choice="' + focused.dataset.choice + '"]');
      focusEl(again || (modalOpen() ? list[0] : (memory[page] && document.contains(memory[page]) && isVisible(memory[page]) ? memory[page] : firstIn(page))) || list[0]);
      return;
    }
    // From the navigation bar going down: return to where the user was on this page.
    if (dir === 'down' && focused.closest('#topbar') && !modalOpen()) {
      var remembered = memory[page];
      if (remembered && document.contains(remembered) && isVisible(remembered)) { focusEl(remembered); return; }
    }
    // From a settings tab sideways into the rows: land on the first row.
    if ((dir === 'left' || dir === 'right') && focused.classList.contains('stab')) {
      var rowsBox = $('settingsRows').getBoundingClientRect(), tb = focused.getBoundingClientRect();
      if ((dir === 'left' && rowsBox.right <= tb.left) || (dir === 'right' && rowsBox.left >= tb.right)) {
        var firstRow = $('settingsRows').querySelector('.focusable');
        if (firstRow) focusEl(firstRow);
        return;
      }
    }
    // From a settings row sideways into the tab column: land on the active tab.
    if ((dir === 'left' || dir === 'right') && focused.closest('#settingsRows')) {
      var tabs = $('settingsTabs').getBoundingClientRect(), fr = focused.getBoundingClientRect();
      if ((dir === 'left' && tabs.right <= fr.left) || (dir === 'right' && tabs.left >= fr.right)) {
        focusEl($('settingsTabs').querySelector('.stab.active')); return;
      }
    }
    var a = focused.getBoundingClientRect(), ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    var best = null, bestScore = Infinity;
    list.forEach(function (el) {
      if (el === focused) return;
      var b = el.getBoundingClientRect(), bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2, primary, overlap, cross;
      if (dir === 'left') { if (bx >= ax - 4) return; primary = Math.max(0, a.left - b.right); }
      if (dir === 'right') { if (bx <= ax + 4) return; primary = Math.max(0, b.left - a.right); }
      if (dir === 'up') { if (by >= ay - 4) return; primary = Math.max(0, a.top - b.bottom); }
      if (dir === 'down') { if (by <= ay + 4) return; primary = Math.max(0, b.top - a.bottom); }
      if (dir === 'left' || dir === 'right') {
        overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap <= 0) return; // left/right stay on the same row
        cross = Math.abs(by - ay) * 0.2;
      } else {
        overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        cross = overlap > 0 ? Math.abs(bx - ax) * 0.2 : Math.abs(bx - ax) * 2;
      }
      var score = primary + cross;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    // Entering the navigation bar from a page always lands on the current page's tab.
    if (best && dir === 'up' && best.closest('#topbar') && !focused.closest('#topbar') && !modalOpen()) {
      best = activeNav() || best;
    }
    if (best) { focusEl(best); snd('move'); }
  }

  // ================================================================ reorder mode
  var reorder = null; // { list: 'home'|'fav', index }
  function startReorder(list, index) {
    reorder = { list: list, index: index };
    rerenderReorder();
  }
  function rerenderReorder() {
    if (!reorder) return;
    if (reorder.list === 'home') { renderHome(); focusEl($('homeGrid').querySelector('[data-slot="' + reorder.index + '"]')); }
    else if (reorder.list === 'cat') { renderCatPage(); focusEl($('catGrid').querySelector('[data-index="' + reorder.index + '"]')); }
    else { renderFavPage(); focusEl($('favGrid').querySelector('[data-index="' + reorder.index + '"]')); }
    updateHint();
  }
  function reorderMove(dir) {
    var arr = reorder.list === 'home' ? settings.homeSlots : settings.favorites;
    var rtl = document.documentElement.dir === 'rtl', step = 0;
    if (dir === 'left') step = rtl ? 1 : -1;
    if (dir === 'right') step = rtl ? -1 : 1;
    if (reorder.list !== 'home' && (dir === 'up' || dir === 'down')) step = (dir === 'up' ? -1 : 1) * gridColumns($(reorder.list === 'cat' ? 'catGrid' : 'favGrid'));
    if (reorder.list === 'cat') {
      var c = M.find(settings, currentCat), vis = c ? catApps(c) : [];
      var j = c ? M.reorderApp(settings, c.id, (vis[reorder.index] || {}).id, step, function (id) { return !!app(id); }) : -1;
      if (j < 0) return;
      reorder.index = j; save(); rerenderReorder(); snd('move');
      return;
    }
    var limit = reorder.list === 'home' ? SLOTS : favApps().length;
    var to = reorder.index + step;
    if (!step || to < 0 || to >= limit) return;
    snd('move');
    if (reorder.list === 'fav') { // favorites may contain uninstalled ids: reorder the visible list only
      var visible = favApps().map(function (a) { return a.id; });
      var item = visible.splice(reorder.index, 1)[0];
      visible.splice(to, 0, item);
      var hiddenIds = settings.favorites.filter(function (id) { return visible.indexOf(id) < 0; });
      settings.favorites = visible.concat(hiddenIds);
    } else {
      var tmp = arr[to]; arr[to] = arr[reorder.index]; arr[reorder.index] = tmp;
    }
    reorder.index = to;
    save();
    rerenderReorder();
  }
  function endReorder() {
    var r = reorder;
    reorder = null;
    if (!r) return;
    if (r.list === 'home') { renderHome(); focusEl($('homeGrid').querySelector('[data-slot="' + r.index + '"]')); }
    else if (r.list === 'cat') { renderCatPage(); focusEl($('catGrid').querySelector('[data-index="' + r.index + '"]')); }
    else { renderFavPage(); focusEl($('favGrid').querySelector('[data-index="' + r.index + '"]')); }
    renderAppsPage();
    renderHomeRows();
    updateHint();
  }
  function gridColumns(grid) {
    var tiles = grid.querySelectorAll('.tile'), cols = 0;
    if (!tiles.length) return 1;
    var top = tiles[0].offsetTop;
    for (var i = 0; i < tiles.length && tiles[i].offsetTop === top; i++) cols++;
    return Math.max(1, cols);
  }

  // ================================================================ modal (menus, pickers, forecast)
  var modalStack = [];
  function modalOpen() { return !$('modal').hidden; }
  function openModal(title, items, opts) {
    opts = opts || {};
    if (modalOpen()) modalStack.push({ title: $('modalTitle').textContent, html: $('modalBody').innerHTML, items: currentItems, cls: $('modalBox').className });
    else { modalReturn = focused; modalOnClose = opts.onClose || null; }
    currentItems = items;
    $('modalTitle').textContent = title;
    $('modalBox').className = 'modal-box' + (opts.cls ? ' ' + opts.cls : '');
    $('modalBody').innerHTML = items.map(itemHtml).join('');
    wireImages($('modalBody'));
    $('modal').hidden = false;
    $('modalBody').scrollTop = 0;
    var start = opts.focus >= 0 ? $('modalBody').querySelector('[data-item="' + opts.focus + '"]') : null;
    focusEl(start || $('modalBody').querySelector('.focusable'));
  }
  function itemHtml(it, i) {
    var visual = '';
    if (it.app) visual = '<span class="art">' + (it.app.icon ? '<img alt="" src="' + esc(it.app.icon) + '">' : '<span class="glyph">' + esc(appName(it.app).charAt(0)) + '</span>') + '</span>';
    else if (it.thumb) visual = '<span class="thumb" style="background-image:url(&quot;' + esc(it.thumb) + '&quot;)"></span>';
    else if (it.swatch) visual = '<span class="thumb swatch-' + esc(it.swatch) + '"></span>';
    else if (it.glyph) visual = '<span class="thumb glyph-box">' + (I.ui[it.glyph] || '') + '</span>';
    var check = it.checked === true ? '<i class="check">' + I.ui.check + '</i>' : it.checked === false ? '<i class="check off"></i>' : '';
    return '<button class="mitem focusable' + (it.cls ? ' ' + it.cls : '') + (it.checked ? ' on' : '') + '" data-item="' + i + '">' + visual +
      '<span class="mlabel"' + (it.fontCss ? ' style="font-family:' + esc(it.fontCss).replace(/&quot;/g, "'") + '"' : '') + '>' + esc(it.label) + '</span>' +
      (it.value ? '<b>' + esc(it.value) + '</b>' : '') + check + '</button>';
  }
  /** Re-renders one dialog item in place (keeps focus on it). */
  function updateItem(i) {
    var el = $('modalBody').querySelector('[data-item="' + i + '"]');
    if (!el || !currentItems[i]) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = itemHtml(currentItems[i], i);
    var fresh = tmp.firstChild, wasFocused = focused === el;
    el.parentNode.replaceChild(fresh, el);
    wireImages(fresh.parentNode);
    if (wasFocused) focusEl(fresh);
  }
  var currentItems = [], modalReturn = null, modalOnClose = null;
  function closeModal(all) {
    if (textEntry) endTextEntry(false);
    if (modalOnClose && (all || !modalStack.length)) { var cb = modalOnClose; modalOnClose = null; try { cb(); } catch (e) { fail('MODAL_CLOSE', e); } }
    if (!all && modalStack.length) {
      var prev = modalStack.pop();
      currentItems = prev.items;
      $('modalTitle').textContent = prev.title;
      $('modalBox').className = prev.cls;
      $('modalBody').innerHTML = prev.html;
      wireImages($('modalBody'));
      focusEl($('modalBody').querySelector('.focusable'));
      return;
    }
    modalStack = [];
    $('modal').hidden = true;
    $('modalBox').className = 'modal-box'; // no gallery/preview styling may outlive the window
    currentItems = [];
    var back = modalReturn;
    modalReturn = null;
    if (back && !document.contains(back)) { // the list was re-rendered meanwhile: find the same row again
      var key = rowKey(back), again = key && $('settingsRows').querySelector(key);
      if (!again && back.dataset && back.dataset.action === 'cat-new') { var cr = $('settingsRows').querySelectorAll('[data-catrow]'); again = cr[cr.length - 1]; }
      back = again || back;
    }
    if (back && document.contains(back) && isVisible(back)) focusEl(back); else restoreFocus();
  }
  function runItem(i) {
    var it = currentItems[i];
    if (!it) return;
    if (it.keep) { it.run && it.run(i); return; }
    closeModal(true);
    if (it.run) it.run(i);
  }
  /** Lets the user pick one value from a list; the current value is marked. */
  function pickValue(title, values, current, done) {
    var at = 0;
    openModal(title, values.map(function (v, i) {
      if (v[0] === current) at = i;
      return { label: tr(v[1]), checked: v[0] === current, run: function () { done(v[0]); } };
    }), { focus: -1 });
    focusEl($('modalBody').querySelector('[data-item="' + at + '"]'));
  }
  function confirmBox(title, yesLabel, onYes) {
    openModal(title, [{ label: yesLabel, cls: 'danger', run: onYes }, { label: tr('Cancel'), cls: 'muted', run: function () {} }]);
    focusEl($('modalBody').querySelector('[data-item="1"]')); // the safe choice is focused first
  }

  // ---------------------------------------------------------------- text entry (category names) through the native keyboard
  var textEntry = null; // { value, onDone }
  function openTextEntry(title, initial, onDone) {
    textEntry = { value: initial || '', onDone: onDone };
    openModal(title, [
      { label: textEntry.value || tr('Type a name'), cls: 'field' + (textEntry.value ? '' : ' placeholder'), keep: true, run: function () { startTextKeyboard(); } },
      { label: tr('Save'), keep: true, run: function () { finishTextEntry(); } },
      { label: tr('Cancel'), cls: 'muted', run: function () {} }
    ]);
    startTextKeyboard();
  }
  function startTextKeyboard() {
    if (!textEntry) return;
    if (has('showKeyboard')) { nativeTyping = true; document.body.classList.add('typing'); NATIVE.showKeyboard(textEntry.value); }
    else { // desktop preview
      var v = window.prompt(tr('Type a name'), textEntry.value);
      if (v !== null) textEntryText(v);
    }
  }
  function textEntryText(text) {
    if (!textEntry) return;
    textEntry.value = String(text || '').slice(0, M.MAX_NAME); // raw while typing (spaces kept); cleaned on Save
    currentItems[0].label = textEntry.value || tr('Type a name');
    currentItems[0].cls = 'field' + (textEntry.value ? '' : ' placeholder');
    updateItem(0);
  }
  function endTextEntry(done) {
    if (nativeTyping) { nativeTyping = false; document.body.classList.remove('typing'); }
    if (has('hideKeyboard')) NATIVE.hideKeyboard();
    if (done && textEntry) focusEl($('modalBody').querySelector('[data-item="1"]'));
    if (!done) textEntry = null;
  }
  function finishTextEntry() {
    if (!textEntry) return;
    var t = textEntry, name = M.cleanName(t.value);
    if (!name) { toast(tr('Type a name first')); return; }
    endTextEntry(false);
    if (t.onDone(name) === false) { textEntry = t; toast(tr('That name is already used')); return; }
    closeModal(true);
  }

  function pickApp(title, filter, done) {
    var list = allApps.filter(function (a) { return !a.system && (!filter || filter(a)); });
    if (!list.length) { toast(tr('No apps to show')); return; }
    openModal(title, list.map(function (a) { return { label: appName(a), app: a, run: function () { done(a); } }; }), { cls: 'picker' });
  }
  function pickSlot(a) {
    var items = [];
    for (var i = 0; i < SLOTS; i++) (function (n) {
      var cur = app(settings.homeSlots[n]);
      items.push({ label: tr('Slot {n}', { n: n + 1 }), value: cur ? appName(cur) : tr('Empty slot'), run: function () { setSlot(n, a.id); } });
    })(i);
    openModal(tr('Choose a Home slot'), items);
  }

  // ================================================================ actions on apps
  function launch(id) {
    var a = app(id);
    window.TVApps.launch(id).then(function () {
      // Only a launch that actually started counts for "Recently used" sorting.
      if (a && !a.system) { settings.recent[id] = Date.now(); settings.recent = M.sanitizeRecent(settings.recent); save(); }
    }).catch(function () { toast(tr('Could not open {app}', { app: a ? appName(a) : id })); });
  }
  function seedCategories() {
    if (settings.catsSeeded || !appsLoaded) return;
    var n = M.seed(settings, function (id) { return !!app(id); });
    settings.catsSeeded = true;
    save();
    log('CATEGORIES_SEEDED', String(n));
  }
  function setSlot(n, id) {
    var existing = homeIndex(id);
    if (existing >= 0 && existing !== n) settings.homeSlots[existing] = settings.homeSlots[n];
    settings.homeSlots[n] = id;
    save(); renderApps(); toast(tr('Saved on Home'));
  }
  function clearSlot(n) { settings.homeSlots[n] = null; save(); renderApps(); toast(tr('Removed from Home')); }
  function addFav(id) {
    if (isFav(id)) { toast(tr('Already in favorites')); return; }
    settings.favorites.push(id); save(); renderApps(); toast(tr('Added to favorites'));
  }
  function removeFav(id) {
    settings.favorites = settings.favorites.filter(function (x) { return x !== id; });
    save(); renderApps(); toast(tr('Removed from favorites'));
  }
  function moveInList(list, id, delta) {
    var arr = list === 'home' ? settings.homeSlots : settings.favorites;
    var i = arr.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    var t = arr[j]; arr[j] = arr[i]; arr[i] = t;
    save(); renderApps();
  }

  function appMenu(el) {
    var id = el.dataset.app, a = app(id), slot = el.dataset.slot, list = el.dataset.list, items = [];
    if (el.dataset.empty === '1') { pickApp(tr('Choose an app'), null, function (x) { setSlot(+slot, x.id); }); return; }
    if (!a) return;
    // The category this tile is shown in (category page or a category row on Home), if any.
    var ctxCat = list === 'cat' ? currentCat : list === 'row' && el.dataset.row !== 'favorites' ? el.dataset.row : null;
    var cat = ctxCat && M.find(settings, ctxCat);
    items.push({ label: tr('Open'), run: function () { launch(id); } });
    if (!a.system) {
      items.push(isFav(id) ? { label: tr('Remove from Favorites'), run: function () { removeFav(id); } }
        : { label: tr('Add to Favorites'), run: function () { addFav(id); } });
      items.push({ label: tr('Add to Category'), value: catsSummary(id), run: function () { pickCategories(id); } });
      if (cat) {
        items.push({ label: tr('Remove from “{c}”', { c: catLabel(cat) }), run: function () { catRemoveApp(cat.id, id); } });
        if (settings.categories.length > 1) items.push({ label: tr('Move to Category'), run: function () { pickMoveTarget(cat.id, id); } });
      } else if (M.membership(settings, id).length) {
        items.push({ label: tr('Remove from Category'), run: function () { pickRemoveCategory(id); } });
      }
    }
    if (slot !== undefined) {
      items.push({ label: tr('Change app'), run: function () { pickApp(tr('Choose an app'), null, function (x) { setSlot(+slot, x.id); }); } });
      items.push({ label: tr('Reorder'), run: function () { startReorder('home', +slot); } });
      items.push({ label: tr('Remove from Home'), run: function () { clearSlot(+slot); } });
    } else {
      if (list === 'fav') items.push({ label: tr('Reorder'), run: function () { startReorder('fav', +el.dataset.index); } });
      if (list === 'cat' && cat) {
        if (cat.sort === 'manual') items.push({ label: tr('Reorder'), run: function () { startReorder('cat', +el.dataset.index); } });
        else items.push({ label: tr('Reorder'), value: tr('Sort') + ': ' + tr(SORT_LABEL[cat.sort]), run: function () { toast(tr('Switch this category to Manual sort to reorder')); } });
      }
      items.push(homeIndex(id) >= 0 ? { label: tr('Remove from Home'), run: function () { clearSlot(homeIndex(id)); } }
        : { label: tr('Add to Home'), run: function () { pickSlot(a); } });
    }
    if (!a.system && NATIVE && !/^input\./.test(id)) items.push({ label: tr('App info'), run: function () { window.TVApps.appInfo(id); } });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(appName(a), items);
  }

  // ---------------------------------------------------------------- category actions (all from the remote)
  function catsSummary(id) {
    var names = M.membership(settings, id).map(function (cid) { return catLabel(M.find(settings, cid)); });
    return names.length ? names.join(L.isArabic() ? '، ' : ', ').slice(0, 40) : tr('None');
  }
  function afterCatChange() { save(); renderNav(); renderApps(); if (page === 'settings') renderSettingsRows(true); }
  /** Multi-select: every category with a check mark; OK toggles and saves at once. */
  function pickCategories(appId) {
    if (!settings.categories.length) { toast(tr('Create a category first')); return; }
    var items = settings.categories.map(function (c) {
      return { label: catLabel(c) + (c.hidden ? ' · ' + tr('Hidden') : ''), checked: c.apps.indexOf(appId) >= 0, keep: true, run: function (i) {
        var on = c.apps.indexOf(appId) >= 0;
        if (on) M.removeApp(settings, c.id, appId); else M.addApp(settings, c.id, appId);
        currentItems[i].checked = !on;
        updateItem(i);
        save();
      } };
    });
    items.push({ label: tr('Done'), cls: 'accent', run: function () {} });
    openModal(tr('Categories for {app}', { app: appName(app(appId)) }), items, { onClose: function () { renderNav(); renderApps(); } });
  }
  function catRemoveApp(catId, appId) {
    M.removeApp(settings, catId, appId);
    afterCatChange();
    toast(tr('Removed from category'));
  }
  function pickRemoveCategory(appId) {
    var items = M.membership(settings, appId).map(function (cid) {
      var c = M.find(settings, cid);
      return { label: catLabel(c), run: function () { catRemoveApp(cid, appId); } };
    });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(tr('Remove from Category'), items);
  }
  function pickMoveTarget(fromId, appId) {
    var items = settings.categories.filter(function (c) { return c.id !== fromId; }).map(function (c) {
      return { label: catLabel(c), value: c.apps.indexOf(appId) >= 0 ? tr('Already there') : '', run: function () {
        M.moveApp(settings, fromId, c.id, appId);
        afterCatChange();
        toast(tr('Moved to “{c}”', { c: catLabel(c) }));
      } };
    });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(tr('Move to Category'), items);
  }
  /** The category's app list: every installed app with a check mark (toggle with OK). */
  function editCatApps(catId) {
    var c = M.find(settings, catId);
    if (!c) return;
    var list = allApps.filter(function (a) { return !a.system; });
    if (!list.length) { toast(tr('No apps to show')); return; }
    var items = list.map(function (a) {
      return { label: appName(a), app: a, checked: c.apps.indexOf(a.id) >= 0, keep: true, run: function (i) {
        var on = c.apps.indexOf(a.id) >= 0;
        if (on) M.removeApp(settings, c.id, a.id); else M.addApp(settings, c.id, a.id);
        currentItems[i].checked = !on;
        updateItem(i);
        save();
      } };
    });
    items.unshift({ label: tr('Done'), cls: 'accent', run: function () {} });
    openModal(tr('Apps in “{c}”', { c: catLabel(c) }), items, { cls: 'picker', onClose: function () { renderNav(); renderApps(); if (page === 'settings') renderSettingsRows(true); } });
  }
  function newCategory() {
    openTextEntry(tr('New category'), '', function (name) {
      var c = M.create(settings, name, tr);
      if (!c) return false;
      afterCatChange();
      toast(tr('Category “{c}” created', { c: name }));
      setTimeout(function () { editCatApps(c.id); }, 60);
    });
  }
  function catMenu(catId) {
    var c = M.find(settings, catId);
    if (!c) return;
    var i = settings.categories.indexOf(c), items = [];
    items.push({ label: tr('Open'), run: function () { if (c.hidden) { c.hidden = false; afterCatChange(); } showPage('category', null, c.id); } });
    items.push({ label: tr('Edit apps'), value: String(catApps(c).length), run: function () { editCatApps(c.id); } });
    items.push({ label: tr('Rename'), run: function () {
      openTextEntry(tr('Rename “{c}”', { c: catLabel(c) }), catLabel(c), function (name) {
        if (!M.rename(settings, c.id, name, tr)) return false;
        afterCatChange(); toast(tr('Saved'));
      });
    } });
    items.push({ label: tr('Sort'), value: tr(SORT_LABEL[c.sort]), run: function () {
      pickValue(tr('Sort'), [['manual', 'Manual'], ['alpha', 'Alphabetical'], ['recent', 'Recently used']], c.sort, function (v) { c.sort = v; afterCatChange(); });
    } });
    items.push({ label: tr('Show as a tab'), value: tr(c.tab ? 'On' : 'Off'), run: function () { c.tab = !c.tab; afterCatChange(); } });
    items.push({ label: tr(c.hidden ? 'Show category' : 'Hide category'), run: function () { c.hidden = !c.hidden; afterCatChange(); } });
    if (i > 0) items.push({ label: '↑ ' + tr('Move up'), run: function () { M.moveCategory(settings, c.id, -1); afterCatChange(); focusRow('[data-catrow="' + c.id + '"]'); } });
    if (i < settings.categories.length - 1) items.push({ label: '↓ ' + tr('Move down'), run: function () { M.moveCategory(settings, c.id, 1); afterCatChange(); focusRow('[data-catrow="' + c.id + '"]'); } });
    items.push({ label: tr('Delete category'), cls: 'danger', run: function () {
      var n = c.apps.length, go = function () {
        if (page === 'category' && currentCat === c.id) showPage('home');
        M.remove(settings, c.id); afterCatChange(); toast(tr('Category deleted — your apps were not touched'));
      };
      if (n) confirmBox(tr('Delete “{c}”? The apps in it stay installed and in your other lists.', { c: catLabel(c) }), tr('Delete category'), go);
      else go();
    } });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(catLabel(c), items);
  }
  function focusRow(sel) { var el = $('settingsRows').querySelector(sel); if (el) focusEl(el); }

  function slotRowMenu(n) {
    var a = app(settings.homeSlots[n]);
    var items = [{ label: a ? tr('Change app') : tr('Add app'), run: function () { pickApp(tr('Choose an app'), null, function (x) { setSlot(n, x.id); }); } }];
    if (a) {
      items.unshift({ label: tr('Open'), run: function () { launch(a.id); } });
      if (n > 0) items.push({ label: '↑ ' + tr('Move'), run: function () { swapSlots(n, n - 1); } });
      if (n < SLOTS - 1) items.push({ label: '↓ ' + tr('Move'), run: function () { swapSlots(n, n + 1); } });
      items.push({ label: tr('Remove from Home'), run: function () { clearSlot(n); } });
    }
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(tr('Slot {n}', { n: n + 1 }), items);
  }
  function swapSlots(a, b) {
    var t = settings.homeSlots[a]; settings.homeSlots[a] = settings.homeSlots[b]; settings.homeSlots[b] = t;
    save(); renderApps();
    var target = $('settingsRows').querySelector('[data-slotrow="' + b + '"]'); if (target) focusEl(target);
  }
  function favRowMenu(id) {
    var a = app(id); if (!a) return;
    var vis = favApps().map(function (x) { return x.id; }), i = vis.indexOf(id);
    var items = [{ label: tr('Open'), run: function () { launch(id); } }];
    if (i > 0) items.push({ label: '↑ ' + tr('Move'), run: function () { moveFavVisible(id, -1); } });
    if (i < vis.length - 1) items.push({ label: '↓ ' + tr('Move'), run: function () { moveFavVisible(id, 1); } });
    items.push({ label: tr('Put on Home'), run: function () { pickSlot(a); } });
    items.push({ label: tr('Remove from favorites'), run: function () { removeFav(id); } });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(appName(a), items);
  }
  function moveFavVisible(id, delta) {
    var vis = favApps().map(function (x) { return x.id; }), i = vis.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= vis.length) return;
    vis.splice(i, 1); vis.splice(j, 0, id);
    settings.favorites = vis.concat(settings.favorites.filter(function (x) { return vis.indexOf(x) < 0; }));
    save(); renderApps();
    var target = $('settingsRows').querySelector('[data-id="' + id + '"]'); if (target) focusEl(target);
  }

  // ================================================================ galleries (1.3.0)
  var IMPORT_ERR = { cancel: '', nopicker: 'No file picker is available on this receiver', full: 'Your image library is full (60 images)',
    space: 'Not enough free storage on the receiver', large: 'That image is too large', format: 'Unsupported image format (use JPG, PNG or WebP)',
    corrupt: 'That file could not be read as an image', unreadable: 'That file could not be opened' };
  var pendingImport = null; // callback(id) for the gallery that asked for an image
  function importImage(done) {
    if (!has('pickImage')) { toast(tr('Importing images works on the TV only')); return; }
    pendingImport = done;
    if (!NATIVE.pickImage()) { pendingImport = null; toast(tr(IMPORT_ERR.nopicker)); return; }
    toast(tr('Choose a picture in the file manager'));
  }
  function onImageImported(r) {
    var done = pendingImport;
    pendingImport = null;
    if (!r || !r.ok) {
      var msg = IMPORT_ERR[r && r.error] || IMPORT_ERR.corrupt;
      if (msg) toast(tr(msg));
      log('IMAGE_IMPORT_FAILED', r && r.error);
      return;
    }
    loadUserImages();
    log('IMAGE_IMPORTED', r.id + ' ' + r.w + 'x' + r.h);
    toast(tr('Picture added to your library'));
    if (done) done(r.id);
  }
  function confirmDeleteImage(id, after) {
    confirmBox(tr('Remove this picture from Solitary TV? The original file on the receiver is not deleted.'), tr('Remove picture'), function () {
      if (!NATIVE.deleteImage(id)) { toast(tr('Could not remove the picture')); return; }
      loadUserImages();
      var changed = false;
      if (settings.wallpaper === id) { settings.wallpaper = 'w01'; changed = true; }
      if (settings.ssStyle === id) { settings.ssStyle = 'nebula'; changed = true; }
      var before = settings.ssSlideItems.length;
      settings.ssSlideItems = settings.ssSlideItems.filter(function (x) { return x !== id; });
      if (changed || before !== settings.ssSlideItems.length) { save(); applyWallpaper(); }
      toast(tr('Picture removed'));
      if (after) after();
    });
  }
  /** Wallpapers: focus previews behind the window, OK applies, Back leaves everything as it was. */
  function openWallpaperGallery(focusId) {
    loadUserImages();
    var ids = WALLS.concat(['scenery']).concat(userImages.map(function (u) { return u.id; })), at = 0;
    var items = ids.map(function (id, i) {
      if (id === (focusId || settings.wallpaper)) at = i;
      return { label: artName(id), thumb: id === 'scenery' ? 'css/landscapes/clear.png' : artUrl(id, true), checked: id === settings.wallpaper,
        preview: function () { applyWallpaper(id); },
        run: function () { settings.wallpaper = id; save(); applyWallpaper(); renderSettingsRows(true); toast(tr('Wallpaper applied')); },
        user: /^u/.test(id) ? id : null };
    });
    items.push({ label: tr('Add my own picture…'), glyph: 'plus', run: function () { importImage(function (id) { openWallpaperGallery(id); }); } });
    items.push({ label: tr('Restore default wallpaper'), glyph: 'refresh', run: function () { settings.wallpaper = 'w01'; save(); applyWallpaper(); renderSettingsRows(true); toast(tr('Wallpaper applied')); } });
    openModal(tr('Wallpapers'), items, { cls: 'gallery wallpapers', focus: at, onClose: function () { applyWallpaper(); } });
  }
  function openScreensaverGallery(focusId) {
    loadUserImages();
    var ids = SS_STYLES.concat(WALLS).concat(userImages.map(function (u) { return u.id; })), at = 0;
    var items = ids.map(function (id, i) {
      if (id === (focusId || settings.ssStyle)) at = i;
      return { label: artName(id), thumb: id === 'midnight' ? null : artUrl(id, true), swatch: id === 'midnight' ? 'midnight' : null,
        checked: !settings.ssSlide && id === settings.ssStyle,
        run: function () { settings.ssStyle = id; settings.ssSlide = false; save(); renderSettingsRows(true); toast(tr('Screensaver selected')); },
        user: /^u/.test(id) ? id : null };
    });
    items.push({ label: tr('Add my own picture…'), glyph: 'plus', run: function () { importImage(function (id) { settings.ssStyle = id; settings.ssSlide = false; save(); openScreensaverGallery(id); }); } });
    openModal(tr('Screensaver'), items, { cls: 'gallery', focus: at });
  }
  function slideItems() { return settings.ssSlideItems.filter(function (id) { return id === 'midnight' || !!artUrl(id, false); }); }
  function openSlideItems() {
    loadUserImages();
    var ids = SS_STYLES.concat(WALLS).concat(userImages.map(function (u) { return u.id; }));
    var items = ids.map(function (id) {
      return { label: artName(id), thumb: id === 'midnight' ? null : artUrl(id, true), swatch: id === 'midnight' ? 'midnight' : null,
        checked: settings.ssSlideItems.indexOf(id) >= 0, keep: true, user: /^u/.test(id) ? id : null, run: function (i) {
          var on = settings.ssSlideItems.indexOf(id) >= 0;
          settings.ssSlideItems = on ? settings.ssSlideItems.filter(function (x) { return x !== id; }) : settings.ssSlideItems.concat([id]);
          currentItems[i].checked = !on; updateItem(i); save();
        } };
    });
    items.push({ label: tr('Add my own picture…'), glyph: 'plus', run: function () {
      importImage(function (id) { settings.ssSlideItems = settings.ssSlideItems.concat([id]); save(); openSlideItems(); });
    } });
    items.push({ label: tr('Done'), glyph: 'check', run: function () {} });
    openModal(tr('Slideshow pictures'), items, { cls: 'gallery', onClose: function () { if (page === 'settings') renderSettingsRows(true); } });
  }

  // ================================================================ backup & import
  function backupJson() {
    var v = {};
    try { v = NATIVE ? JSON.parse(NATIVE.appVersion()) : {}; } catch (e) { v = {}; }
    return JSON.stringify({ format: 'solitary.settings', version: 2, package: 'tv.customhome.launcher', app: v.name || '', created: Date.now(),
      settings: settings, images: userImages.map(function (u) { return u.id; }) });
  }
  function saveBackup(silent) {
    if (!NATIVE) return;
    loadUserImages();
    var at = NATIVE.saveBackup(backupJson());
    if (!silent) toast(tr(at ? 'Backup saved' : 'Backup failed'));
    if (page === 'settings') renderSettingsRows(true);
  }
  function exportBackup() {
    if (!has('exportBackup')) return;
    loadUserImages();
    var path = NATIVE.exportBackup(backupJson());
    toast(path ? tr('Saved to {path}', { path: path }) : tr('Backup failed'));
  }
  /** Parses and checks a backup; returns {settings, created, summary} or null. Never touches the current settings. */
  function readBackup(text) {
    var root;
    try { root = JSON.parse(text); } catch (e) { return null; }
    if (!root || root.format !== 'solitary.settings' || !root.settings || typeof root.settings !== 'object' || Array.isArray(root.settings)) return null;
    if (root.package && root.package !== 'tv.customhome.launcher') return null;
    var s = sanitize(root.settings);
    return { settings: s, created: +root.created || 0,
      summary: tr('{f} favorites · {h} Home apps · {c} categories', { f: s.favorites.length, h: s.homeSlots.filter(Boolean).length, c: s.categories.length }) };
  }
  function applyBackup(b) {
    if (has('saveSafetyCopy')) NATIVE.saveSafetyCopy(JSON.stringify(settings)); // the settings being replaced stay recoverable
    var importHash = settings.importHash;
    settings = b.settings;
    settings.importHash = importHash || settings.importHash;
    save(); refreshLanguage(); renderNav(); applyLook(); renderAll();
    if (page === 'settings') renderSettingsRows(false);
    toast(tr('Backup restored'));
    log('BACKUP_RESTORED', b.summary);
  }
  function confirmRestore(text, source) {
    var b = text ? readBackup(text) : null;
    if (!b) { toast(tr(text ? 'This is not a valid Solitary TV backup — nothing was changed' : 'No backup found')); return; }
    var when = b.created ? fmtDate(new Date(b.created)) + ' ' + fmtTime(new Date(b.created)) : '?';
    openModal(tr('Restore the backup from {when}?', { when: when }), [
      { label: b.summary, cls: 'note-item', keep: true, run: function () {} },
      { label: tr('Your current settings are kept in a safety copy first.'), cls: 'note-item', keep: true, run: function () {} },
      { label: tr('Restore'), cls: 'accent', run: function () { applyBackup(b); } },
      { label: tr('Cancel'), cls: 'muted', run: function () {} }
    ]);
    focusEl($('modalBody').querySelector('[data-item="3"]'));
    log('BACKUP_PREVIEW', source + ' ' + b.summary);
  }
  function restoreBackup() { confirmRestore(NATIVE ? NATIVE.loadBackup() : '', 'last'); }
  function importBackupFile() {
    if (!has('pickBackup') || !NATIVE.pickBackup()) { toast(tr(IMPORT_ERR.nopicker)); return; }
    toast(tr('Choose the backup file in the file manager'));
  }
  function onBackupPicked(r) {
    if (!r || !r.ok) { if (r && r.error !== 'cancel') toast(tr(r.error === 'large' ? 'That file is too large to be a backup' : 'That file could not be opened')); return; }
    confirmRestore(r.text, 'file');
  }
  function importSmartTv(force) {
    if (!NATIVE || !appsLoaded) return;
    var text = '';
    try { text = NATIVE.readImport(); } catch (e) { text = ''; }
    if (!text) { if (force) toast(tr('No import file found')); return; }
    var data;
    try { data = JSON.parse(text); } catch (e) { fail('IMPORT_PARSE', e); return; }
    if (data.format !== 'solitary.import' || !Array.isArray(data.apps)) { fail('IMPORT_FORMAT', 'unexpected'); return; }
    var ids = data.apps.map(function (x) { return x && x.id; }).filter(validId);
    var hash = ids.join('|');
    if (!force && settings.importHash === hash) return;
    var installed = ids.filter(function (id) { return !!app(id); });
    var added = 0;
    installed.forEach(function (id) { if (!isFav(id)) { settings.favorites.push(id); added++; } });
    installed.forEach(function (id) {
      if (homeIndex(id) >= 0) return;
      var free = settings.homeSlots.indexOf(null);
      if (free < 0) { // also treat slots holding uninstalled apps as free
        for (var i = 0; i < SLOTS; i++) if (!app(settings.homeSlots[i])) { free = i; break; }
      }
      if (free >= 0) { settings.homeSlots[free] = id; added++; }
    });
    settings.importHash = hash;
    save(); renderApps();
    log('IMPORT_DONE', installed.length + '/' + ids.length);
    toast(added ? tr('Imported {n} apps', { n: installed.length }) : tr('Nothing new to import'));
    if (added) saveBackup(true);
  }

  // ================================================================ activation
  function activate(el) {
    if (!el) return;
    var d = el.dataset;
    if (el.classList.contains('mitem')) { runItem(+d.item); return; }
    if (d.qp) { runQuickItem(d.qp); return; }
    if (d.qprow) { qpRowMenu(d.qprow); return; }
    if (d.nav) { showPage(d.nav, null, d.cat); return; }
    if (d.tab) { selectTab(d.tab); focusEl($('settingsRows').querySelector('.focusable') || el); return; }
    if (d.empty === '1') { appMenu(el); return; }
    if (d.app) { launch(d.app); return; }
    if (d.choice) {
      var key = d.choice, c = CHOICES[key];
      if (c.values.length > 2) pickValue(tr(c.label), c.values, settings[key], function (v) { setChoice(key, v); });
      else setChoice(key, c.values[(c.values.map(function (v) { return v[0]; }).indexOf(settings[key]) + 1) % 2][0]);
      return;
    }
    if (d.slotrow !== undefined) { slotRowMenu(+d.slotrow); return; }
    if (d.favrow !== undefined) { favRowMenu(d.id); return; }
    if (d.catrow) { catMenu(d.catrow); return; }
    if (d.info === 'dream') { dreamHelp(); return; }
    switch (d.action) {
      case 'ambient': case 'ss-preview': openAmbient(); break;
      case 'forecast': openForecast(); break;
      case 'retry-weather': toast(tr('Refreshing…')); refreshWeather(true); break;
      case 'refresh-prayer': if (NATIVE) { NATIVE.refreshDashboard(); toast(tr('Refreshing…')); } break;
      case 'manage-home': showPage('settings'); selectTab('homescreen'); renderSettingsTabs(); focusEl($('settingsRows').querySelector('.focusable')); break;
      case 'add-favorite': pickApp(tr('Choose an app'), function (a) { return !isFav(a.id); }, function (a) { addFav(a.id); }); break;
      case 'cat-edit': editCatApps(d.cat || currentCat); break;
      case 'cat-sort': { var cc = M.find(settings, currentCat); if (cc) pickValue(tr('Sort'), [['manual', 'Manual'], ['alpha', 'Alphabetical'], ['recent', 'Recently used']], cc.sort, function (v) { cc.sort = v; afterCatChange(); focusEl($('catSort')); }); break; }
      case 'cat-manage': if (currentCat) catMenu(currentCat); break;
      case 'cat-new': newCategory(); break;
      case 'wallpapers': openWallpaperGallery(); break;
      case 'logo': openLogoGallery(); break;
      case 'font-ar': openFontPicker('ar'); break;
      case 'font-en': openFontPicker('en'); break;
      case 'font-reset': settings.fontAr = 'system'; settings.fontEn = 'system'; save(); applyFonts(); renderSettingsRows(false); focusEl($('settingsRows').querySelector('[data-action="font-ar"]')); toast(tr('Default fonts restored')); break;
      case 'ss-style': openScreensaverGallery(); break;
      case 'ss-items': openSlideItems(); break;
      case 'snd-preview': if (settings.sndOn) { snd('select'); setTimeout(function () { snd('move'); }, 260); } else toast(tr('Interface sounds are off')); break;
      case 'home-request': if (has('requestDefaultHome') && !NATIVE.requestDefaultHome()) toast(tr('This receiver does not offer that option')); break;
      case 'home-settings': if (!NATIVE.openHomeSettings()) toast(tr('This receiver does not offer that option')); break;
      case 'open-smarttv': if (!NATIVE.openLauncher('tv.nexus.launcher')) toast(tr('Could not open {app}', { app: 'SMART TV' })); break;
      case 'android-settings': launch('system.settings'); break;
      case 'remote-help': remoteHelp(); break;
      case 'backup-save': saveBackup(false); break;
      case 'backup-export': exportBackup(); break;
      case 'backup-restore': restoreBackup(); break;
      case 'backup-import': importBackupFile(); break;
      case 'import-smarttv': importSmartTv(true); break;
      case 'quickpanel': openQuickPanel(); break;
      case 'search': startSearchInput(); break;
      case 'search-clear': clearSearch(); break;
    }
  }
  function setChoice(key, value) {
    settings[key] = value;
    save();
    if (key === 'language') { refreshLanguage(); renderNav(); }
    applyLook();
    renderAll();
    if (key === 'sndOn' && value) setTimeout(function () { snd('select'); }, 120);
    if ((key === 'sndStyle' || key === 'sndLevel') && settings.sndOn) setTimeout(function () { snd('select'); }, 200); // let the new sounds load first
    renderSettingsRows(false);
    focusEl($('settingsRows').querySelector('[data-choice="' + key + '"]'));
  }
  /** Applies every look/behaviour setting that lives outside the page markup. */
  function applyLook() {
    applyFocusStyle();
    applyFonts();
    applyLogo();
    var b = document.body.classList;
    b.toggle('theme-cinematic', settings.theme === 'cinematic');
    b.toggle('reduce-motion', settings.motion === 'reduced');
    if (has('soundConfig')) NATIVE.soundConfig(settings.sndOn, settings.sndStyle, settings.sndLevel);
    applyWallpaper();
    updateKeepOn();
  }
  var lastSnd = 0;
  function snd(event) {
    if (!settings.sndOn || DREAM || !has('sound')) return;
    var now = Date.now();
    if (event === 'move' && now - lastSnd < 60) return; // fast key repeat: never pile sounds up
    lastSnd = now;
    NATIVE.sound(event);
  }
  function homeStatus() {
    try { return has('homeStatus') ? JSON.parse(NATIVE.homeStatus()) : { isDefault: false, holder: '' }; } catch (e) { return { isDefault: false, holder: '' }; }
  }
  function dreamStatus() { return tr('Choose “Solitary TV” in Android settings › Device Preferences › Screen saver'); }
  function dreamHelp() {
    openModal(tr('Android system screensaver'), [
      { label: tr('Solitary TV also works as Android’s own screensaver (it then starts even outside this app).'), cls: 'note-item', keep: true, run: function () {} },
      { label: tr('To use it: Android settings › Device Preferences › Screen saver › Solitary TV.'), cls: 'note-item', keep: true, run: function () {} },
      { label: tr('Android decides when it starts (its own timer) and video apps keep it from starting.'), cls: 'note-item', keep: true, run: function () {} },
      { label: tr('Open Android settings'), cls: 'accent', run: function () { launch('system.settings'); } },
      { label: tr('Close'), cls: 'muted', run: function () {} }
    ]);
  }
  function remoteHelp() {
    var keys = [['OK', 'Open the selected item'], ['Hold OK', 'Options for the selected app'], ['Menu', 'Quick panel'],
      ['Back', 'Go back · close a window'], ['Home', 'Return to the Solitary TV home screen'], ['Arrows', 'Move the focus']];
    openModal(tr('Remote control help'), keys.map(function (k) {
      return { label: tr(k[1]), value: tr(k[0]), keep: true, run: function () {} };
    }).concat([{ label: tr('Close'), cls: 'muted', run: function () {} }]), { cls: 'forecast' });
  }
  function options(el) {
    if (!el) return;
    if (el.classList.contains('mitem')) { // long press on one of my pictures in a gallery: remove it from the library
      var it = currentItems[+el.dataset.item], title = $('modalTitle').textContent;
      if (it && it.user) confirmDeleteImage(it.user, function () {
        closeModal(true);
        if (title === tr('Wallpapers')) openWallpaperGallery(); else if (title === tr('Slideshow pictures')) openSlideItems(); else openScreensaverGallery();
      });
      return;
    }
    snd('panel');
    if (el.dataset.app || el.dataset.empty === '1') appMenu(el);
    else if (el.dataset.slotrow !== undefined) slotRowMenu(+el.dataset.slotrow);
    else if (el.dataset.favrow !== undefined) favRowMenu(el.dataset.id);
    else activate(el);
  }

  function back() {
    if (modalOpen()) { closeModal(false); return; }
    if (qpOpen()) { closeQuickPanel(); return; }
    if (reorder) { endReorder(); return; }
    // Apps page with an active search: first Back leaves the results for the search box, second clears it.
    if (page === 'apps' && searchQuery && focused && focused !== $('searchBox')) { focusEl($('searchBox')); return; }
    if (page === 'apps' && searchQuery && focused === $('searchBox')) { clearSearch(); return; }
    if (page !== 'home') {
      if (focused && focused.closest('#settingsRows')) { focusEl($('settingsTabs').querySelector('.stab.active')); return; }
      showPage('home'); return;
    }
    var first = $('homeGrid').querySelector('.tile');
    if (first && focused !== first) { focusEl(first); return; }
    if (homeStatus().isDefault) return; // as the default Home app there is nothing "behind" us to go back to
    window.TVApps.exit();
  }

  // ================================================================ 3D focus (CSS-driven; classes only)
  function applyFocusStyle() {
    var b = document.body.classList;
    b.toggle('f3d', settings.focus3d);
    ['light', 'medium', 'strong'].forEach(function (s) { b.toggle('f3d-' + s, settings.focusStrength === s); });
    ['fast', 'normal', 'calm'].forEach(function (s) { b.toggle('fs-' + s, settings.focusSpeed === s); });
  }

  // ================================================================ idle timer & screensaver (1.3.0; replaces Ambient mode)
  // One idle interval (15 s) for the app's lifetime. While Solitary TV is in front and its screensaver is on, the
  // screen is kept on so Android's own screensaver (another app's) does not start before ours; after 3 hours of
  // screensaver the flag is released and the system's own sleep rules apply again.
  var lastInput = Date.now(), ssTimer = 0, ssShiftTimer = 0, ssLayer = 0, ssList = [], ssIndex = 0, ssStartedAt = 0;
  var SS_KEEP_ON_MAX = 3 * 3600e3;
  function touch() { lastInput = Date.now(); }
  function ambientOpen() { return !$('ambient').hidden; }
  function idleBlocked() {
    return document.hidden || ambientOpen() || modalOpen() || qpOpen() || searchActive() || reorder || !!textEntry || !!pendingImport;
  }
  function idleTick() {
    updateKeepOn();
    if (DREAM || !settings.ssOn || !settings.ssIdle || idleBlocked()) return;
    if (Date.now() - lastInput >= settings.ssIdle * 60e3) { log('SCREENSAVER_AUTO', settings.ssIdle + 'min'); openAmbient(); }
  }
  var keptOn = null;
  function updateKeepOn() {
    var want = !DREAM && settings.ssOn && settings.ssIdle > 0 && !document.hidden && !(ambientOpen() && Date.now() - ssStartedAt > SS_KEEP_ON_MAX);
    if (want !== keptOn && has('keepScreenOn')) { keptOn = want; NATIVE.keepScreenOn(want); log('KEEP_SCREEN_ON', String(want)); }
  }
  /** Art ids shown by the screensaver now: the slideshow selection or the single chosen style. */
  function ssSources() {
    var list = settings.ssSlide ? slideItems() : [];
    if (!list.length) list = [settings.ssStyle === 'midnight' || artUrl(settings.ssStyle, false) ? settings.ssStyle : 'nebula'];
    if (settings.ssSlide && settings.ssShuffle) {
      list = list.slice();
      for (var i = list.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t; }
    }
    return list;
  }
  function showSsArt(id) {
    var layers = $('ssStage').children, next = ssLayer ? 0 : 1, art = layers[next].firstElementChild;
    var swap = function () {
      if (!ambientOpen()) return;
      layers[next].classList.add('on');
      layers[ssLayer].classList.remove('on');
      ssLayer = next;
    };
    art.className = 'ss-art' + (id === 'midnight' ? ' midnight' : '');
    art.style.transform = driftTransform();
    if (id === 'midnight') { art.style.backgroundImage = ''; swap(); return; }
    var url = artUrl(id, false) || artUrl('nebula', false), img = new Image();
    img.onload = function () { art.style.backgroundImage = 'url("' + url + '")'; swap(); };
    img.onerror = function () { fail('SCREENSAVER_IMAGE', id); art.style.backgroundImage = 'url("' + artUrl('nebula', false) + '")'; swap(); };
    img.src = url;
  }
  function stopSsTimers() {
    if (ssTimer) { clearInterval(ssTimer); ssTimer = 0; }
    if (ssShiftTimer) { clearInterval(ssShiftTimer); ssShiftTimer = 0; }
    if (ssDriftTimer) { clearInterval(ssDriftTimer); ssDriftTimer = 0; }
  }
  // Slow drift in small steps (one repaint every 3 s). A continuous CSS animation repainted the whole screen at
  // 60 fps and measured ~67% of a core for the launcher + ~40% for surfaceflinger on this receiver.
  var ssDriftTimer = 0, drift = { x: 0, y: 0, s: 1.05, vx: 0.09, vy: 0.06, vs: 0.0015 };
  function driftTransform() { return 'translate3d(' + drift.x.toFixed(2) + '%, ' + drift.y.toFixed(2) + '%, 0) scale(' + drift.s.toFixed(4) + ')'; }
  function driftStep() {
    drift.x += drift.vx; if (Math.abs(drift.x) > 2.2) { drift.vx = -drift.vx; drift.x += drift.vx * 2; }
    drift.y += drift.vy; if (Math.abs(drift.y) > 1.6) { drift.vy = -drift.vy; drift.y += drift.vy * 2; }
    drift.s += drift.vs; if (drift.s > 1.09 || drift.s < 1.03) { drift.vs = -drift.vs; drift.s += drift.vs * 2; }
    var t = driftTransform();
    Array.prototype.forEach.call($('ssStage').children, function (l) { l.firstElementChild.style.transform = t; });
  }
  /** Burn-in protection: the clock block moves a little every minute (instantly when motion is reduced). */
  function shiftClock() {
    var x = Math.round((Math.random() * 2 - 1) * 90), y = Math.round((Math.random() * 2 - 1) * 60);
    $('ambCenter').style.transform = 'translate(' + x + 'px, calc(-50% + ' + y + 'px))';
  }
  function openAmbient() {
    if (ambientOpen()) return;
    if (qpOpen()) closeQuickPanel(false);
    if (modalOpen()) closeModal(true);
    if (searchActive()) endSearchInput(false);
    if (reorder) endReorder();
    ambientReturn = focused;
    loadUserImages();
    $('ambient').hidden = false;
    $('ambient').classList.toggle('minimal-clock', settings.ssClockStyle === 'minimal');
    document.body.classList.add('ambient-on');
    $('ambDim').style.opacity = String(settings.ssDim / 100);
    stopSsTimers();
    ssStartedAt = Date.now();
    ssList = ssSources();
    ssIndex = 0;
    showSsArt(ssList[0]);
    if (ssList.length > 1) ssTimer = setInterval(function () {
      ssIndex = (ssIndex + 1) % ssList.length;
      showSsArt(ssList[ssIndex]);
    }, settings.ssSlideEvery * 60e3);
    $('ambCenter').style.transform = '';
    ssShiftTimer = setInterval(shiftClock, 60e3);
    if (settings.motion !== 'reduced') ssDriftTimer = setInterval(driftStep, 3000);
    renderAmbient(new Date());
    log('SCREENSAVER_OPEN', ssList.join(','));
  }
  var ambientReturn = null;
  function closeAmbient() {
    if (!ambientOpen()) return;
    stopSsTimers();
    $('ambient').hidden = true;
    Array.prototype.forEach.call($('ssStage').children, function (l) { l.classList.remove('on'); l.firstElementChild.style.backgroundImage = ''; });
    document.body.classList.remove('ambient-on');
    touch();
    updateKeepOn();
    var back = ambientReturn;
    ambientReturn = null;
    if (back && document.contains(back) && isVisible(back)) focusEl(back); else restoreFocus();
  }
  function renderAmbient(now) {
    // 1.4.0 layout: clock / day / date, each on its own line (date = day + month name + year, never 10/11/2026).
    $('ambTime').hidden = !settings.ssClock;
    $('ambDay').hidden = $('ambDate').hidden = !settings.ssDate;
    $('ambTime').innerHTML = esc(ssTime(now)) + (settings.ssHour12 && settings.ssAmPm
      ? '<small class="ampm">' + esc(now.getHours() < 12 ? tr('AM') : tr('PM')) + '</small>' : '');
    $('ambDay').textContent = dayName(now);
    $('ambDate').textContent = fmtDate(now);
    // Weather is shown only while it is reasonably fresh (never an old reading presented as current).
    if (weather && settings.ssWeather && Date.now() - weather.fetchedAt < 3 * 3600e3) {
      var c = weather.current, d = W.describe(c.code);
      $('ambWx').innerHTML = I.weather(d.kind, c.isDay) + '<span>' + temp(c.temp) + '</span><em>' + esc(d.label + ' · ' + city()) + '</em>';
    } else $('ambWx').innerHTML = '';
    var p = settings.ssPrayer && prayer.nextAt > Date.now() ? nextPrayerText() : '';
    $('ambPrayer').textContent = p;
    $('ambPrayer').hidden = !p;
    if (ambientOpen() && Date.now() - ssStartedAt > SS_KEEP_ON_MAX) updateKeepOn();
  }

  // ================================================================ quick panel
  var QP_LABEL = { 'android-settings': 'TV settings', 'app-settings': 'Solitary TV settings', search: 'Search apps', apps: 'All apps',
    favorites: 'Favorites', ambient: 'Screensaver', 'refresh-weather': 'Refresh weather', 'refresh-prayer': 'Refresh prayer times' };
  var QP_ICON = { 'android-settings': 'sliders', 'app-settings': 'spark', search: 'search', apps: 'grid', favorites: 'heart',
    ambient: 'moon', 'refresh-weather': 'forecast', 'refresh-prayer': 'mosque' };
  var qpReturn = null;
  function qpOpen() { return !$('qpanel').hidden; }
  function networkInfo() {
    if (!NATIVE || !NATIVE.networkInfo) return null;
    try { return JSON.parse(NATIVE.networkInfo()); } catch (e) { return null; }
  }
  function renderQuickPanel() {
    var now = new Date();
    $('qpTime').textContent = fmtTime(now);
    $('qpDate').textContent = dayName(now) + (L.isArabic() ? '، ' : ', ') + fmtDate(now);
    var net = settings.qpNetwork ? networkInfo() : null, nh = '';
    if (settings.qpNetwork) {
      if (!net) nh = '<span class="muted">' + esc(tr('Network info unavailable')) + '</span>';
      else if (!net.connected) nh = '<b class="bad">' + esc(tr('Not connected')) + '</b>';
      else {
        nh = '<b class="' + (net.internet ? 'good' : 'warn') + '">' + esc(tr(net.internet ? 'Internet OK' : 'Connected, no internet')) + '</b>' +
          '<span>' + esc(tr(net.type === 'wifi' ? 'Wi-Fi' : net.type === 'ethernet' ? 'Ethernet' : 'Network')) + '</span>' +
          (net.ip ? '<span class="ltr-num">' + esc(net.ip) + '</span>' : '');
      }
    }
    $('qpNet').innerHTML = nh;
    $('qpNet').hidden = !settings.qpNetwork;
    var shown = settings.qpOrder.filter(function (id) { return settings.qpHidden.indexOf(id) < 0; });
    $('qpGrid').innerHTML = shown.map(function (id) {
      return '<button class="qp-item focusable" data-qp="' + id + '"><span class="qp-ic">' + (I.ui[QP_ICON[id]] || '') + '</span><span>' + esc(tr(QP_LABEL[id])) + '</span></button>';
    }).join('') || '<div class="empty">' + esc(tr('All shortcuts are hidden')) + '</div>';
    var v = {};
    try { v = NATIVE ? JSON.parse(NATIVE.appVersion()) : { name: 'preview' }; } catch (e) { v = {}; }
    $('qpVer').textContent = 'Solitary TV ' + (v.name || '');
  }
  function openQuickPanel() {
    if (qpOpen()) return;
    if (modalOpen()) closeModal(true);
    if (reorder) endReorder();
    if (searchActive()) endSearchInput(false);
    qpReturn = focused;
    snd('panel');
    renderQuickPanel();
    $('qpanel').hidden = false;
    document.body.classList.add('qp-on');
    focusEl($('qpGrid').querySelector('.focusable'));
    log('QUICK_PANEL_OPEN');
  }
  function closeQuickPanel(restore) {
    if (!qpOpen()) return;
    $('qpanel').hidden = true;
    document.body.classList.remove('qp-on');
    var back = qpReturn;
    qpReturn = null;
    if (restore === false) return;
    if (back && document.contains(back) && isVisible(back)) focusEl(back); else restoreFocus();
  }
  function runQuickItem(id) {
    closeQuickPanel(id !== 'apps' && id !== 'favorites' && id !== 'app-settings' && id !== 'search');
    switch (id) {
      case 'android-settings': launch('system.settings'); break;
      case 'app-settings': showPage('settings'); break;
      case 'search': showPage('apps'); startSearchInput(); break;
      case 'apps': showPage('apps'); break;
      case 'favorites': showPage('favorites'); break;
      case 'ambient': openAmbient(); break;
      case 'refresh-weather': toast(tr('Refreshing…')); refreshWeather(true); break;
      case 'refresh-prayer': if (NATIVE) { NATIVE.refreshDashboard(); toast(tr('Refreshing…')); } break;
    }
  }
  function qpRowMenu(id) {
    var i = settings.qpOrder.indexOf(id), hidden = settings.qpHidden.indexOf(id) >= 0, items = [];
    items.push({ label: tr(hidden ? 'Show' : 'Hide'), run: function () {
      settings.qpHidden = hidden ? settings.qpHidden.filter(function (x) { return x !== id; }) : settings.qpHidden.concat([id]);
      save(); renderSettingsRows(false); focusEl($('settingsRows').querySelector('[data-qprow="' + id + '"]'));
    } });
    if (i > 0) items.push({ label: '↑ ' + tr('Move'), run: function () { moveQp(id, -1); } });
    if (i < settings.qpOrder.length - 1) items.push({ label: '↓ ' + tr('Move'), run: function () { moveQp(id, 1); } });
    items.push({ label: tr('Cancel'), cls: 'muted', run: function () {} });
    openModal(tr(QP_LABEL[id]), items);
  }
  function moveQp(id, delta) {
    var arr = settings.qpOrder, i = arr.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return;
    arr[i] = arr[j]; arr[j] = id;
    save(); renderSettingsRows(false); focusEl($('settingsRows').querySelector('[data-qprow="' + id + '"]'));
  }

  // ================================================================ apps search
  var searchQuery = '', searchTimer = 0;
  var S = window.TVSearch;
  function normalizeText(s) { return S.normalize(s); }
  function searchResults() { return S.filter(allApps, searchQuery, appName); }
  // On the TV, typing happens in a native EditText (see MainActivity.showKeyboard); text arrives via TVRemote.searchText.
  var nativeTyping = false;
  function searchActive() { return nativeTyping || document.activeElement === $('searchInput'); }
  function startSearchInput() {
    focusEl($('searchBox'));
    if (NATIVE && NATIVE.showKeyboard) {
      nativeTyping = true;
      document.body.classList.add('typing');
      NATIVE.showKeyboard($('searchInput').value);
    } else $('searchInput').focus();
    touch();
    log('SEARCH_INPUT_OPEN');
  }
  function endSearchInput(toResults) {
    var input = $('searchInput');
    if (document.activeElement === input) input.blur();
    if (nativeTyping) { nativeTyping = false; document.body.classList.remove('typing'); }
    if (NATIVE && NATIVE.hideKeyboard) NATIVE.hideKeyboard();
    if (toResults) {
      var first = $('appsGrid').querySelector('.tile');
      focusEl(first || $('searchBox'));
    } else focusEl($('searchBox'));
  }
  function onSearchInput() {
    touch();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchQuery = $('searchInput').value;
      renderAppsPage();
      if (!searchActive()) restoreFocus();
    }, 90);
  }
  function clearSearch() {
    $('searchInput').value = '';
    searchQuery = '';
    renderAppsPage();
    focusEl($('searchBox'));
  }
  function openForecast() {
    if (!weather) { refreshWeather(true); return; }
    var now = new Date();
    var items = weather.daily.slice(0, 7).map(function (d) {
      var desc = W.describe(d.code);
      return { label: (sameDay(d.date, now) ? tr('Today') : dayName(d.date)) + ' · ' + desc.label,
        value: temp(d.max) + ' / ' + temp(d.min), keep: true, run: function () { closeModal(true); } };
    });
    openModal(tr('7-day forecast') + ' · ' + city(), items, { cls: 'forecast' });
  }

  // ================================================================ hint & toast
  function updateHint() {
    var h = '';
    if (reorder) h = tr('Arrows to move · OK to place');
    else if (modalOpen() && focused && focused.classList.contains('mitem') && (currentItems[+focused.dataset.item] || {}).user) h = tr('OK select · Hold OK to remove this picture');
    else if (focused && focused.id === 'searchBox') h = tr('OK to type · Down for results · Back to clear');
    else if (focused && (focused.dataset.app || focused.dataset.empty === '1') && !modalOpen() && !qpOpen())
      h = tr(settings.qpMenuKey ? 'OK open · Hold OK for options · Menu quick panel' : 'OK open · Hold OK or Menu for options');
    $('hint').textContent = h;
    $('hint').classList.toggle('on', !!h);
  }
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3000);
  }

  // ================================================================ remote input
  function key(k) {
    console.log('[TVKey] ' + k + ' page=' + page + ' focus=' + (focused ? (focused.dataset.app || focused.dataset.nav || focused.dataset.action || focused.dataset.tab || focused.dataset.choice || focused.dataset.slot || focused.className.split(' ')[0]) : '-') + (modalOpen() ? ' modal' : '') + (reorder ? ' reorder' : ''));
    touch();
    // Any key only wakes the screen from the screensaver; it never activates what is underneath.
    if (ambientOpen()) { closeAmbient(); return; }
    if (textEntry && nativeTyping) { // typing a category name: Back/Down close the keyboard and keep the text
      if (k === 27 || k === 40 || k === 38) endTextEntry(true);
      else if (k === 13) startTextKeyboard();
      return;
    }
    if (searchActive()) {
      if (k === 40 || k === 27) endSearchInput(true);
      else if (k === 13) { if (NATIVE && NATIVE.showKeyboard) NATIVE.showKeyboard($('searchInput').value); }
      else if (k === 38) { endSearchInput(false); move('up'); }
      else if (k === 37 || k === 39) endSearchInput(false); // stay on the box; never jump sideways by accident
      return;
    }
    if (k === 1001 && settings.qpMenuKey && !modalOpen()) { if (qpOpen()) closeQuickPanel(); else openQuickPanel(); return; }
    if (reorder) {
      if (k === 37) reorderMove('left'); else if (k === 39) reorderMove('right');
      else if (k === 38) reorderMove('up'); else if (k === 40) reorderMove('down');
      else if (k === 13 || k === 27 || k === 1000) endReorder();
      return;
    }
    if (k === 37) move('left');
    else if (k === 38) move('up');
    else if (k === 39) move('right');
    else if (k === 40) move('down');
    else if (k === 13) { if (focused) snd('select'); activate(focused); }
    else if (k === 1000 || k === 1001) {
      if (modalOpen() && k === 1000 && focused && focused.classList.contains('mitem')) options(focused);
      else if (!modalOpen() && !qpOpen()) options(focused);
    }
    else if (k === 27 || k === 8 || k === 10009) { snd('back'); back(); }
  }
  // Desktop preview only: the TV routes keys through MainActivity.dispatchKeyEvent.
  document.addEventListener('keydown', function (e) {
    // Enter from the on-screen keyboard arrives inside the input, not through MainActivity.
    if (e.target === $('searchInput')) {
      touch();
      if (e.keyCode === 13) { e.preventDefault(); endSearchInput(true); }
      else if (!NATIVE && (e.keyCode === 27 || e.keyCode === 40 || e.keyCode === 38)) { e.preventDefault(); key(e.keyCode); }
      return;
    }
    if (NATIVE) return;
    var map = { 37: 37, 38: 38, 39: 39, 40: 40, 13: 13, 27: 27, 8: 27, 77: 1001, 79: 1000 };
    if (!(e.keyCode in map)) return;
    e.preventDefault();
    key(map[e.keyCode]);
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('.focusable');
    touch();
    if (ambientOpen()) { closeAmbient(); return; }
    if (!el) return;
    if (candidates().indexOf(el) < 0) return;
    focusEl(el); activate(el);
  });

  window.TVRemote = {
    key: key,
    home: function () {
      if (modalOpen()) closeModal(true);
      if (qpOpen()) closeQuickPanel(false);
      if (reorder) endReorder();
      if (searchActive()) endSearchInput(false);
      if (ambientOpen()) closeAmbient();
      touch();
      showPage('home');
      $('homeScroll').scrollTop = 0;
    },
    resume: function () {
      touch(); keptOn = null; loadUserImages(); renderAll(); refreshWeather(false); loadApps(); updateKeepOn();
      if (page === 'settings' && settingsTab === 'system') renderSettingsRows(true); // Home role may have changed meanwhile
    },
    imageImported: function (r) { touch(); onImageImported(r); },
    backupPicked: function (r) { touch(); onBackupPicked(r); },
    homeChanged: function () {
      var hs = homeStatus();
      toast(hs.isDefault ? tr('Solitary TV is now the default Home app') : tr('The default Home app was not changed'));
      log('HOME_STATUS', JSON.stringify(hs));
      if (page === 'settings') renderSettingsRows(true);
    },
    // Leaving the app (HOME, launching another app): nothing of ours keeps running over it.
    pause: function () {
      save(); // the receiver freezes background apps; persist before that can happen
      if (reorder) endReorder();
      if (searchActive()) endSearchInput(false);
      if (ambientOpen()) closeAmbient();
    },
    idle: function (ms) { lastInput = Date.now() - ms; idleTick(); },
    searchText: function (text) {
      touch();
      if (textEntry) { textEntryText(text); return; }
      if (page !== 'apps') showPage('apps');
      $('searchInput').value = String(text || '').slice(0, 80);
      onSearchInput();
    },
    searchDone: function () {
      if (textEntry) { endTextEntry(true); return; }
      log('SEARCH_DONE', $('searchInput').value); if (searchActive()) endSearchInput(true);
    },
    state: function () { return JSON.stringify({ page: page, focused: focused ? (focused.dataset.app || focused.dataset.nav || focused.dataset.action || focused.dataset.tab || focused.dataset.qp || focused.id || focused.className) : null, modal: modalOpen(), qp: qpOpen(), ambient: ambientOpen(), search: searchQuery, searchInput: searchActive(), reorder: reorder, cat: currentCat, timers: { slideshow: !!ssTimer, shift: !!ssShiftTimer }, keepOn: keptOn, wall: shownWall, settings: settings, apps: allApps.length, images: userImages.length }); }
  };

  // ================================================================ layout & boot
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080), st = $('stage');
    st.style.transform = 'scale(' + s + ')';
    st.style.left = Math.max(0, (window.innerWidth - 1920 * s) / 2) + 'px';
    st.style.top = Math.max(0, (window.innerHeight - 1080 * s) / 2) + 'px';
  }
  function refreshLanguage() {
    applyLanguage();
    allApps = sortApps(allApps);
    if (page === 'settings') renderSettingsTabs();
    renderNav();
    renderApps();
  }
  function applyLanguage() {
    settings.language = L.setLanguage(settings.language);
    L.apply(document);
    $('place').textContent = city();
  }

  /** System screensaver (SolitaryDream): only the screensaver, read-only, no timers for apps or idle. */
  function initDream() {
    log('DREAM_STARTED');
    document.body.classList.add('dream');
    try { applyLanguage(); } catch (e) { fail('LANGUAGE', e); }
    document.body.classList.add('ready');
    try { fit(); window.addEventListener('resize', fit); } catch (e) { fail('SHELL', e); }
    document.body.classList.toggle('reduce-motion', settings.motion === 'reduced');
    try { applyFonts(); } catch (e) { fail('FONTS', e); }
    try { window.TVPersonal.update(JSON.parse(NATIVE.dashboard())); } catch (e) { fail('DASHBOARD', e); }
    refreshWeather(false);
    openAmbient();
    setInterval(function () { renderAmbient(new Date()); }, 5000);
    setInterval(function () { refreshWeather(false); try { window.TVPersonal.update(JSON.parse(NATIVE.dashboard())); } catch (e) { /* keep last */ } }, 10 * 60e3);
  }

  function init() {
    if (DREAM) { initDream(); return; }
    log('BOOT_STARTED');
    try { applyLanguage(); } catch (e) { fail('LANGUAGE', e); }
    finally { document.body.classList.add('ready'); }
    try {
      Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) { el.innerHTML = I.ui[el.dataset.icon] || ''; });
      fit(); window.addEventListener('resize', fit);
      if (!window.TVApps.isAndroid) document.body.classList.add('preview');
    } catch (e) { fail('SHELL', e); }
    loadUserImages();
    try { applyLook(); } catch (e) { fail('LOOK', e); }
    try { renderNav(); } catch (e) { fail('NAV', e); }
    try { renderAll(); } catch (e) { fail('RENDER', e); }
    try { renderHome(); } catch (e) { fail('HOME_EMPTY', e); }
    showPage('home');
    if (NATIVE) { try { window.TVPersonal.update(JSON.parse(NATIVE.dashboard())); } catch (e) { fail('DASHBOARD', e); } }
    loadApps().then(function () {
      try { importSmartTv(false); } catch (e) { fail('IMPORT', e); }
      restoreFocus();
    });
    try {
      applyFocusStyle();
      var input = $('searchInput');
      input.addEventListener('input', onSearchInput);
      input.addEventListener('focus', function () { document.body.classList.add('typing'); touch(); });
      input.addEventListener('blur', function () { document.body.classList.remove('typing'); });
    } catch (e) { fail('FEATURES', e); }
    refreshWeather(false);
    // One clock interval and one idle interval for the app's lifetime (never re-created).
    setInterval(function () {
      var now = new Date(); renderClock(now); renderSky(now);
      if (qpOpen()) { $('qpTime').textContent = fmtTime(now); }
    }, 5000);
    setInterval(idleTick, 15000);
    setInterval(function () { refreshWeather(false); renderWeather(); renderPrayers(); }, 60e3);
    document.addEventListener('visibilitychange', function () { precip.pause(document.hidden); updateKeepOn(); });
    save();
    log('BOOT_COMPLETE');
  }

  init();
})();
