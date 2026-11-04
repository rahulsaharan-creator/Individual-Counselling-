/**
 * Counselling Planner usage analytics: receiver.
 * Paste into the Google Sheet "Counselling Planner usage analytics" via Extensions > Apps Script,
 * then Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone).
 * The planner posts usage events here; each event becomes one row in the Events tab.
 */
var SHEET = 'Events';
var TZ = 'Asia/Kolkata';
var EVENTS = ['app_open', 'user_named', 'page_view', 'click', 'setting_change', 'upload_timetable', 'upload_students',
  'calculate', 'download_excel', 'import_settings', 'error', 'session_end'];

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return out('bad json'); }
  var list = (data && data.events) || [];
  if (!list.length) return out('empty');
  var rows = [];
  list.slice(0, 50).forEach(function (ev) {
    if (EVENTS.indexOf(ev.event) < 0) return;
    var t = new Date(ev.ts); if (isNaN(t)) t = new Date();
    var d = {}; try { d = JSON.parse(ev.details || '{}'); } catch (err) {}
    var day = new Date(Utilities.formatDate(t, TZ, "yyyy-MM-dd'T'00:00:00") + '+05:30');
    rows.push([t, day, Number(Utilities.formatDate(t, TZ, 'H')), s(ev.event), s(ev.feature), s(ev.user), s(ev.device), s(ev.session),
      s(ev.page), s(ev.browser), s(ev.os), s(ev.device_type), s(ev.screen), s(ev.version), s(ev.details, 400),
      typeof d.ok === 'boolean' ? d.ok : '', n(d.duration_s), n(d.active_s), n(d.ms), n(d.slots), n(d.students), n(ev.seq)]);
  });
  if (!rows.length) return out('nothing valid');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  } finally { lock.releaseLock(); }
  return out('ok ' + rows.length);
}

function doGet() { return out('Counselling Planner analytics is running.'); }

/* Strings are stored as plain text: a leading = + - @ is prefixed so a cell can never become a formula. */
function s(v, max) { v = v == null ? '' : String(v).slice(0, max || 150); return /^[=+\-@]/.test(v) ? "'" + v : v; }
function n(v) { return typeof v === 'number' && isFinite(v) ? v : ''; }
function out(msg) { return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT); }
