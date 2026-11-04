/* Usage analytics -> Google Sheet (Apps Script web app).
   Sends only usage events: who opened the app (the name they type once), which buttons and
   settings they used, counts and timings. Never sends file contents, student names,
   roll numbers or any cell values. */
(function () {
  var ENDPOINT = '__ANALYTICS_URL__';
  var APP_VERSION = '__APP_VERSION__';
  var UKEY = 'mcs_planner_user', DKEY = 'mcs_planner_device';
  var on = /^https:\/\/script\.google\.com\//.test(ENDPOINT);
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  var device = ls(DKEY); if (!device) { device = rid(); ls(DKEY, device); }
  var session = rid(), started = Date.now(), lastActive = Date.now(), activeMs = 0, clicks = 0, seq = 0, queue = [], ended = false;

  function envInfo() {
    var u = navigator.userAgent;
    var b = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'Other';
    var o = /Windows/.test(u) ? 'Windows' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Mac OS/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'Other';
    return { browser: b, os: o, device_type: /Mobi|Android|iPhone/.test(u) ? 'Mobile' : 'Desktop' };
  }
  var env = envInfo();

  function clean(v) { return v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, 150); }
  function track(event, props) {
    if (!on) return;
    props = Object.assign({}, props || {});
    var feature = props.feature || '';
    delete props.feature;
    queue.push({ ts: new Date().toISOString(), event: event, feature: clean(feature), user: ls(UKEY) || '', device: device, session: session, seq: ++seq,
      page: window.__plannerPage || '', version: APP_VERSION, browser: env.browser, os: env.os, device_type: env.device_type,
      screen: screen.width + 'x' + screen.height, details: JSON.stringify(props).slice(0, 400) });
    if (queue.length >= 10) flush(); else { clearTimeout(track._t); track._t = setTimeout(flush, 4000); }
  }
  function flush(beacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ events: queue.splice(0) });
    try {
      if (beacon && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: body }).catch(function () {});
    } catch (e) {}
  }

  /* Friendly names for buttons and settings, by element id or data attribute. */
  var NAMES = { calcBtn: 'Calculate schedule', themeBtn: 'Theme switch', ttFile: 'Upload timetable', recFile: 'Upload student data', clearData: 'Remove uploaded files',
    addCab: 'Add cabin', newCab: 'New cabin name', impB: 'Import room list', impT: 'Import teachers', expSet: 'Export settings', impSet: 'Import settings',
    resetSet: 'Reset everything to defaults', resetRules: 'Restore default rules', optMove: 'Move slots when cabins are full', addSlot: 'Add slot',
    dl: 'Download Excel', sSearch: 'Student search', restoreAll: 'Put excluded students back', eSave: 'Slot edit: save', eDel: 'Slot edit: remove slot',
    'data-step': 'Step tab', 'data-go': 'Go to step', 'data-view': 'Schedule view', 'data-pid': 'Open slot', 'data-excl': 'Replace student',
    'data-delcab': 'Delete cabin', 'data-rmove': 'Move rule', 'data-rdel': 'Delete rule', 'data-delred': 'Delete building reduction', 'data-delt': 'Delete teacher',
    'data-delb': 'Delete batch building', 'data-use': 'Use period for counselling', 'data-mv': 'Auto-move period', 'data-drop': 'Drop file' };
  var VALUE_OK = { 'data-step': 1, 'data-go': 1, 'data-view': 1, 'data-use': 1, 'data-mv': 1 };
  function featureOf(el) {
    if (el.id && NAMES[el.id]) return NAMES[el.id];
    for (var k in NAMES) if (k.indexOf('data-') === 0 && el.hasAttribute(k)) return NAMES[k] + (VALUE_OK[k] ? ': ' + el.getAttribute(k) : '');
    if (el.closest('.toc')) return 'Index: ' + clean(el.textContent).slice(0, 40);
    if (el.id) return '#' + el.id;
    var t = clean(el.getAttribute('aria-label') || el.textContent).replace(/\d+/g, '#');
    return t.length && t.length <= 40 ? t : (el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : ''));
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('button, a, summary, label.toggle, [role=button], [data-pid], [data-drop]');
    if (!el) return; clicks++;
    if (el.matches('label.toggle')) return; /* the checkbox change event records it */
    if (el.closest('.mcs-who')) return;
    track('click', { feature: featureOf(el) });
  }, true);
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el || !el.matches || el.type === 'file' || el.closest('.mcs-who')) return; /* upload events record files */
    var d = {}; if (el.type === 'checkbox') d.on = el.checked;
    var name = featureOf(el);
    if (/^(input|select|textarea)/.test(name)) { var lab = el.closest('label, .field, .row, tr'); name = 'Setting: ' + (lab ? clean(lab.textContent).replace(/\d+/g, '#').slice(0, 40) : name); }
    d.feature = name; track('setting_change', d);
  }, true);

  /* Session time: active = page visible and used in the last 2 minutes. */
  var lastTick = Date.now();
  function tick() { var n = Date.now(); if (document.visibilityState === 'visible' && n - lastActive < 120000) activeMs += Math.min(n - lastTick, 15000); lastTick = n; }
  setInterval(tick, 5000);
  ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(function (ev) { addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true, capture: true }); });
  function end() { if (ended) return; ended = true; tick(); track('session_end', { duration_s: Math.round((Date.now() - started) / 1000), active_s: Math.round(activeMs / 1000), clicks: clicks }); flush(true); }
  addEventListener('pagehide', end);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });

  addEventListener('error', function (e) { track('error', { kind: 'script', message: clean(e.message), line: e.lineno }); });
  addEventListener('unhandledrejection', function (e) { track('error', { kind: 'promise', message: clean(e.reason && e.reason.message || e.reason) }); });
  var nativeAlert = window.alert; window.alert = function (m) { track('error', { kind: 'shown_to_user', message: clean(m) }); return nativeAlert.call(window, m); };

  /* Ask for the user's name once per browser, so the sheet can show who used it. */
  function askName(cb) {
    if (!on || ls(UKEY)) return cb();
    var d = document.createElement('div');
    d.className = 'mcs-who';
    d.innerHTML = '<form><h3>Welcome to Counselling Planner</h3><p>Enter your name. It is used only to see who uses the planner and which parts are useful.</p>' +
      '<input required maxlength="60" autocomplete="name" placeholder="Your full name" aria-label="Your full name"><button class="btn primary" type="submit">Continue</button></form>';
    document.body.appendChild(d);
    d.querySelector('form').onsubmit = function (e) { e.preventDefault(); var v = clean(d.querySelector('input').value).slice(0, 60); if (!v) return; ls(UKEY, v); d.remove(); track('user_named', {}); cb(); };
    setTimeout(function () { d.querySelector('input').focus(); }, 50);
  }
  window.track = track;
  function start() { askName(function () { track('app_open', { returning: !!ls('mcs_planner_settings_v1') }); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
