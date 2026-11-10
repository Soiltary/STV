// Installed apps through the Android bridge; a sample list when previewed in a desktop browser.
(function () {
  'use strict';

  var bridge = window.AndroidTV || null;

  function sampleIcon(name, fg, bg) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="' + bg +
      '"/><text x="160" y="104" font-family="Helvetica, Arial" font-weight="700" font-size="40" text-anchor="middle" fill="' +
      fg + '">' + name + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var SAMPLE = [
    ['dev.alder', 'Alder', '#f4ead7', '#16120d'], ['com.compass.tv', 'Compass TV', '#ffffff', '#111111'],
    ['app.onetube.tv', 'Nuvio + IPTV + 1Tube', '#ffffff', '#3b1f6e'], ['org.smarttube.stable', 'SmartTube', '#ffffff', '#e53935'],
    ['com.stremio.one', 'Stremio', '#ffffff', '#3a2a7a'], ['com.google.android.youtube.tv', 'YouTube', '#ff0033', '#ffffff'],
    ['com.netflix.ninja', 'Netflix', '#e50914', '#000000'], ['com.android.vending', 'Google Play Store', '#ffffff', '#0f9d58'],
    ['com.disney.disneyplus', 'Disney+', '#ffffff', '#0b2a43'], ['com.apple.atve.androidtv.appletv', 'Apple TV', '#ffffff', '#1c1c1e'],
    ['com.osn.go', 'OSN+', '#ffffff', '#111827'], ['org.videolan.vlc', 'VLC', '#ffffff', '#f97316']
  ];

  function list() {
    if (bridge) {
      return new Promise(function (resolve) { resolve(JSON.parse(bridge.listApps())); });
    }
    return Promise.resolve(SAMPLE.map(function (s) {
      return { id: s[0], name: s[1], icon: sampleIcon(s[1], s[2], s[3]), sample: true, tv: true };
    }).concat([{ id: 'system.settings', name: '', system: true, tv: true }]));
  }

  function launch(id) {
    if (bridge) return bridge.launch(id) ? Promise.resolve() : Promise.reject(new Error('launch failed'));
    return Promise.reject(new Error('Preview mode'));
  }

  function appInfo(id) { if (bridge) bridge.appInfo(id); }
  function exit() { if (bridge) bridge.exit(); }

  window.TVApps = { list: list, launch: launch, appInfo: appInfo, exit: exit, isAndroid: !!bridge };
})();
