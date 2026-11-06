/* MCS Counselling Planner – scheduling engine (browser + Node) */
(function (root) {
  'use strict';
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const SLOTS = ['M1', 'M2', 'M3', 'E1', 'E2', 'E3'];
  const COUNSEL_SHIFTS = ['M2', 'M3', 'E2', 'E3'];
  const S = v => (v === null || v === undefined) ? '' : String(v).trim();
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function defaultRules() {
    return [
      { id: 'r1', name: 'Teaches the batch', on: true, tType: 'all', tValue: '', sType: 'taught', sValue: '' },
      { id: 'r2', name: 'Same class group', on: true, tType: 'all', tValue: '', sType: 'group', sValue: '' }
    ];
  }
  const activeShifts = st => SLOTS.filter(s => st.counselShifts ? st.counselShifts[s] : COUNSEL_SHIFTS.includes(s));
  const moveShifts = st => activeShifts(st).filter(s => !st.autoMoveShifts || st.autoMoveShifts[s]);
  const list = v => S(v).split(/[,\n]/).map(S).filter(Boolean);

  function defaultSettings(master) {
    return {
      weekStart: '',
      cabins: ['20', '21', '22'],
      cabinBuildings: { '20': 'M1', '21': 'M1', '22': 'M1' },
      keyword: 'Counselling',
      shifts: { M1: ['07:00', '08:45'], M2: ['09:00', '10:45'], M3: ['11:00', '12:45'], E1: ['14:00', '15:45'], E2: ['16:00', '17:45'], E3: ['18:00', '19:45'] },
      counselShifts: { M1: false, M2: true, M3: true, E1: false, E2: true, E3: true },
      autoMoveShifts: { M1: false, M2: true, M3: true, E1: false, E2: true, E3: true },
      baseStudents: 9,
      reduceBuildings: ['M3', 'M3 old', 'M4', 'GP'],
      knownBuildings: ['M1', 'M2', 'M3', 'M4', 'MHS2', 'GP', 'PC'],
      checks: { M1: { before: '', after: 'M2' }, M2: { before: 'M1', after: 'M3' }, M3: { before: 'M2', after: '' }, E1: { before: '', after: 'E2' }, E2: { before: 'E1', after: 'E3' }, E3: { before: 'E2', after: '' } },
      pcVenueBuilding: 'PC',
      classGroups: '11th, FTP | 12th | Target',
      strictClass: true,
      onceRound: true,
      protectSenior: true,
      seniorClasses: '12th, Target',
      moveOverflow: true,
      noRepeatTeacher: true,
      oppositeShiftOnly: true,
      minGapDays: 0,
      rules: defaultRules(),
      batchBuildings: (master && master.batchBuildings) || {},
      batchRooms: (master && master.batchRooms) || {},
      teachers: (master && master.teachers) || {}
    };
  }

  /* ---------- helpers ---------- */
  const toSec = t => { const m = /^(\d{1,2}):(\d{2})/.exec(S(t)); return m ? (+m[1]) * 3600 + (+m[2]) * 60 : 0; };
  const hm = s => String(Math.floor(s / 3600)).padStart(2, '0') + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  function excelDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    if (typeof v === 'number') { if (v < 20000 || v > 80000) return null; return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); }
    const s = S(v); let m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s))) { const y = +m[3] < 100 ? 2000 + (+m[3]) : +m[3]; return new Date(Date.UTC(y, m[2] - 1, +m[1])); }
    return null;
  }
  const iso = d => d ? d.toISOString().slice(0, 10) : '';
  function addDays(isoStr, n) { const d = new Date(isoStr + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }

  /* ---------- timetable ---------- */
  function parseTimetable(rows) {
    const warnings = [];
    let hdr = -1;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const row = rows[r] || [];
      if (/^teacher$/i.test(S(row[0])) && row.some(v => /^M1$/i.test(S(v)))) { hdr = r; break; }
    }
    if (hdr < 0) throw new Error('Could not find the header row. The timetable needs a row starting with "Teacher" followed by M1, M2, M3, E1, E2, E3 for each day.');
    const header = rows[hdr], dayRow = rows[hdr - 1] || [];
    const cols = []; let curDay = null, dayIdx = -1;
    for (let c = 1; c < header.length; c++) {
      const dv = S(dayRow[c]).toLowerCase();
      const di = DAYS.findIndex(d => dv.startsWith(d.slice(0, 3).toLowerCase()));
      if (di >= 0) { curDay = DAYS[di]; dayIdx = di; }
      const sl = S(header[c]).toUpperCase();
      if (SLOTS.includes(sl) && curDay) cols.push({ c, day: curDay, slot: sl });
    }
    if (!cols.length) throw new Error('No day columns found. Check that the row above the header names the days (Monday … Saturday).');
    let weekStart = '';
    for (let r = 0; r < hdr; r++) {
      const txt = (rows[r] || []).map(S).join(' ');
      const m = /(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/.exec(txt);
      if (m && MONTHS[m[2].toLowerCase()] !== undefined) { weekStart = iso(new Date(Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]))); break; }
    }
    const entries = [], teachers = [];
    for (let r = hdr + 1; r < rows.length; r++) {
      const row = rows[r] || []; const t = S(row[0]);
      if (!t || /^teacher$/i.test(t)) continue;
      const nxt = rows[r + 1] || []; const pair = r + 1 < rows.length && !S(nxt[0]);
      if (teachers.includes(t)) warnings.push(`Teacher ${t} appears twice in the timetable; both rows were read.`);
      teachers.push(t);
      for (const col of cols) {
        const subj = S(row[col.c]); const room = pair ? S(nxt[col.c]) : '';
        if (subj || room) entries.push({ t, day: col.day, slot: col.slot, subj, room });
      }
    }
    return { entries, teachers: [...new Set(teachers)], weekStart, warnings };
  }

  /* ---------- students / history ---------- */
  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
      const h = (rows[r] || []).map(v => S(v).toLowerCase());
      const roll = h.findIndex(x => /roll/.test(x)), batch = h.findIndex(x => /^batch/.test(x));
      if (roll >= 0 && batch >= 0) return { r, h };
    }
    return null;
  }
  function parseStudents(sheets, teacherCodes) {
    // sheets: [{name, rows}]
    const codes = new Set(teacherCodes);
    const out = []; const used = [];
    for (const sh of sheets) {
      const f = findHeader(sh.rows); if (!f) continue;
      const h = f.h;
      const ix = re => h.findIndex(x => re.test(x));
      const roll = ix(/roll/), batch = ix(/^batch/), name = ix(/name/), course = ix(/course|program/), date = ix(/^date/);
      const cands = h.map((x, i) => (/counsel|teacher/.test(x) ? i : -1)).filter(i => i >= 0);
      let cIdx = -1, best = -1;
      for (const ci of cands) {
        let hit = 0; for (let r = f.r + 1; r < Math.min(sh.rows.length, f.r + 400); r++) if (codes.has(S((sh.rows[r] || [])[ci]))) hit++;
        if (hit > best) { best = hit; cIdx = ci; }
      }
      let n = 0;
      for (let r = f.r + 1; r < sh.rows.length; r++) {
        const row = sh.rows[r] || []; const rl = S(row[roll]).replace(/\.0$/, ''); const b = S(row[batch]);
        if (!rl || !b || !/^\d+$/.test(rl)) continue;
        out.push({ roll: rl, name: S(row[name]), batch: b, course: course >= 0 ? S(row[course]) : '', date: date >= 0 ? excelDate(row[date]) : null, by: cIdx >= 0 ? S(row[cIdx]) : '' });
        n++;
      }
      used.push({ sheet: sh.name, rows: n, counsellorColumn: cIdx >= 0 ? S(sh.rows[f.r][cIdx]) : '(none)' });
    }
    return { records: out, used };
  }
  // extra: saved counselling records [{roll, date (yyyy-mm-dd), by}] added to the history of known students
  function buildStudents(records, weekStart, extra) {
    const cut = weekStart ? new Date(weekStart + 'T00:00:00Z') : null;
    const st = new Map();
    for (const rec of records) {
      let s = st.get(rec.roll);
      const d = rec.date;
      if (!s) { s = { roll: rec.roll, name: rec.name, batch: rec.batch, course: rec.course, cls: rec.cls || '', seen: d, hist: new Map() }; st.set(rec.roll, s); }
      else if (rec.cls && !s.cls) s.cls = rec.cls;
      else if (d && (!s.seen || d >= s.seen)) { s.seen = d; s.batch = rec.batch; s.name = rec.name || s.name; s.course = rec.course || s.course; }
      if (d && rec.by && (!cut || d < cut)) s.hist.set(iso(d), rec.by);
    }
    for (const x of extra || []) {
      const s = st.get(S(x.roll)); if (!s || !x.date || (weekStart && x.date >= weekStart)) continue;
      s.hist.set(x.date, S(x.by));
    }
    for (const s of st.values()) {
      const h = [...s.hist.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
      s.history = h.map(([date, by]) => ({ date, by }));
      s.times = h.length; s.last = h.length ? h[h.length - 1][0] : ''; s.teachersSeen = new Set(h.map(x => x[1]));
      delete s.hist;
    }
    return st;
  }

  /* ---------- student data template: the only accepted student file ---------- */
  // Students: one row per student now studying.  History: one row per counselling already held.
  const TEMPLATE = {
    students: { sheet: 'Students', cols: ['Roll No', 'Student Name', 'Batch', 'Class', 'Status', 'Course'], required: ['Roll No', 'Student Name', 'Batch', 'Class'] },
    history: { sheet: 'Counselling History', cols: ['Roll No', 'Date', 'Counsellor Code', 'Result'], required: ['Roll No', 'Date', 'Counsellor Code'] },
    classes: ['11th', '12th', 'Target'], status: ['Active', 'Left'], results: ['Done', 'Absent']
  };
  const normH = v => S(v).toLowerCase().replace(/[^a-z]/g, '');
  const normRoll = v => { if (typeof v === 'number') return Number.isInteger(v) ? String(v) : ''; const x = S(v).replace(/\s+/g, '').replace(/\.0+$/, ''); return /^\d+$/.test(x) ? x : ''; };
  const normBatch = v => S(v).toUpperCase().replace(/\s+/g, '');
  const normClass = v => { const x = S(v).toLowerCase().replace(/[^a-z0-9]/g, ''); return ['11', '11th', 'xi', 'class11'].includes(x) ? '11th' : ['12', '12th', 'xii', 'class12'].includes(x) ? '12th' : ['target', 'tgt', 'dropper', '13'].includes(x) ? 'Target' : ''; };
  const normStatus = v => { const x = S(v).toLowerCase(); return !x || ['active', 'studying', 'yes'].includes(x) ? 'Active' : ['left', 'inactive', 'dropped', 'drop', 'no', 'transferred'].includes(x) ? 'Left' : ''; };
  const normResult = v => { const x = S(v).toLowerCase(); return !x || ['done', 'yes', 'present', 'p', 'held', 'completed'].includes(x) ? 'Done' : ['absent', 'a', 'no', 'not done', 'missed', 'cancelled'].includes(x) ? 'Absent' : ''; };
  // a calendar day from an Excel cell, the same in every time zone; null when it is not a real date
  function dayOf(v) {
    if (v instanceof Date) { if (isNaN(v)) return null; const d = new Date(v.getTime() + 12 * 3600000); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    if (typeof v === 'number') return excelDate(v);
    const s = S(v); let m, y, mo, da;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) [y, mo, da] = [+m[1], +m[2], +m[3]];
    else if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/.exec(s))) [da, mo, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + (+m[3]) : +m[3]];
    else if ((m = /^(\d{1,2})[\s\-]([A-Za-z]{3})[a-z]*[\s\-,]+(\d{4})$/.exec(s)) && MONTHS[m[2].toLowerCase()] !== undefined) [da, mo, y] = [+m[1], MONTHS[m[2].toLowerCase()] + 1, +m[3]];
    else return null;
    const d = new Date(Date.UTC(y, mo - 1, da));
    return d.getUTCMonth() === mo - 1 && d.getUTCDate() === da ? d : null;
  }
  // sheets: [{name, rows}]. Returns { ok, fatal } or { ok, records, issues, stats, used }.
  // issues: { level: 'error' (row not used) | 'warn' (used, but check it) | 'info', sheet, row (Excel row number), msg }
  function readTemplate(sheets, teacherCodes, weekStart) {
    const find = n => sheets.find(s => S(s.name).toLowerCase() === n.toLowerCase());
    const fail = msg => ({ ok: false, fatal: msg + ' Download the template from Set up, copy your data into it and upload it again.' });
    const sSh = find(TEMPLATE.students.sheet), hSh = find(TEMPLATE.history.sheet);
    if (!sSh) return fail('This file is not in the student template: it has no sheet named "Students".');
    if (!hSh) return fail('This file is not in the student template: it has no sheet named "Counselling History". Keep the sheet even when it is empty.');
    const colsOf = (sh, spec) => {
      const h = (sh.rows[0] || []).map(normH), ix = {};
      for (const c of spec.cols) ix[c] = h.indexOf(normH(c));
      const miss = spec.required.filter(c => ix[c] < 0);
      return { ix, miss };
    };
    const sc = colsOf(sSh, TEMPLATE.students), hc = colsOf(hSh, TEMPLATE.history);
    if (sc.miss.length) return fail(`The "Students" sheet is missing the column${sc.miss.length > 1 ? 's' : ''} ${sc.miss.map(c => `"${c}"`).join(', ')} in row 1.`);
    if (hc.miss.length) return fail(`The "Counselling History" sheet is missing the column${hc.miss.length > 1 ? 's' : ''} ${hc.miss.map(c => `"${c}"`).join(', ')} in row 1.`);
    const issues = [], add = (level, sheet, row, msg) => issues.push({ level, sheet, row, msg });
    const codes = new Set(teacherCodes || []);
    const get = (row, ix, c) => ix[c] >= 0 ? row[ix[c]] : null;
    // Students
    const roster = new Map(); let left = 0; const clsByBatch = {};
    for (let r = 1; r < sSh.rows.length; r++) {
      const row = sSh.rows[r] || [], X = r + 1;
      if (!row.some(v => S(v))) continue;
      const rawRoll = get(row, sc.ix, 'Roll No'), roll = normRoll(rawRoll), name = S(get(row, sc.ix, 'Student Name')).replace(/\s+/g, ' ');
      const batch = normBatch(get(row, sc.ix, 'Batch')), cls = normClass(get(row, sc.ix, 'Class')), status = normStatus(get(row, sc.ix, 'Status')), course = S(get(row, sc.ix, 'Course'));
      if (!roll) { add('error', 'Students', X, S(rawRoll) ? `Roll No "${S(rawRoll)}" is not a number.` : 'Roll No is empty.'); continue; }
      if (!name) { add('error', 'Students', X, `Student Name is empty for roll ${roll}.`); continue; }
      if (!batch) { add('error', 'Students', X, `Batch is empty for roll ${roll}.`); continue; }
      if (!cls) { add('error', 'Students', X, `Class "${S(get(row, sc.ix, 'Class'))}" for roll ${roll} is not 11th, 12th or Target.`); continue; }
      if (!status) { add('error', 'Students', X, `Status "${S(get(row, sc.ix, 'Status'))}" for roll ${roll} is not Active or Left.`); continue; }
      if (roster.has(roll)) { const o = roster.get(roll); add('error', 'Students', X, `Roll ${roll} is already on row ${o.row}${o.batch !== batch ? ` (batch ${o.batch}; here ${batch})` : ''}. Each student must appear once; this row was not used.`); continue; }
      roster.set(roll, { roll, name, batch, cls, course, status, row: X });
      if (status === 'Left') { left++; continue; }
      (clsByBatch[batch] = clsByBatch[batch] || {})[cls] = (clsByBatch[batch][cls] || 0) + 1;
    }
    for (const [b, m] of Object.entries(clsByBatch)) if (Object.keys(m).length > 1) add('warn', 'Students', null, `Batch ${b} has students of more than one class (${Object.entries(m).map(([c, n]) => `${n} ${c}`).join(', ')}). The batch is treated as ${Object.entries(m).sort((a, b2) => b2[1] - a[1])[0][0]}.`);
    // History
    const seen = new Map(); let used = 0, absent = 0, later = 0, dupes = 0; const unknown = {};
    const recs = [];
    for (let r = 1; r < hSh.rows.length; r++) {
      const row = hSh.rows[r] || [], X = r + 1;
      if (!row.some(v => S(v))) continue;
      const rawRoll = get(row, hc.ix, 'Roll No'), roll = normRoll(rawRoll), rawDate = get(row, hc.ix, 'Date'), d = dayOf(rawDate);
      const by = S(get(row, hc.ix, 'Counsellor Code')).toUpperCase(), result = normResult(get(row, hc.ix, 'Result'));
      if (!roll) { add('error', 'Counselling History', X, S(rawRoll) ? `Roll No "${S(rawRoll)}" is not a number.` : 'Roll No is empty.'); continue; }
      if (!d) { add('error', 'Counselling History', X, S(rawDate) ? `Date "${S(rawDate)}" for roll ${roll} is not a real date. Use dd-mm-yyyy.` : `Date is empty for roll ${roll}.`); continue; }
      if (!by) { add('error', 'Counselling History', X, `Counsellor Code is empty for roll ${roll}.`); continue; }
      if (!result) { add('error', 'Counselling History', X, `Result "${S(get(row, hc.ix, 'Result'))}" for roll ${roll} is not Done or Absent.`); continue; }
      const st = roster.get(roll);
      if (!st) { add('warn', 'Counselling History', X, `Roll ${roll} is not on the Students sheet; this row was not used.`); continue; }
      if (st.status === 'Left') continue;
      if (result === 'Absent') { absent++; continue; }
      const day = iso(d);
      if (weekStart && day >= weekStart) later++; // kept: buildStudents counts it once the week moves past it
      const k = roll + '|' + day;
      if (seen.has(k)) { dupes++; if (seen.get(k) !== by) add('warn', 'Counselling History', X, `Roll ${roll} has two counsellings on ${day} (${seen.get(k)} and ${by}); counted once.`); continue; }
      seen.set(k, by);
      if (codes.size && !codes.has(by)) unknown[by] = (unknown[by] || 0) + 1;
      recs.push({ roll, name: st.name, batch: st.batch, course: st.course, cls: st.cls, date: d, by }); used++;
    }
    for (const [c, n] of Object.entries(unknown)) add('warn', 'Counselling History', null, `Counsellor code ${c} (${n} row${n > 1 ? 's' : ''}) is not in the teacher list. These counsellings still count, but "met this teacher" cannot be checked for ${c}. Use the short code from the timetable, or add ${c} to the teacher list.`);
    if (absent) add('info', 'Counselling History', null, `${absent} row${absent > 1 ? 's are' : ' is'} marked Absent and not counted as counselled.`);
    if (later) add('info', 'Counselling History', null, `${later} row${later > 1 ? 's are' : ' is'} dated on or after the week start; they count from a later week.`);
    if (dupes) add('info', 'Counselling History', null, `${dupes} repeated row${dupes > 1 ? 's' : ''} (same student, same day) counted once.`);
    if (left) add('info', 'Students', null, `${left} student${left > 1 ? 's are' : ' is'} marked Left and will not be booked.`);
    // every active student gets a row, so students with no history are included
    const active = [...roster.values()].filter(s => s.status === 'Active');
    const records = active.map(s => ({ roll: s.roll, name: s.name, batch: s.batch, course: s.course, cls: s.cls, date: null, by: '' })).concat(recs);
    const stats = { students: active.length, left, history: used, absent, later, dupes, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warn').length };
    if (!active.length) return { ok: false, fatal: 'No usable student rows were found on the "Students" sheet.', issues, stats };
    return { ok: true, records, issues, stats, used: [{ sheet: 'Students', rows: active.length, counsellorColumn: '-' }, { sheet: 'Counselling History', rows: used, counsellorColumn: 'Counsellor Code' }] };
  }

  // Writes the student template into an ExcelJS workbook. data: { teachers: {code: {name}}, students: [[roll, name, batch, class, status, course]], history: [[roll, Date, code, result]] }
  function fillTemplate(wb, data) {
    const NAVY = 'FF1F3864', solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const head = (ws, cols, widths, notes) => {
      const r = ws.getRow(1); cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = solid(TEMPLATE.students.required.concat(TEMPLATE.history.required).includes(c) ? NAVY : 'FF2F5597'); x.alignment = { vertical: 'middle' }; if (notes[i]) x.note = notes[i]; });
      r.height = 22; widths.forEach((w, i) => ws.getColumn(i + 1).width = w);
    };
    const how = wb.addWorksheet('How to fill');
    const lines = [
      ['Counselling Planner: student data template', 'title'],
      ['Upload this file on the Set up page. The planner accepts student data only in this format.', ''],
      ['', ''],
      ['Sheet "Students": one row per student', 'h'],
      ['Roll No (required): digits only, for example 51103618. Each roll number once.', ''],
      ['Student Name (required).', ''],
      ['Batch (required): written exactly as in the faculty timetable, for example XA1. Spaces are removed and letters made capital.', ''],
      ['Class (required): 11th, 12th or Target. Students meet only teachers of their own class group.', ''],
      ['Status: Active or Left. Empty means Active. Keep students who left and mark them Left, so their history is kept but they are not booked.', ''],
      ['Course: optional, for example Momentum.', ''],
      ['When a student changes batch, change the Batch on their one row. Do not add a second row.', ''],
      ['', ''],
      ['Sheet "Counselling History": one row per counselling already held', 'h'],
      ['Roll No (required): must also be on the Students sheet.', ''],
      ['Date (required): the day of the counselling, as a date (dd-mm-yyyy).', ''],
      ['Counsellor Code (required): the teacher short code used in the timetable, for example ARV. Not the employee code.', ''],
      ['Result: Done or Absent. Empty means Done. Only Done counts as counselled; Absent students stay due.', ''],
      ['Only counsellings that already happened. Do not add planned bookings for future dates.', ''],
      ['', ''],
      ['What the planner does with problems', 'h'],
      ['A row with an error (empty roll, bad date, unknown class, roll repeated) is not used. The upload shows each one with its row number.', ''],
      ['Warnings (an unknown counsellor code, a history roll not on the Students sheet, a batch with two classes) are shown but do not stop the upload.', ''],
      ['The same student on the same day twice is counted once. Rows dated on or after the planned week are not counted yet.', ''],
      ['Do not rename the sheets or the column headings in row 1. Extra columns are ignored.', '']
    ];
    lines.forEach(([t, k], i) => { const c = how.getCell(i + 1, 1); c.value = t; c.font = { name: 'Arial', size: k === 'title' ? 14 : 10, bold: !!k, color: { argb: k ? NAVY : 'FF000000' } }; c.alignment = { wrapText: true, vertical: 'top' }; });
    how.getColumn(1).width = 110;
    const sw = wb.addWorksheet('Students', { views: [{ state: 'frozen', ySplit: 1 }] });
    head(sw, TEMPLATE.students.cols, [14, 30, 10, 10, 10, 16], ['Digits only. Once per student.', '', 'As written in the timetable, e.g. XA1', '11th, 12th or Target', 'Active or Left (empty = Active)', 'Optional']);
    sw.getColumn(1).numFmt = '0';
    (data.students || []).forEach((r, i) => { sw.getRow(i + 2).values = r; });
    const hw = wb.addWorksheet('Counselling History', { views: [{ state: 'frozen', ySplit: 1 }] });
    head(hw, TEMPLATE.history.cols, [14, 14, 16, 10], ['Must be on the Students sheet', 'dd-mm-yyyy', 'Teacher short code from the timetable', 'Done or Absent (empty = Done)']);
    hw.getColumn(1).numFmt = '0'; hw.getColumn(2).numFmt = 'dd-mm-yyyy';
    (data.history || []).forEach((r, i) => { hw.getRow(i + 2).values = r; });
    const lw = wb.addWorksheet('Lists');
    lw.getRow(1).values = ['Class', 'Status', 'Result', 'Counsellor Code', 'Teacher name']; lw.getRow(1).font = { bold: true };
    const tc = Object.entries(data.teachers || {}).sort((a, b) => a[0] < b[0] ? -1 : 1);
    TEMPLATE.classes.forEach((v, i) => lw.getCell(i + 2, 1).value = v);
    TEMPLATE.status.forEach((v, i) => lw.getCell(i + 2, 2).value = v);
    TEMPLATE.results.forEach((v, i) => lw.getCell(i + 2, 3).value = v);
    tc.forEach(([c, t], i) => { lw.getCell(i + 2, 4).value = c; lw.getCell(i + 2, 5).value = (t && t.name) || ''; });
    [10, 10, 10, 16, 28].forEach((w, i) => lw.getColumn(i + 1).width = w);
    const nS = Math.max(20000, (data.students || []).length + 5000), nH = Math.max(50000, (data.history || []).length + 20000);
    const list = (ws, ref, f, title) => ws.dataValidations.add(ref, { type: 'list', allowBlank: true, formulae: [f], showErrorMessage: true, errorStyle: 'error', errorTitle: title, error: `Choose ${title} from the list.` });
    list(sw, `D2:D${nS}`, '"11th,12th,Target"', 'a class');
    list(sw, `E2:E${nS}`, '"Active,Left"', 'a status');
    list(hw, `D2:D${nH}`, '"Done,Absent"', 'a result');
    if (tc.length) hw.dataValidations.add(`C2:C${nH}`, { type: 'list', allowBlank: true, formulae: [`Lists!$D$2:$D$${tc.length + 1}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown code', error: 'This code is not in the teacher list. Use the short code from the timetable.' });
    hw.dataValidations.add(`B2:B${nH}`, { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2020, 0, 1))], showErrorMessage: true, errorTitle: 'Not a date', error: 'Enter the date as dd-mm-yyyy.' });
    sw.dataValidations.add(`A2:A${nS}`, { type: 'whole', operator: 'greaterThan', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: 'Roll No', error: 'Roll No must be a number.' });
    hw.dataValidations.add(`A2:A${nH}`, { type: 'whole', operator: 'greaterThan', allowBlank: true, formulae: [0], showErrorMessage: true, errorTitle: 'Roll No', error: 'Roll No must be a number.' });
    return wb;
  }

  /* ---------- core rules ---------- */
  function makeCtx(tt, settings) {
    const cell = new Map(); const occ = new Map();
    for (const e of tt.entries) {
      cell.set(e.t + '|' + e.day + '|' + e.slot, e);
      if (e.room) { if (!occ.has(e.room)) occ.set(e.room, new Set()); occ.get(e.room).add(e.day + '|' + e.slot); }
    }
    const kw = settings.keyword.toLowerCase();
    const isCounsel = e => (e.room + ' ' + e.subj).toLowerCase().includes(kw);
    const isDoubt = room => /dbt|doubt/i.test(room);
    const known = new Set(settings.knownBuildings); const reduce = new Set(settings.reduceBuildings);
    function building(code) {
      const x = S(code); if (!x) return null;
      if (x.toLowerCase().startsWith('m3 old')) return 'M3 old';
      const first = x.split(/\s+/)[0]; if (known.has(first)) return first;
      return settings.batchBuildings[x] || null;
    }
    const slotLen = sl => toSec(settings.shifts[sl][1]) - toSec(settings.shifts[sl][0]);
    const unit = sl => slotLen(sl) / settings.baseStudents;
    function compute(t, day, sl) {
      const chk = (settings.checks && settings.checks[sl]) || {}; let bf = false, af = false; const why = [];
      for (const [dir, adj] of [['before', chk.before], ['after', chk.after]]) {
        if (!adj) continue; const e = cell.get(t + '|' + day + '|' + adj);
        if (!e || !e.room || isCounsel(e)) continue; const b = building(e.room);
        if (b && reduce.has(b)) { why.push(`${adj} ${e.room} in ${b} (${dir}) −1`); if (dir === 'before') bf = true; else af = true; }
      }
      const k = settings.baseStudents - (bf ? 1 : 0) - (af ? 1 : 0);
      const st = toSec(settings.shifts[sl][0]) + (bf ? unit(sl) : 0);
      const en = af ? st + unit(sl) * k : toSec(settings.shifts[sl][1]);
      let venue = 'M1 Building', pc = false;
      for (const adj of [chk.before, chk.after]) { if (!adj) continue; const e = cell.get(t + '|' + day + '|' + adj); if (e && building(e.room) === settings.pcVenueBuilding) { venue = 'PC Campus'; pc = true; break; } }
      return { k, start: st, end: en, rule: why.join('; ') || 'No reduction', venue, pc, site: split ? (pc ? 'PC' : 'Main') : 'All' };
    }
    const teacherFree = (t, day, sl) => !cell.has(t + '|' + day + '|' + sl);
    // cabins and campuses: when at least one cabin is in the PC building, PC and the main campus are planned separately
    const cabinsAll = settings.cabins.filter(Boolean);
    const cabinBld = c => S((settings.cabinBuildings || {})[c]);
    const split = !!settings.pcVenueBuilding && cabinsAll.some(c => cabinBld(c) === settings.pcVenueBuilding);
    const siteOfCabin = c => !split ? 'All' : cabinBld(c) === settings.pcVenueBuilding ? 'PC' : 'Main';
    const cabinsFor = site => cabinsAll.filter(c => siteOfCabin(c) === site);
    const siteOfBatch = b => !split ? 'All' : building(b) === settings.pcVenueBuilding ? 'PC' : 'Main';
    // teacher class: from the teacher list; a teacher with no class set and no classes this week is a new (FTP) teacher
    const teaching = new Set(); for (const e of tt.entries) if (e.room && !isCounsel(e) && !isDoubt(e.room)) teaching.add(e.t);
    const setCls = t => S((settings.teachers[t] || {}).cls);
    const tClass = t => setCls(t) || (teaching.has(t) ? '' : 'FTP');
    const inferredFTP = t => !setCls(t) && !teaching.has(t);
    const senior = new Set(list(settings.seniorClasses || ''));
    const isSenior = t => settings.protectSenior !== false && senior.has(tClass(t));
    return { cell, occ, isCounsel, isDoubt, building, compute, teacherFree, unit, split, cabinsAll, cabinBld, siteOfCabin, cabinsFor, siteOfBatch, tClass, inferredFTP, isSenior };
  }
  const SITE_NAME = { PC: 'PC campus', Main: 'the main campus', All: 'any building' };

  function workload(tt, ctx, plan) {
    const w = {};
    for (const e of tt.entries) {
      if (ctx.isCounsel(e)) continue;
      const x = w[e.t] || (w[e.t] = { perDay: Object.fromEntries(DAYS.map(d => [d, 0])), regular: 0, doubt: 0, counselling: 0 });
      x.perDay[e.day]++; if (ctx.isDoubt(e.room)) x.doubt++; else x.regular++;
    }
    for (const p of plan) { const x = w[p.t] || (w[p.t] = { perDay: Object.fromEntries(DAYS.map(d => [d, 0])), regular: 0, doubt: 0, counselling: 0 }); x.counselling++; }
    for (const t in w) w[t].total = w[t].regular + w[t].doubt + w[t].counselling;
    return w;
  }

  /* Step 1+2: counselling slots, overflow moves, cabins, student counts */
  function buildPlan(tt, settings) {
    const ctx = makeCtx(tt, settings); const cabins = settings.cabins.filter(Boolean); const warnings = [];
    const SH = activeShifts(settings), MV = moveShifts(settings);
    let plan = tt.entries.filter(e => ctx.isCounsel(e) && SH.includes(e.slot))
      .map((e, i) => ({ id: 'p' + i, t: e.t, origDay: e.day, origShift: e.slot, day: e.day, shift: e.slot, label: e.room || e.subj, moved: false, manual: false }));
    tt.entries.filter(e => ctx.isCounsel(e) && !SH.includes(e.slot)).forEach(e => warnings.push(`${e.t} has a counselling cell on ${e.day} ${e.slot}, but ${e.slot} is switched off for counselling, so it was skipped.`));
    plan.forEach(p => { p.site = ctx.compute(p.t, p.day, p.shift).site; });
    const at = (d, s, site) => plan.filter(p => p.day === d && p.shift === s && p.site === site);
    const cap = site => ctx.cabinsFor(site).length;
    const SITES = ctx.split ? ['Main', 'PC'] : ['All'];
    const moves = [], stuck = new Set();
    if (settings.moveOverflow) {
      for (let guard = 0; guard < 500; guard++) {
        let over = null;
        for (const d of DAYS) for (const s of SH) for (const site of SITES) if (!over && !stuck.has(d + s + site) && at(d, s, site).length > cap(site)) over = [d, s, site];
        if (!over) break;
        const [d, s, site] = over; let best = null; const here = at(d, s, site); const movable = here.filter(p => !ctx.isSenior(p.t));
        for (const p of movable) for (const d2 of DAYS) for (const s2 of MV) {
          if ((d2 === d && s2 === s) || !ctx.teacherFree(p.t, d2, s2)) continue;
          if (plan.some(q => q.t === p.t && q.day === d2 && q.shift === s2)) continue;
          const c2 = ctx.compute(p.t, d2, s2); if (at(d2, s2, c2.site).length >= cap(c2.site)) continue;
          const same = plan.some(q => q !== p && q.t === p.t && q.day === d2) ? 1 : 0;
          const key = [Math.abs(DAYS.indexOf(d2) - DAYS.indexOf(d)), same, -c2.k, DAYS.indexOf(d2), SLOTS.indexOf(s2), p.t];
          if (!best || cmp(key, best.key) < 0) best = { key, p, d2, s2, site2: c2.site };
        }
        if (!best) {
          stuck.add(d + s + site);
          const where = ctx.split ? ` at ${SITE_NAME[site]}` : '';
          if (!cap(site)) warnings.push(`${d} ${s}: ${here.length} teachers need a cabin${where}, but no cabin is set in that building. Add a cabin there or move them manually.`);
          else if (!movable.length) warnings.push(`${d} ${s} has ${here.length} teachers for ${cap(site)} cabins${where}. All of them are senior faculty (${settings.seniorClasses}), who are never moved automatically. Move one manually or add a cabin.`);
          else warnings.push(`${d} ${s} has ${here.length} teachers but only ${cap(site)} cabins${where}, and no free cabin fits their timetables. Move one manually.`);
          continue;
        }
        moves.push({ t: best.p.t, from: `${d} ${s}`, to: `${best.d2} ${best.s2}` });
        Object.assign(best.p, { day: best.d2, shift: best.s2, moved: true, site: best.site2 });
      }
    }
    plan = finalizePlan(plan, tt, settings);
    return { plan, moves, warnings };
  }
  function cmp(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }

  /* assign cabins (respecting manual cabins), counts, times, dates */
  function finalizePlan(plan, tt, settings) {
    const ctx = makeCtx(tt, settings); const cabins = ctx.cabinsAll;
    for (const p of plan) p.site = ctx.compute(p.t, p.day, p.shift).site;
    for (const d of DAYS) for (const s of SLOTS) {
      const here = plan.filter(p => p.day === d && p.shift === s);
      const fixed = p => p.manual && p.cabin && cabins.includes(p.cabin);
      const taken = new Set(here.filter(fixed).map(p => p.cabin));
      for (const site of ['All', 'Main', 'PC']) {
        const free = ctx.cabinsFor(site).filter(c => !taken.has(c));
        here.filter(p => !fixed(p) && p.site === site).sort((a, b) => a.t < b.t ? -1 : 1).forEach(p => { p.cabin = free.shift() || ''; });
      }
    }
    for (const p of plan) {
      const c = ctx.compute(p.t, p.day, p.shift);
      p.k = p.manualK != null ? p.manualK : c.k; p.start = c.start; p.end = p.manualK != null ? c.start + ctx.unit(p.shift) * p.manualK : c.end;
      if (p.manualK == null) p.end = c.end;
      p.rule = p.manualK != null ? `Set manually to ${p.manualK}` : `${c.k} students · ${c.rule}`;
      p.building = p.cabin ? ctx.cabinBld(p.cabin) : '';
      p.venue = p.building ? (p.building === settings.pcVenueBuilding ? 'PC Campus' : p.building + ' Building') : c.venue;
      p.date = settings.weekStart ? addDays(settings.weekStart, DAYS.indexOf(p.day)) : '';
      p.unit = ctx.unit(p.shift);
    }
    plan.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || SLOTS.indexOf(a.shift) - SLOTS.indexOf(b.shift) || (a.cabin < b.cabin ? -1 : a.cabin > b.cabin ? 1 : 0));
    return plan;
  }

  function validatePlan(plan, tt, settings) {
    const ctx = makeCtx(tt, settings); const out = []; const cabins = settings.cabins.filter(Boolean);
    for (const d of DAYS) for (const s of SLOTS) {
      const here = plan.filter(p => p.day === d && p.shift === s);
      if (here.length > cabins.length) out.push(`${d} ${s}: ${here.length} teachers for ${cabins.length} cabins.`);
      const seen = {}; here.forEach(p => { if (p.cabin) { if (seen[p.cabin]) out.push(`${d} ${s}: cabin ${p.cabin} has both ${seen[p.cabin]} and ${p.t}.`); seen[p.cabin] = p.t; } else out.push(`${d} ${s}: ${p.t} has no cabin.`); });
    }
    for (const p of plan) if (p.moved || p.manual) { const e = ctx.cell.get(p.t + '|' + p.day + '|' + p.shift); if (e && !ctx.isCounsel(e)) out.push(`${p.t} has a class (${e.subj} ${e.room}) on ${p.day} ${p.shift}, the time of their counselling slot.`); }
    if (ctx.split) for (const p of plan) {
      if (!p.cabin) continue; const want = ctx.compute(p.t, p.day, p.shift).site, got = ctx.siteOfCabin(p.cabin);
      if (want !== got) out.push(`${p.t} on ${p.day} ${p.shift} should be at ${SITE_NAME[want]}${want === 'PC' ? ' (class there just before or after)' : ''}, but cabin ${p.cabin} is in ${ctx.cabinBld(p.cabin) || 'no building'}.`);
    }
    return out;
  }

  /* Step 3+4: match students */
  // keep: { slotId: [[roll, basis], ...] } – students already booked; they stay in their slot and only empty seats are filled
  function assignStudents(plan, tt, settings, students, keep) {
    const ctx = makeCtx(tt, settings);
    const groups = settings.classGroups.split('|').map(g => g.split(',').map(S).filter(Boolean));
    const groupOf = cls => { const i = groups.findIndex(g => g.includes(cls)); return i < 0 ? 'cls:' + cls : 'g' + i; };
    const tcls = ctx.tClass;
    // batch class = majority class of teachers teaching its regular classes (FTP teachers do not vote)
    const votes = {};
    for (const e of tt.entries) {
      if (!e.room || ctx.isCounsel(e) || ctx.isDoubt(e.room)) continue; const c = tcls(e.t); if (!c || c === 'FTP') continue;
      (votes[e.room] = votes[e.room] || {})[c] = (votes[e.room][c] || 0) + 1;
    }
    const batchCls = {}; for (const b in votes) batchCls[b] = Object.entries(votes[b]).sort((a, b2) => b2[1] - a[1])[0][0];
    const own = {}; for (const s of students.values()) if (s.cls) (own[s.batch] = own[s.batch] || {})[s.cls] = (own[s.batch][s.cls] || 0) + 1;
    for (const b in own) batchCls[b] = Object.entries(own[b]).sort((a, b2) => b2[1] - a[1])[0][0];
    const byBatch = new Map(); for (const s of students.values()) { if (!byBatch.has(s.batch)) byBatch.set(s.batch, []); byBatch.get(s.batch).push(s); }
    for (const arr of byBatch.values()) arr.sort((a, b) => (a.last || '') < (b.last || '') ? -1 : (a.last || '') > (b.last || '') ? 1 : (a.roll < b.roll ? -1 : 1));
    const classShifts = new Map();
    for (const [b, set] of ctx.occ) classShifts.set(b, new Set([...set].map(k => k.split('|')[1][0])));
    const opposite = settings.oppositeShiftOnly !== false;
    // a student is free when their batch has no class in that period and, if opposite-shift-only is on,
    // the counselling period is in the shift where the batch has no classes at all
    const freeAt = (b, d, sl) => ctx.occ.has(b) && !ctx.occ.get(b).has(d + '|' + sl) && (!opposite || !classShifts.get(b).has(sl[0]));
    const direct = {};
    for (const e of tt.entries) if (e.room && !ctx.isCounsel(e) && !ctx.isDoubt(e.room)) (direct[e.t] = direct[e.t] || new Set()).add(e.room);
    const used = new Set(); const assign = []; let repeatSkips = 0, gapSkips = 0, roundSkips = 0, classSkips = 0; const count = new Map();
    const gapCut = settings.minGapDays > 0 && settings.weekStart ? addDays(settings.weekStart, -settings.minGapDays) : '';
    const shiftOf = b => { let m = 0, e = 0; (ctx.occ.get(b) || []).forEach(k => k.split('|')[1][0] === 'M' ? m++ : e++); return m >= e ? 'Morning' : 'Evening'; };
    const allB = [...byBatch.keys()].filter(b => ctx.occ.has(b));
    // students only meet a teacher of their own class group (11th with 11th and FTP, 12th with 12th, Target with Target by default)
    const classOk = (b, t) => settings.strictClass === false || !tcls(t) || !batchCls[b] || groupOf(tcls(t)) === groupOf(batchCls[b]);
    const placeOk = (b, p) => ctx.siteOfBatch(b) === p.site;
    // Rule order, so no two rules fight:
    //  1. Must hold (never broken): the student is free (no class then; opposite shift if that is on), same campus,
    //     same class group (if strict), allowed by at least one matching rule, booked once a week, the minimum gap.
    //  2. Preferences, in this order: due this round (counted inside each class group) > has not met this teacher >
    //     earlier matching rule (e.g. "Teaches the batch") > counselled longest ago.
    //  Seats are filled in passes: pass 1 keeps every preference as a rule; pass 2 lets in students already counselled
    //  this round; pass 3 lets in students who met this teacher before. So a seat stays empty only when no free student
    //  of that class group is left. Within a pass the slots with the fewest candidates pick first, one seat at a time.
    const gOfB = b => batchCls[b] ? groupOf(batchCls[b]) : 'none';
    const reachable = allB.filter(b => plan.some(p => freeAt(b, p.day, p.shift) && placeOk(b, p)));
    const activeStu = reachable.flatMap(b => byBatch.get(b) || []);
    const minTimes = activeStu.length ? Math.min(...activeStu.map(s => s.times)) : 0;
    const minBy = {}; for (const s of activeStu) { const g = gOfB(s.batch); minBy[g] = Math.min(minBy[g] === undefined ? Infinity : minBy[g], s.times); }
    const due = s => s.times <= (minBy[gOfB(s.batch)] === undefined ? minTimes : minBy[gOfB(s.batch)]);
    const roundOn = settings.onceRound !== false;
    // trace: for every slot, why each batch and each student was left out (first reason wins)
    const trace = {};
    const tr = pid => trace[pid] || (trace[pid] = { rules: [], batch: new Map(), stu: new Map() });
    const note = (m, key, why) => { if (!m.has(key)) m.set(key, why); };
    const tMatch = (r, t) => {
      const v = list(r.tValue);
      if (r.tType === 'class') return v.includes(tcls(t));
      if (r.tType === 'codes') return v.includes(t);
      if (r.tType === 'subject') return v.map(x => x.toLowerCase()).includes(((settings.teachers[t] || {}).subject || '').toLowerCase());
      return true;
    };
    const pool = (r, t) => {
      const v = list(r.sValue);
      switch (r.sType) {
        case 'taught': return [...(direct[t] || [])].filter(b => byBatch.has(b));
        case 'group': { if (!tcls(t)) return []; const g = groupOf(tcls(t)); return allB.filter(b => batchCls[b] && groupOf(batchCls[b]) === g); }
        case 'class': return allB.filter(b => v.includes(batchCls[b]));
        case 'batches': return v.filter(b => byBatch.has(b));
        case 'prefix': return allB.filter(b => v.some(x => b.toUpperCase().startsWith(x.toUpperCase())));
        case 'any': return allB;
      }
      return [];
    };
    const rules = (settings.rules && settings.rules.length ? settings.rules : defaultRules()).filter(r => r.on);
    if (keep) for (const p of plan) for (const [roll, basis] of (keep[p.id] || [])) {
      const s = students.get(roll); if (!s || used.has(roll) || (count.get(p.id) || 0) >= p.k) continue;
      used.add(roll); count.set(p.id, (count.get(p.id) || 0) + 1); assign.push({ pid: p.id, s, basis: basis || 'Kept' }); tr(p.id).stu.set(roll, 'booked');
    }
    const ruleMiss = (r, t) => r.sType === 'taught' ? `${t} teaches no batch that is in the student file`
      : r.sType === 'group' ? (tcls(t) ? `no batch of ${t}'s class group (${tcls(t)}) is in both the student file and the timetable` : `${t} has no class set in the teacher list`)
      : 'no batch in the student file matches this rule';
    // candidates per slot: the union of every matching rule's batches that pass the must-hold checks
    const cand = plan.map(p => {
      const T = tr(p.id), firstRule = new Map();
      rules.forEach((r, ri) => {
        const name = r.name || 'Rule';
        if (!tMatch(r, p.t)) { T.rules.push({ rule: name, skipped: 'this rule does not apply to this teacher' }); return; }
        const bs = pool(r, p.t); if (!bs.length) { T.rules.push({ rule: name, batches: 0, open: 0, empty: ruleMiss(r, p.t) }); return; }
        const R = { rule: name, batches: bs.length, open: 0 }; T.rules.push(R);
        for (const b of bs) {
          const nStu = (byBatch.get(b) || []).length;
          if (!ctx.occ.has(b)) { note(T.batch, b, ['noTimetable', nStu]); continue; }
          if (ctx.occ.get(b).has(p.day + '|' + p.shift)) { note(T.batch, b, ['inClass', nStu]); continue; }
          if (opposite && classShifts.get(b).has(p.shift[0])) { note(T.batch, b, ['sameShift', nStu]); continue; }
          if (!placeOk(b, p)) { note(T.batch, b, ['campus', nStu]); continue; }
          if (!classOk(b, p.t)) { classSkips++; note(T.batch, b, ['classGroup', nStu]); continue; }
          R.open++; T.batch.set(b, ['open', nStu]); if (!firstRule.has(b)) firstRule.set(b, [ri, name]);
        }
      });
      const cl = [];
      for (const [b, [ri, name]] of firstRule) for (const s of byBatch.get(b) || []) {
        if (gapCut && s.last && s.last >= gapCut) { gapSkips++; note(T.stu, s.roll, 'gap'); continue; }
        cl.push({ s, ri, name, met: s.teachersSeen.has(p.t) ? 1 : 0 });
      }
      const dueKey = c => roundOn ? (due(c.s) ? 0 : 1) : 0;
      cl.sort((a, b) => dueKey(a) - dueKey(b) || (roundOn ? a.s.times - b.s.times : 0) || a.met - b.met || a.ri - b.ri || ((a.s.last || '') < (b.s.last || '') ? -1 : (a.s.last || '') > (b.s.last || '') ? 1 : a.s.roll < b.s.roll ? -1 : 1));
      return { p, list: cl };
    });
    const passes = [{ round: roundOn, repeat: !!settings.noRepeatTeacher, tag: '' }];
    if (roundOn) passes.push({ round: false, repeat: !!settings.noRepeatTeacher, tag: 'already counselled this round' });
    if (settings.noRepeatTeacher) passes.push({ round: false, repeat: false, tag: 'met this teacher before' });
    const passCount = passes.map(() => 0);
    passes.forEach((ps, pi) => {
      const ok = c => !used.has(c.s.roll) && !(ps.round && !due(c.s)) && !(ps.repeat && c.met);
      if (pi === 0) for (const x of cand) for (const c of x.list) if (!used.has(c.s.roll)) { if (ps.round && !due(c.s)) roundSkips++; else if (ps.repeat && c.met) repeatSkips++; }
      const order = cand.filter(x => (count.get(x.p.id) || 0) < x.p.k).map(x => [x, x.list.filter(ok).length]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
      for (let progress = true; progress;) {
        progress = false;
        for (const x of order) {
          if ((count.get(x.p.id) || 0) >= x.p.k) continue;
          const c = x.list.find(ok); if (!c) continue;
          used.add(c.s.roll); count.set(x.p.id, (count.get(x.p.id) || 0) + 1); passCount[pi]++; progress = true;
          assign.push({ pid: x.p.id, s: c.s, basis: c.name + (ps.tag ? ` (${ps.tag})` : '') }); tr(x.p.id).stu.set(c.s.roll, 'booked');
        }
      }
    });
    // why the rest of each slot's candidates were not booked there
    for (const x of cand) { const T = tr(x.p.id); for (const c of x.list) if (!T.stu.has(c.s.roll)) T.stu.set(c.s.roll, (count.get(x.p.id) || 0) >= x.p.k ? 'seatsFull' : 'bookedElsewhere'); }
    // times
    const byP = {}; assign.forEach(a => (byP[a.pid] = byP[a.pid] || []).push(a));
    const pm = Object.fromEntries(plan.map(p => [p.id, p]));
    const rows = [];
    for (const pid in byP) byP[pid].sort((a, b) => a.s.roll < b.s.roll ? -1 : 1).forEach((a, i) => { const p = pm[pid]; rows.push({ ...a, p, time: hm(p.start + p.unit * i), batchShift: shiftOf(a.s.batch) }); });
    rows.sort((a, b) => cmp([DAYS.indexOf(a.p.day), SLOTS.indexOf(a.p.shift), a.p.cabin, a.time], [DAYS.indexOf(b.p.day), SLOTS.indexOf(b.p.shift), b.p.cabin, b.time]));
    const why = 'no free student of this class group' + (ctx.split ? ' on this campus' : '') + ' is left at this time; see the Why tab';
    const short = plan.filter(p => (count.get(p.id) || 0) < p.k).map(p => `${p.t} on ${p.day} ${p.shift}${ctx.split ? ` (${SITE_NAME[p.site]})` : ''}: ${count.get(p.id) || 0} of ${p.k} seats filled (${why}).`);
    const noCls = [...new Set(plan.filter(p => !tcls(p.t)).map(p => p.t))].map(t => `${t} has no class (11th / 12th / Target / FTP) in the teacher list, so only students of batches they teach could be matched.`);
    const ftp = [...new Set(plan.filter(p => ctx.inferredFTP(p.t)).map(p => p.t))];
    const ftpNote = ftp.length ? [`Treated as FTP (new teachers, no classes this week, counselling 11th students): ${ftp.join(', ')}. Set their class in the teacher list to change this.`] : [];
    // coverage of all students in this week's batches, before this week
    const cov = { active: 0, done: 0, byClass: {} };
    for (const b of allB) for (const s of byBatch.get(b) || []) {
      const c = batchCls[b] || 'Not known', x = cov.byClass[c] || (cov.byClass[c] = { active: 0, done: 0, roundDone: 0 });
      cov.active++; x.active++; if (s.times > 0) { cov.done++; x.done++; } if (!due(s)) x.roundDone++;
    }
    cov.round = minTimes + 1; cov.roundDone = activeStu.filter(s => !due(s)).length; cov.byGroup = Object.fromEntries(Object.entries(minBy).map(([g, m]) => [g === 'none' ? 'No class' : g[0] === 'g' ? groups[+g.slice(1)].join(' + ') : g.slice(4), m + 1])); cov.reachable = activeStu.length;
    const slotLog = plan.map(p => {
      const T = trace[p.id] || { rules: [], batch: new Map(), stu: new Map() };
      const bz = {}, sz = {};
      for (const [b, [why, n]] of T.batch) { const x = bz[why] || (bz[why] = { batches: [], students: 0 }); x.batches.push(b); x.students += n; }
      for (const why of T.stu.values()) sz[why] = (sz[why] || 0) + 1;
      return { id: p.id, t: p.t, tClass: tcls(p.t) || '', day: p.day, shift: p.shift, site: p.site, cabin: p.cabin, k: p.k, filled: count.get(p.id) || 0, rules: T.rules, batches: bz, students: sz };
    });
    return { rows, repeatSkips, gapSkips, roundSkips, classSkips, minTimes, coverage: cov, batchCls, warnings: [...ftpNote, ...noCls, ...short], counts: Object.fromEntries(plan.map(p => [p.id, count.get(p.id) || 0])), passes: passes.map((ps, i) => ({ tag: ps.tag, booked: passCount[i] })), minBy, slotLog, allB, studentBatches: [...byBatch.keys()], byBatchSize: Object.fromEntries([...byBatch].map(([b, a]) => [b, a.length])) };
  }

  /* ---------- the "why" log: every step from files to bookings, in plain words ---------- */
  const B_WHY = {
    noTimetable: 'batch is not in the timetable, so its free periods are unknown',
    inClass: 'batch has a class at this time',
    sameShift: 'batch studies in this shift (Opposite shift only is on)',
    campus: 'batch is on the other campus',
    classGroup: 'batch is a different class group from the teacher (Strict class matching is on)'
  };
  const S_WHY = {
    bookedElsewhere: 'already booked with another teacher this week',
    gap: 'counselled too recently (Minimum gap)',
    seatsFull: 'slot was already full'
  };
  // level: ok | warn | fail
  function buildLog(o) {
    const { tt, settings, recMeta, recIssues, students, plan, planWarnings, moves, result } = o; const L = [];
    const add = (step, level, text, detail) => L.push({ step, level, text, detail: detail || [] });
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : /ch$/.test(w) ? 'es' : 's'}`;
    const kw = S(settings.keyword).toLowerCase();
    // 1 timetable
    if (!tt) add('Timetable', 'fail', 'No timetable is loaded.');
    else {
      const cells = tt.entries.filter(e => (e.room + ' ' + e.subj).toLowerCase().includes(kw));
      add('Timetable', 'ok', `${pl(tt.teachers.length, 'teacher')} and ${pl(tt.entries.length, 'filled cell')} read. Week starts ${tt.weekStart || '(not found in the file)'}.`, tt.warnings);
      add('Counselling cells', cells.length ? 'ok' : 'fail', cells.length ? `${pl(cells.length, 'cell')} contain the word "${settings.keyword}", one per counselling slot.` : `No cell contains the word "${settings.keyword}". The planner finds counselling slots by this word. Check the spelling in the timetable or in Set up.`);
      const off = cells.filter(e => !activeShifts(settings).includes(e.slot));
      if (off.length) add('Counselling periods', 'warn', `${pl(off.length, 'counselling cell')} fall in periods switched off for counselling and were skipped.`, off.map(e => `${e.t} ${e.day} ${e.slot}`));
    }
    if (!settings.weekStart) add('Week', 'fail', 'No week start date is set.');
    // 2 students
    if (!students) add('Student file', 'fail', 'No student file is loaded.');
    else {
      const withH = [...students.values()].filter(s => s.times > 0).length;
      add('Student file', students.size ? 'ok' : 'fail', `${pl(students.size, 'student')} found; ${withH} have counselling history before this week.`, (recMeta || []).map(m => `Sheet "${m.sheet}": ${m.rows} rows used`));
      const ri = recIssues || [], nE = ri.filter(i => i.level === 'error').length, nW = ri.filter(i => i.level === 'warn').length;
      if (ri.length) add('Student file checks', nE ? 'fail' : nW ? 'warn' : 'ok', `${pl(nE, 'row')} not used because of an error, ${pl(nW, 'warning')}.`, ri.slice(0, 200).map(i => `${i.level === 'error' ? 'Error' : i.level === 'warn' ? 'Check' : 'Note'}: ${i.sheet}${i.row ? ' row ' + i.row : ''}: ${i.msg}`).concat(ri.length > 200 ? [`… and ${ri.length - 200} more. Download the checks from Set up.`] : []));
    }
    if (!result) { add('Matching', 'fail', 'The schedule has not been calculated yet.'); return L; }
    // 3 batches: student batch codes must match timetable room codes
    const sb = result.studentBatches, inTT = sb.filter(b => result.allB.includes(b)), notTT = sb.filter(b => !result.allB.includes(b));
    const lost = notTT.reduce((a, b) => a + result.byBatchSize[b], 0);
    add('Batches matched to timetable', !inTT.length ? 'fail' : notTT.length ? 'warn' : 'ok',
      !inTT.length ? `None of the ${pl(sb.length, 'batch')} in the student file appears in the timetable. The planner learns when a batch is free from the timetable, so no student can be booked. Check that batch codes are written the same way in both files.`
        : `${inTT.length} of ${pl(sb.length, 'batch')} in the student file appear in the timetable.${notTT.length ? ` ${pl(lost, 'student')} in the other ${notTT.length} can never be booked.` : ''}`,
      notTT.map(b => `${b} (${pl(result.byBatchSize[b], 'student')}) is not in the timetable`));
    const noCls = inTT.filter(b => !result.batchCls[b]);
    if (noCls.length) add('Batch class', 'warn', `${pl(noCls.length, 'batch')} have no class (11th / 12th / Target), because none of their teachers has a class in the teacher list. The "Same class group" rule cannot use them.`, noCls);
    // 4 slots and cabins
    add('Counselling slots', plan.length ? 'ok' : 'fail', `${pl(plan.length, 'slot')} planned with ${plan.reduce((a, p) => a + p.k, 0)} seats; ${pl(moves.length, 'slot')} moved to a free cabin.`, planWarnings);
    // 5 rounds
    const c = result.coverage;
    if (settings.onceRound !== false) {
      const due = c.reachable - c.roundDone;
      add('Rounds', 'ok', `Rounds are counted inside each class group: ${Object.entries(c.byGroup || {}).map(([g, n]) => `${g} round ${n}`).join(', ')}. ${due} of ${c.reachable} reachable students are due this round and go first; others fill seats only when no due student is free.`);
    }
    // 6 per slot
    const booked = result.rows.length, cap = plan.reduce((a, p) => a + p.k, 0);
    const P = result.passes || [];
    add('Matching', booked ? (booked < cap ? 'warn' : 'ok') : 'fail', `${booked} of ${cap} seats filled.${P.length ? ` ${P[0].booked} with students due this round who have not met the teacher` + P.slice(1).map(x => `, ${x.booked} with students ${x.tag}`).join('') + '.' : ''}${result.gapSkips ? ` ${result.gapSkips} candidate places skipped by the minimum gap.` : ''}`);
    for (const x of result.slotLog) {
      const d = [];
      for (const r of x.rules) d.push(r.skipped ? `Rule "${r.rule}": skipped, ${r.skipped}.` : r.empty ? `Rule "${r.rule}": no batches, ${r.empty}.` : `Rule "${r.rule}": ${pl(r.batches, 'batch')} considered, ${r.open} free and allowed.`);
      for (const [w, v] of Object.entries(x.batches)) if (w !== 'open') d.push(`${pl(v.batches.length, 'batch')} out (${v.students} students): ${B_WHY[w]}. ${v.batches.slice(0, 12).join(', ')}${v.batches.length > 12 ? ' …' : ''}`);
      for (const [w, n] of Object.entries(x.students)) if (w !== 'booked') d.push(`${pl(n, 'student')} out: ${S_WHY[w]}.`);
      // main reason: what removed the most students
      const cand = [...Object.entries(x.batches).filter(([w]) => w !== 'open').map(([w, v]) => [B_WHY[w], v.students]), ...Object.entries(x.students).filter(([w]) => w !== 'booked').map(([w, n]) => [S_WHY[w], n])].sort((a, b) => b[1] - a[1]);
      const main = x.filled >= x.k ? 'full' : !x.rules.some(r => r.batches) ? 'no rule gave this teacher any batch' : !Object.keys(x.batches).includes('open') ? `no batch is free at this time (${cand.length ? cand[0][0] : 'none'})` : 'every free student of this class group is already booked in another slot this week';
      add(`${x.day} ${x.shift} · ${x.t}${x.tClass ? ' (' + x.tClass + ')' : ''}`, x.filled >= x.k ? 'ok' : x.filled ? 'warn' : 'fail', `${x.filled} of ${x.k} seats filled${x.filled >= x.k ? '.' : `. Main reason: ${main}.`}`, d);
    }
    return L;
  }
  const logText = L => L.map(l => `[${l.level.toUpperCase()}] ${l.step}: ${l.text}` + l.detail.map(d => '\n    - ' + d).join('')).join('\n');

  const api = { DAYS, SLOTS, COUNSEL_SHIFTS, activeShifts, defaultRules, defaultSettings, parseTimetable, parseStudents, buildStudents, buildPlan, finalizePlan, validatePlan, assignStudents, workload, makeCtx, hm, addDays, buildLog, logText, readTemplate, fillTemplate, TEMPLATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MCSEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
