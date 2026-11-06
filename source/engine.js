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
      teacherBatches: [],
      assignedOnly: true,
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
    const entries = [], teachers = [], rowOf = {}, pairOf = {}, colOf = {};
    for (const col of cols) colOf[col.day + '|' + col.slot] = col.c;
    for (let r = hdr + 1; r < rows.length; r++) {
      const row = rows[r] || []; const t = S(row[0]);
      if (!t || /^teacher$/i.test(t)) continue;
      const nxt = rows[r + 1] || []; const pair = r + 1 < rows.length && !S(nxt[0]);
      if (teachers.includes(t)) warnings.push(`Teacher ${t} appears twice in the timetable; both rows were read.`);
      teachers.push(t); if (rowOf[t] === undefined) { rowOf[t] = r; pairOf[t] = pair; }
      for (const col of cols) {
        const subj = S(row[col.c]); const room = pair ? S(nxt[col.c]) : '';
        if (subj || room) entries.push({ t, day: col.day, slot: col.slot, subj, room });
      }
    }
    return { entries, teachers: [...new Set(teachers)], weekStart, warnings, grid: { rowOf, pairOf, colOf } };
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

  /* ---------- teacher batches: which teacher counsels which batches (optional, editable) ---------- */
  const TB = { sheet: 'Teacher Batches', cols: ['Teacher Code', 'Teacher Name', 'Batch', 'Note'], required: ['Teacher Code', 'Batch'] };
  // sheets: [{name, rows}]; known: { teachers: [codes], ttBatches: [rooms in the timetable], studentBatches: [batches in the student file], counselTeachers: [codes with a counselling slot] }
  function readTeacherBatches(sheets, known) {
    const sh = sheets.find(s => S(s.name).toLowerCase() === TB.sheet.toLowerCase());
    const fail = m => ({ ok: false, fatal: m + ' Download the teacher batches template from Set up, fill it in and upload it again.' });
    if (!sh) return fail(`This file has no sheet named "${TB.sheet}".`);
    const h = (sh.rows[0] || []).map(normH), ix = {}; for (const c of TB.cols) ix[c] = h.indexOf(normH(c));
    const miss = TB.required.filter(c => ix[c] < 0);
    if (miss.length) return fail(`The "${TB.sheet}" sheet is missing the column${miss.length > 1 ? 's' : ''} ${miss.map(c => `"${c}"`).join(', ')} in row 1.`);
    const issues = [], add = (level, row, msg) => issues.push({ level, sheet: TB.sheet, row, msg });
    const pairs = [], seen = new Map();
    for (let r = 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] || [], X = r + 1;
      if (!row.some(v => S(v))) continue;
      const t = S(row[ix['Teacher Code']]).toUpperCase().replace(/\s+/g, ''), raw = S(row[ix['Batch']]);
      if (!t) { add('error', X, `Teacher Code is empty${raw ? ` (batch ${raw})` : ''}.`); continue; }
      if (!raw) { add('error', X, `Batch is empty for teacher ${t}.`); continue; }
      // one batch per row is the standard; "XA1, XA2" in one cell is split and accepted
      const bs = raw.split(/[,;\/\n]+/).map(normBatch).filter(Boolean);
      if (bs.length > 1) add('info', X, `${t}: "${raw}" was split into ${bs.length} batches. One batch per row is the standard.`);
      for (const b of bs) {
        const k = t + '|' + b;
        if (seen.has(k)) { add('info', X, `${t} – ${b} is already on row ${seen.get(k)}; counted once.`); continue; }
        seen.set(k, X); pairs.push({ t, b, row: X });
      }
    }
    issues.push(...checkTeacherBatches(pairs, known).map(i => ({ ...i, sheet: TB.sheet })));
    if (!pairs.length) return { ok: false, fatal: `No teacher–batch rows were found on the "${TB.sheet}" sheet.`, issues };
    return { ok: true, pairs: pairs.map(p => ({ t: p.t, b: p.b })), issues };
  }
  // checks that also run on the list edited in the app
  function checkTeacherBatches(pairs, known) {
    const out = [], add = (level, row, msg) => out.push({ level, row, msg });
    const T = new Set(known.teachers || []), TTB = new Set(known.ttBatches || []), SB = new Set(known.studentBatches || []), CT = new Set(known.counselTeachers || []);
    const byT = {}; for (const p of pairs) (byT[p.t] = byT[p.t] || []).push(p);
    for (const t in byT) if (T.size && !T.has(t)) add('warn', byT[t][0].row, `Teacher ${t} is not in the timetable or the teacher list; their rows are kept but do nothing until they have a counselling slot.`);
    const badTT = [...new Set(pairs.filter(p => TTB.size && !TTB.has(p.b)).map(p => p.b))];
    if (badTT.length) add('warn', null, `${badTT.length} batch${badTT.length > 1 ? 'es are' : ' is'} not in the timetable, so their free periods are unknown and they cannot be booked: ${badTT.join(', ')}.`);
    const badS = [...new Set(pairs.filter(p => SB.size && !SB.has(p.b)).map(p => p.b))];
    if (badS.length) add('warn', null, `${badS.length} batch${badS.length > 1 ? 'es have' : ' has'} no students in the student file: ${badS.join(', ')}.`);
    if (CT.size) {
      const idle = Object.keys(byT).filter(t => T.has(t) && !CT.has(t));
      if (idle.length) add('info', null, `${idle.length} teacher${idle.length > 1 ? 's have' : ' has'} batches but no counselling slot this week: ${idle.join(', ')}.`);
      const none = [...CT].filter(t => !byT[t]);
      if (none.length) add('info', null, `${none.length} teacher${none.length > 1 ? 's' : ''} with a counselling slot ${none.length > 1 ? 'have' : 'has'} no assigned batches and will use the matching rules: ${none.join(', ')}.`);
    }
    return out;
  }
  function fillTeacherBatchTemplate(wb, data) {
    const NAVY = 'FF1F3864', solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const how = wb.addWorksheet('How to fill');
    [['Counselling Planner: teacher batches', 't'],
      ['Optional. Decides which batches each teacher counsels. Upload it on the Set up page before calculating; it can also be edited there.', ''],
      ['', ''],
      ['Sheet "Teacher Batches": one row for each teacher and batch', 'h'],
      ['Teacher Code (required): the short code used in the timetable, for example ARV.', ''],
      ['Teacher Name: for your reference only; the planner ignores it.', ''],
      ['Batch (required): written exactly as in the timetable, for example XA1. One batch per row.', ''],
      ['A teacher with several batches gets several rows. A batch can belong to several teachers.', ''],
      ['Note: for your reference only.', ''],
      ['', ''],
      ['What the planner does', 'h'],
      ['Teachers listed here are matched with students of their batches first, even when the batch is of another class group.', ''],
      ['With "Only assigned batches" switched on in Set up, they get students only from these batches. A seat stays empty when none of their batches is free at that time; the Why log shows it.', ''],
      ['Teachers not listed here use the normal matching rules.', ''],
      ['The planner still never books a student who has a class at that time, is on the other campus, or is already booked this week.', ''],
      ['Do not rename the sheet or the column headings in row 1.', '']
    ].forEach(([t, k], i) => { const c = how.getCell(i + 1, 1); c.value = t; c.font = { name: 'Arial', size: k === 't' ? 14 : 10, bold: !!k, color: { argb: k ? NAVY : 'FF000000' } }; c.alignment = { wrapText: true }; });
    how.getColumn(1).width = 110;
    const ws = wb.addWorksheet(TB.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
    const r1 = ws.getRow(1); TB.cols.forEach((c, i) => { const x = r1.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = solid(TB.required.includes(c) ? NAVY : 'FF2F5597'); });
    [14, 28, 12, 40].forEach((w, i) => ws.getColumn(i + 1).width = w);
    const tn = data.teachers || {};
    (data.pairs || []).forEach((p, i) => { ws.getRow(i + 2).values = [p.t, (tn[p.t] && tn[p.t].name) || '', p.b, p.note || '']; });
    const lw = wb.addWorksheet('Lists'); lw.getRow(1).values = ['Teacher Code', 'Teacher Name', 'Batch']; lw.getRow(1).font = { bold: true };
    const tc = Object.keys(tn).sort(), bl = [...new Set(data.batches || [])].sort();
    tc.forEach((c, i) => { lw.getCell(i + 2, 1).value = c; lw.getCell(i + 2, 2).value = tn[c].name || ''; });
    bl.forEach((b, i) => lw.getCell(i + 2, 3).value = b);
    [14, 28, 12].forEach((w, i) => lw.getColumn(i + 1).width = w);
    const n = Math.max(3000, (data.pairs || []).length + 1000);
    if (tc.length) ws.dataValidations.add(`A2:A${n}`, { type: 'list', allowBlank: true, formulae: [`Lists!$A$2:$A$${tc.length + 1}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown teacher', error: 'This code is not in the teacher list.' });
    if (bl.length) ws.dataValidations.add(`C2:C${n}`, { type: 'list', allowBlank: true, formulae: [`Lists!$C$2:$C$${bl.length + 1}`], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Unknown batch', error: 'This batch is not in the timetable.' });
    return wb;
  }

  /* ---------- the updated timetable: the cells that change when slots were moved, added or removed ---------- */
  // Returns [{ r, c, value, kind, t, day, slot }] with r, c as indexes into the uploaded sheet's rows (0-based), plus a list of changes.
  function timetableEdits(tt, plan, settings) {
    if (!tt.grid) return { ok: false, msg: 'Upload the timetable again to make the updated timetable (this copy was loaded before the feature existed).' };
    const { rowOf, colOf, pairOf } = tt.grid, kw = S(settings.keyword).toLowerCase(), SH = activeShifts(settings);
    const isC = e => (e.room + ' ' + e.subj).toLowerCase().includes(kw);
    const orig = new Map(); for (const e of tt.entries) if (isC(e) && SH.includes(e.slot)) orig.set(e.t + '|' + e.day + '|' + e.slot, e);
    const fin = new Map(); for (const p of plan) fin.set(p.t + '|' + p.day + '|' + p.shift, p);
    const subjOf = t => { const c = {}; for (const e of tt.entries) if (e.t === t && e.subj && !isC({ room: '', subj: e.subj })) c[e.subj] = (c[e.subj] || 0) + 1; const m = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return m ? m[0] : ''; };
    const edits = [], changes = [], problems = [];
    for (const [k, e] of orig) if (!fin.has(k)) {
      edits.push({ r: rowOf[e.t], c: colOf[e.day + '|' + e.slot], value: null, kind: 'clear' });
      if (pairOf[e.t]) edits.push({ r: rowOf[e.t] + 1, c: colOf[e.day + '|' + e.slot], value: null, kind: 'clear' });
      const p = plan.find(x => x.t === e.t && x.origDay === e.day && x.origShift === e.slot);
      if (!p) changes.push({ t: e.t, what: 'Removed', from: `${e.day} ${e.slot}`, to: '' });
    }
    for (const [k, p] of fin) if (!orig.has(k)) {
      const r = rowOf[p.t], c = colOf[p.day + '|' + p.shift];
      if (r === undefined) { problems.push(`${p.t} is not in the timetable, so their ${p.day} ${p.shift} slot could not be written.`); continue; }
      if (c === undefined) { problems.push(`The timetable has no ${p.day} ${p.shift} column, so ${p.t}'s slot could not be written.`); continue; }
      const busy = tt.entries.find(e => e.t === p.t && e.day === p.day && e.slot === p.shift && !isC(e));
      if (busy) problems.push(`${p.t} already has ${busy.subj} ${busy.room} on ${p.day} ${p.shift}; that cell was overwritten with counselling.`);
      const src = p.origDay ? orig.get(p.t + '|' + p.origDay + '|' + p.origShift) : null;
      const subj = src ? src.subj : subjOf(p.t), room = src ? src.room : (S(settings.keyword) || 'Counselling');
      if (pairOf[p.t]) { edits.push({ r, c, value: subj || null, kind: 'new' }); edits.push({ r: r + 1, c, value: room, kind: 'new' }); }
      else edits.push({ r, c, value: room, kind: 'new' });
      changes.push({ t: p.t, what: src ? 'Moved' : 'Added', from: src ? `${src.day} ${src.slot}` : '', to: `${p.day} ${p.shift}` });
    }
    return { ok: true, edits, changes, problems, sheet: tt.grid.sheet, r0: tt.grid.r0 || 0, c0: tt.grid.c0 || 0 };
  }

  /* ================= Logic v2 inputs (6 Nov 2026) ================= */
  const nat = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
  // one timetable cell can name several batches: "XA1+XA2", "XA1/XA2", "XA1, XA2", "XA1 & XA2"; doubt-class rooms stay whole
  function roomBatches(room) {
    const r = S(room); if (!r) return [];
    if (/dbt|doubt|counsel/i.test(r) || !/[+\/&,]|\sand\s/i.test(r)) return [r];
    const parts = r.split(/\s*[+\/&,]\s*|\s+and\s+/i).map(normBatch).filter(Boolean);
    return parts.length ? parts : [r];
  }
  const normShift = v => { const x = S(v).toLowerCase().replace(/[^a-z]/g, ''); return ['m', 'morning', 'morn', 'mor', 'am'].includes(x) ? 'Morning' : ['e', 'evening', 'eve', 'pm'].includes(x) ? 'Evening' : ''; };
  // letter O and zero, I and one, spaces and dashes: near-matches are shown as suggestions, never fixed silently
  const looseCode = b => normBatch(b).replace(/[-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  const nearMatch = (b, list) => { const k = looseCode(b); return list.find(x => x !== b && looseCode(x) === k) || ''; };

  // teacher short name or full name -> short name
  function teacherMatcher(teachers) {
    const byCode = new Map(), byName = new Map();
    for (const [c, t] of Object.entries(teachers || {})) {
      byCode.set(c.toUpperCase().replace(/\s+/g, ''), c);
      const n = S(t && t.name).toLowerCase().replace(/\s+/g, ' ');
      if (n) byName.set(n, byName.has(n) ? null : c);
    }
    return v => { const x = S(v); if (!x) return ''; const u = x.toUpperCase().replace(/\s+/g, ''); if (byCode.has(u)) return byCode.get(u); return byName.get(x.toLowerCase().replace(/\s+/g, ' ')) || ''; };
  }

  /* Student list: one row per student with the counselling history in the same row.
     Roll No, Student Name, Batch, Shift (Morning / Evening = when the student has classes), Status,
     then repeating groups: Last counselled date, Last counsellor, Remarks, 2nd last counselled date, 2nd last counsellor, Remarks, ...
     A separate "Counselling History" sheet (Roll No, Date, Counsellor, Result, Remarks) is also read, for the first upload.
     issues: level 'lock' (blocks the schedule until fixed) | 'error' (row not used) | 'warn' | 'info'; each with a fix. */
  const SL = {
    sheet: 'Students', base: ['Roll No', 'Student Name', 'Batch', 'Shift', 'Status'],
    group: n => n === 1 ? ['Last counselled date', 'Last counsellor', 'Remarks'] : [`${ord(n)} last counselled date`, `${ord(n)} last counsellor`, `Remarks ${n}`]
  };
  const ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
  function readStudentList(sheets, opts) {
    opts = opts || {};
    const weekStart = opts.weekStart || '', weekEnd = weekStart ? addDays(weekStart, 6) : '';
    const issues = [], add = (level, sheet, row, msg, fix) => issues.push({ level, sheet, row, msg, fix: fix || '' });
    const headRow = sh => { for (let r = 0; r < Math.min(sh.rows.length, 5); r++) { const h = (sh.rows[r] || []).map(normH); if (h.some(x => x.startsWith('roll')) && h.some(x => x.startsWith('batch'))) return r; } return -1; };
    const sSh = sheets.find(s => /^students?( list)?$/i.test(S(s.name)) && headRow(s) >= 0) || sheets.find(s => !/history/i.test(S(s.name)) && headRow(s) >= 0);
    if (!sSh) return { ok: false, fatal: 'No student list was found. The file needs a sheet named "Students" with Roll No, Student Name, Batch and Shift in the first row. Download the student list template from Set up.' };
    const hr = headRow(sSh), H = (sSh.rows[hr] || []).map(S), h = H.map(normH), col = f => h.findIndex(f);
    const ix = { roll: col(x => x.startsWith('roll')), name: col(x => ['studentname', 'name', 'student', 'nameofstudent'].includes(x)), batch: col(x => ['batch', 'batchname', 'batchcode'].includes(x)),
      shift: col(x => x.startsWith('shift') || x === 'classshift' || x === 'classtime'), status: col(x => x === 'status') };
    const missing = [['Roll No', ix.roll], ['Student Name', ix.name], ['Batch', ix.batch], ['Shift', ix.shift]].filter(x => x[1] < 0).map(x => x[0]);
    if (missing.length) return { ok: false, fatal: `The "${sSh.name}" sheet has no ${missing.map(m => `"${m}"`).join(', ')} column. Add ${missing.length > 1 ? 'them' : 'it'} in row ${hr + 1}.${missing.includes('Shift') ? ' Shift says when the student has classes: Morning or Evening. Counselling is booked in the other shift.' : ''}` };
    const base = new Set(Object.values(ix).filter(i => i >= 0)), groups = [];
    h.forEach((x, i) => {
      if (base.has(i) || !x) return;
      if (/date/.test(x)) groups.push({ date: i, by: -1, remarks: -1, result: -1, label: H[i] });
      else if (groups.length) {
        const g = groups[groups.length - 1];
        if (g.by < 0 && /counsell?or|counselledby|teacher|faculty/.test(x)) g.by = i;
        else if (g.remarks < 0 && /remark|comment|note/.test(x)) g.remarks = i;
        else if (g.result < 0 && /result|attendance|present/.test(x)) g.result = i;
      }
    });
    const tm = teacherMatcher(opts.teachers), unknownBy = {}, roster = new Map(), hist = new Map();
    let left = 0, absent = 0;
    const addHist = (roll, raw, byRaw, remarks, res, sheet, X, label) => {
      const d = dayOf(raw);
      if (!d) { add('warn', sheet, X, `${label} for roll ${roll} is "${S(raw)}", which is not a date; that counselling is not counted.`, 'Write the date as dd-mm-yyyy.'); return; }
      const day = iso(d);
      if (weekEnd && day > weekEnd) { add('warn', sheet, X, `${label} for roll ${roll} is ${day}, after this week; it is not counted.`, 'Check the date.'); return; }
      if (res === 'Absent') { absent++; return; }
      const by = tm(byRaw);
      const k = roll + '|' + day, o = hist.get(k);
      if (o) { if (!o.remarks && remarks) o.remarks = remarks; return; }
      hist.set(k, { roll, date: day, by: by || S(byRaw).toUpperCase(), byRaw: S(byRaw), remarks: S(remarks) });
    };
    for (let r = hr + 1; r < sSh.rows.length; r++) {
      const row = sSh.rows[r] || [], X = r + 1; if (!row.some(v => S(v))) continue;
      const rawRoll = row[ix.roll], roll = normRoll(rawRoll), name = S(row[ix.name]).replace(/\s+/g, ' '), batch = normBatch(row[ix.batch]);
      const rawShift = row[ix.shift], shift = normShift(rawShift), status = ix.status >= 0 ? normStatus(row[ix.status]) : 'Active';
      if (!roll) { add('error', sSh.name, X, S(rawRoll) ? `Roll No "${S(rawRoll)}" is not a number; the row is not used.` : 'Roll No is empty; the row is not used.', 'Type the roll number as digits only, or delete the row.'); continue; }
      if (roster.has(roll)) { const o = roster.get(roll); add('lock', sSh.name, X, `Roll ${roll} is on row ${o.row} and again on row ${X}${o.batch !== batch ? ` (batches ${o.batch} and ${batch})` : ''}.`, 'Keep one row per student: delete the old row (move its history to the other row), or correct the roll number.'); continue; }
      if (!batch) { add('lock', sSh.name, X, `Batch is empty for roll ${roll}.`, 'Type the batch code exactly as in the timetable, for example XA1, or set Status to Left.'); continue; }
      if (!status) add('warn', sSh.name, X, `Status "${S(row[ix.status])}" for roll ${roll} is not Active or Left; treated as Active.`, 'Write Active or Left.');
      const s = { roll, name, batch, shift, status: status || 'Active', row: X };
      if (!name) add('warn', sSh.name, X, `Student Name is empty for roll ${roll}.`, 'Add the name.');
      if (s.status !== 'Left' && !shift) add('lock', sSh.name, X, S(rawShift) ? `Shift "${S(rawShift)}" for roll ${roll} is not Morning or Evening.` : `Shift is empty for roll ${roll}.`, 'Write Morning if the student has classes in the morning, Evening if in the evening.');
      roster.set(roll, s); if (s.status === 'Left') left++;
      for (const g of groups) {
        const raw = row[g.date]; if (raw === null || raw === undefined || S(raw) === '') continue;
        addHist(roll, raw, g.by >= 0 ? row[g.by] : '', g.remarks >= 0 ? row[g.remarks] : '', g.result >= 0 ? normResult(row[g.result]) : 'Done', sSh.name, X, `"${g.label}"`);
      }
    }
    // the old separate history sheet, if the file has one
    const hSh = sheets.find(s => s !== sSh && /history/i.test(S(s.name)));
    if (hSh) {
      const hh = (hSh.rows[0] || []).map(normH), hc = f => hh.findIndex(f);
      const c = { roll: hc(x => x.startsWith('roll')), date: hc(x => x === 'date' || x.endsWith('date')), by: hc(x => /counsell?or|teacher|code/.test(x)), result: hc(x => /result|attendance/.test(x)), remarks: hc(x => /remark/.test(x)) };
      if (c.roll >= 0 && c.date >= 0) for (let r = 1; r < hSh.rows.length; r++) {
        const row = hSh.rows[r] || [], X = r + 1; if (!row.some(v => S(v))) continue;
        const roll = normRoll(row[c.roll]); if (!roll) continue;
        if (!roster.has(roll)) { add('warn', hSh.name, X, `Roll ${roll} is not in the student list; this counselling is not used.`, 'Add the student to the list, or delete the row.'); continue; }
        if (row[c.date] === null || S(row[c.date]) === '') continue;
        addHist(roll, row[c.date], c.by >= 0 ? row[c.by] : '', c.remarks >= 0 ? row[c.remarks] : '', c.result >= 0 ? normResult(row[c.result]) : 'Done', hSh.name, X, 'Date');
      }
    }
    if (absent) add('info', 'Counselling history', null, `${absent} counselling${absent > 1 ? 's are' : ' is'} marked Absent and not counted.`);
    if (left) add('info', sSh.name, null, `${left} student${left > 1 ? 's are' : ' is'} marked Left and will not be booked.`);
    const students = [...roster.values()];
    if (!students.length) return { ok: false, fatal: `No student rows were found on the "${sSh.name}" sheet.`, issues };
    const stats = { students: students.length - left, left, history: hist.size, absent, locks: issues.filter(i => i.level === 'lock').length, errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warn').length, groups: groups.length };
    return { ok: true, students, history: [...hist.values()], issues, stats, sheet: sSh.name };
  }
  // data: { students: [...], history: [...] } from readStudentList; extra: saved weekly records [{roll, date, by, remarks}]
  // teachers: the Teachers section now; each counsellor in the history is matched to it again, so the upload order does not matter
  function buildStudentsV2(data, weekStart, extra, teachers) {
    const m = new Map(), tm = teachers ? teacherMatcher(teachers) : null;
    for (const s of data.students) m.set(s.roll, { ...s, hist: new Map() });
    const addH = (roll, date, by, remarks, byRaw) => {
      const s = m.get(S(roll)); if (!s || !date) return;
      const raw = S(byRaw || by), code = tm ? tm(raw) : S(by), known = !raw || !tm || !!code, b = code || S(by) || raw.toUpperCase();
      const o = s.hist.get(date);
      if (!o) s.hist.set(date, { date, by: b, byRaw: raw, known, remarks: S(remarks) }); else { if (!o.by && b) Object.assign(o, { by: b, byRaw: raw, known }); if (!o.remarks && remarks) o.remarks = S(remarks); }
    };
    for (const x of data.history || []) addH(x.roll, x.date, x.by, x.remarks, x.byRaw);
    for (const x of extra || []) addH(x.roll, x.date, x.by, x.remarks, x.by);
    const wEnd = weekStart ? addDays(weekStart, 6) : '';
    for (const s of m.values()) {
      const all = [...s.hist.values()].sort((a, b) => a.date < b.date ? -1 : 1);
      const before = weekStart ? all.filter(x => x.date < weekStart) : all;
      s.allHistory = all; s.history = before; s.times = before.length; s.last = before.length ? before[before.length - 1].date : '';
      s.thisWeek = weekStart ? all.filter(x => x.date >= weekStart && x.date <= wEnd) : [];
      s.teachersSeen = new Set(before.map(x => x.by)); delete s.hist;
    }
    return m;
  }
  // the main file: the student list with every counselling, newest first. weekRecs: this week's counsellings to add [{roll, date, by, remarks}]
  function fillStudentList(wb, data) {
    const NAVY = 'FF1F3864', solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const how = wb.addWorksheet('How to fill');
    [['Counselling Planner: student list', 't'],
      ['One row per student. Upload it once on the Set up page; the planner adds each week’s counsellings to it.', ''], ['', ''],
      ['Columns', 'h'],
      ['Roll No (required): digits only. Each roll number once.', ''],
      ['Student Name (required).', ''],
      ['Batch (required): exactly as in the faculty timetable, for example XA1.', ''],
      ['Shift (required): when the student has classes, Morning or Evening. Morning students are counselled only in the evening, evening students only in the morning.', ''],
      ['Status: Active or Left. Empty means Active. Students marked Left are never booked; their history is kept.', ''],
      ['Last counselled date, Last counsellor, Remarks: the most recent counselling. Then 2nd last, 3rd last and so on. Add more groups of three columns when needed.', ''],
      ['Counsellor: the teacher’s short name (as in the timetable) or full name, as in the Teachers section.', ''],
      ['', ''],
      ['What the planner checks', 'h'],
      ['The schedule stays locked until these are fixed: a roll number twice, an empty batch, an empty or wrong Shift, a batch that is not in this week’s timetable.', ''],
      ['Warnings do not lock it: a date that is not a date, an unknown counsellor, an empty name.', ''],
      ['Do not rename the column headings in row 1.', '']
    ].forEach(([t, k], i) => { const c = how.getCell(i + 1, 1); c.value = t; c.font = { name: 'Arial', size: k === 't' ? 14 : 10, bold: !!k, color: { argb: k ? NAVY : 'FF000000' } }; c.alignment = { wrapText: true, vertical: 'top' }; });
    how.getColumn(1).width = 110;
    const list = data.students || [], extra = data.weekRecs || [], byRoll = {};
    for (const x of extra) (byRoll[x.roll] = byRoll[x.roll] || []).push(x);
    const hists = list.map(s => { const m = new Map((s.allHistory || s.history || []).map(x => [x.date, x])); for (const x of byRoll[s.roll] || []) if (!m.has(x.date)) m.set(x.date, x); return [...m.values()].sort((a, b) => a.date < b.date ? 1 : -1); });
    const nG = Math.max(3, ...hists.map(h => h.length));
    const cols = SL.base.concat(...Array.from({ length: nG }, (_, i) => SL.group(i + 1)));
    const ws = wb.addWorksheet(SL.sheet, { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
    const r1 = ws.getRow(1); cols.forEach((c, i) => { const x = r1.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = solid(i < 4 ? NAVY : 'FF2F5597'); x.alignment = { vertical: 'middle', wrapText: true }; });
    r1.height = 30; [12, 28, 9, 10, 9].forEach((w, i) => ws.getColumn(i + 1).width = w);
    for (let g = 0; g < nG; g++) { ws.getColumn(6 + g * 3).width = 13; ws.getColumn(6 + g * 3).numFmt = 'dd-mm-yyyy'; ws.getColumn(7 + g * 3).width = 12; ws.getColumn(8 + g * 3).width = 34; }
    ws.getColumn(1).numFmt = '0';
    const tn = data.teachers || {};
    list.forEach((s, i) => {
      const v = [/^\d{1,15}$/.test(s.roll) ? Number(s.roll) : s.roll, s.name, s.batch, s.shift || '', s.status || 'Active'];
      for (const x of hists[i]) v.push(new Date(x.date + 'T00:00:00Z'), x.by || '', x.remarks || '');
      ws.getRow(i + 2).values = v;
    });
    const n = Math.max(20000, list.length + 5000);
    ws.dataValidations.add(`D2:D${n}`, { type: 'list', allowBlank: true, formulae: ['"Morning,Evening"'], showErrorMessage: true, errorStyle: 'error', errorTitle: 'Shift', error: 'Choose Morning or Evening.' });
    ws.dataValidations.add(`E2:E${n}`, { type: 'list', allowBlank: true, formulae: ['"Active,Left"'], showErrorMessage: true, errorStyle: 'error', errorTitle: 'Status', error: 'Choose Active or Left.' });
    const lw = wb.addWorksheet('Teachers'); lw.getRow(1).values = ['Short name', 'Full name']; lw.getRow(1).font = { bold: true };
    Object.keys(tn).sort().forEach((c, i) => { lw.getCell(i + 2, 1).value = c; lw.getCell(i + 2, 2).value = (tn[c] && tn[c].name) || ''; });
    lw.getColumn(1).width = 12; lw.getColumn(2).width = 30;
    return wb;
  }

  /* Teachers section: short name, full name, subject, batches taught, batches to counsel, senior (never moved). Set once, edited in the app. */
  const TS = { sheet: 'Teachers', cols: ['Short name', 'Full name', 'Subject', 'Batches taught', 'Batches to counsel', 'Senior (never moved)'] };
  const splitBatches = v => [...new Set(S(v).split(/[,;\/\n+]+/).map(normBatch).filter(Boolean))];
  const yes = v => /^(y|yes|true|1|senior)$/i.test(S(v));
  function readTeachers(sheets) {
    const sh = sheets.find(s => /^teachers?$/i.test(S(s.name))) || sheets.find(s => (s.rows[0] || []).map(normH).some(x => x.startsWith('short')));
    if (!sh) return { ok: false, fatal: 'No "Teachers" sheet was found. Download the teachers template from Set up, fill it in and upload it again.' };
    const h = (sh.rows[0] || []).map(normH), f = t => h.findIndex(t);
    const c = { code: f(x => x.startsWith('short') || x === 'code' || x === 'teachercode'), name: f(x => x === 'fullname' || x === 'name' || x === 'teachername'), subject: f(x => x.startsWith('subject')),
      taught: f(x => x.includes('taught') || x === 'batchesteaches'), counsel: f(x => x.includes('counsel')), senior: f(x => x.startsWith('senior')) };
    if (c.code < 0 || c.counsel < 0) return { ok: false, fatal: `The "${sh.name}" sheet needs the columns "Short name" and "Batches to counsel" in row 1.` };
    const out = {}, issues = [], add = (level, row, msg) => issues.push({ level, sheet: sh.name, row, msg });
    for (let r = 1; r < sh.rows.length; r++) {
      const row = sh.rows[r] || [], X = r + 1; if (!row.some(v => S(v))) continue;
      const code = S(row[c.code]).toUpperCase().replace(/\s+/g, ''); if (!code) { add('error', X, 'Short name is empty; the row is not used.'); continue; }
      const o = out[code] || (out[code] = { name: '', subject: '', taught: [], counsel: [], senior: false });
      if (c.name >= 0 && S(row[c.name])) o.name = S(row[c.name]);
      if (c.subject >= 0 && S(row[c.subject])) o.subject = S(row[c.subject]);
      if (c.taught >= 0) o.taught = [...new Set(o.taught.concat(splitBatches(row[c.taught])))];
      o.counsel = [...new Set(o.counsel.concat(splitBatches(row[c.counsel])))];
      if (c.senior >= 0 && yes(row[c.senior])) o.senior = true;
    }
    if (!Object.keys(out).length) return { ok: false, fatal: `No teacher rows were found on the "${sh.name}" sheet.`, issues };
    return { ok: true, teachers: out, issues };
  }
  // batches each teacher teaches this week, from the timetable (used only to fill "Batches taught" when asked)
  function taughtFromTimetable(tt, settings) {
    const ctx = makeCtx(tt, settings), out = {};
    for (const e of tt.entries) if (e.room && !ctx.isCounsel(e) && !ctx.isDoubt(e.room)) for (const b of roomBatches(e.room)) (out[e.t] = out[e.t] || new Set()).add(b);
    return Object.fromEntries(Object.entries(out).map(([t, s]) => [t, [...s].sort(nat)]));
  }
  function fillTeachersTemplate(wb, data) {
    const NAVY = 'FF1F3864', solid = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const how = wb.addWorksheet('How to fill');
    [['Counselling Planner: teachers', 't'], ['One row per teacher. Upload it on the Set up page, or edit teachers in the app. Uploading this file replaces the whole Teachers section: teachers not in the file are removed.', ''], ['', ''],
      ['Short name (required): the code used in the timetable, for example ARV.', ''], ['Full name, Subject: for the schedule and the reports.', ''],
      ['Batches taught: the batches this teacher teaches, separated by commas.', ''],
      ['Batches to counsel (required for every teacher with a counselling slot): the batches whose students this teacher counsels, separated by commas, for example XA1, XA2.', ''],
      ['Senior (never moved): Yes for teachers whose counselling slot is never moved when cabins are full.', '']
    ].forEach(([t, k], i) => { const x = how.getCell(i + 1, 1); x.value = t; x.font = { name: 'Arial', size: k === 't' ? 14 : 10, bold: !!k, color: { argb: k ? NAVY : 'FF000000' } }; x.alignment = { wrapText: true }; });
    how.getColumn(1).width = 110;
    const ws = wb.addWorksheet(TS.sheet, { views: [{ state: 'frozen', ySplit: 1 }] });
    const r1 = ws.getRow(1); TS.cols.forEach((c, i) => { const x = r1.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = solid([0, 4].includes(i) ? NAVY : 'FF2F5597'); });
    [12, 28, 14, 30, 30, 12].forEach((w, i) => ws.getColumn(i + 1).width = w);
    const T = data.teachers || {}, taught = data.taught || {};
    Object.keys(T).sort().forEach((code, i) => { const t = T[code] || {}; ws.getRow(i + 2).values = [code, t.name || '', t.subject || '', (t.taught && t.taught.length ? t.taught : taught[code] || []).join(', '), (t.counsel || []).join(', '), t.senior ? 'Yes' : 'No']; });
    ws.dataValidations.add('F2:F2000', { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
    return wb;
  }

  /* Input checks. level 'lock': the schedule stays hidden until it is fixed; 'warn': shown, does not lock. Each has where and how to fix. */
  function checkInputs(o) {
    const out = [], add = (level, what, where, fix) => out.push({ level, what, where: where || '', fix: fix || '' });
    const s = o.settings, T = s.teachers || {}, skip = new Set((s.skipBatches || []).map(normBatch));
    if (!o.tt) add('lock', 'The faculty timetable is not uploaded.', 'Files', 'Upload this week’s faculty timetable.');
    if (!o.students) add('lock', 'The student list is not uploaded.', 'Files', 'Upload the student list.');
    if (o.tt && !s.weekStart) add('lock', 'The week date was not found in the timetable title.', 'Faculty timetable, title', 'Write the week in the title, for example "Time Table for the week of 26 Oct 2026 to 31 Oct 2026", or set the Monday under Advanced settings.');
    if (!(s.cabins || []).filter(Boolean).length) add('lock', 'No counselling cabin is set.', 'Advanced settings, Cabins', 'Add at least one cabin.');
    for (const i of o.fileIssues || []) if (i.level === 'lock') add('lock', i.msg, `${i.sheet}${i.row ? ' row ' + i.row : ''}`, i.fix);
    if (!o.tt || !o.students) return out;
    const ctx = makeCtx(o.tt, s), ttB = [...ctx.occ.keys()].filter(b => !ctx.isDoubt(b) && !/counsel/i.test(b)), ttSet = new Set(ttB);
    const active = [...o.students.values()].filter(x => x.status !== 'Left'), byB = {};
    for (const x of active) (byB[x.batch] = byB[x.batch] || []).push(x);
    const ct = [...new Set(weekSlots(o.tt, s).map(x => x.t))].sort();
    for (const t of ct) {
      const x = T[t];
      if (!x) add('lock', `${t} has a counselling slot this week but is not in the Teachers section.`, `Timetable, teacher ${t}`, `Add ${t} in the Teachers section with the batches they counsel.`);
      else if (!(x.counsel || []).length) add('lock', `${t}${x.name ? ' (' + x.name + ')' : ''} has a counselling slot this week but no batches to counsel.`, `Teachers section, ${t}`, `Fill “Batches to counsel” for ${t}.`);
    }
    for (const b of Object.keys(byB).sort(nat)) {
      if (ttSet.has(b) || skip.has(b)) continue;
      const near = nearMatch(b, ttB);
      add('lock', `Batch ${b} (${byB[b].length} students) is not in this week’s timetable, so its free periods are unknown.`, `Student list, batch ${b}`,
        near ? `The timetable has ${near}. If that is the same batch, correct the code in the student list. Otherwise tick “Skip this week” for ${b}.` : `Correct the batch code in the student list, or tick “Skip this week” for ${b}.`);
    }
    const counselB = new Set(); for (const x of Object.values(T)) for (const b of x.counsel || []) counselB.add(normBatch(b));
    const noStu = [...counselB].filter(b => !byB[b]).sort(nat);
    if (noStu.length) add('warn', `${noStu.length} batch${noStu.length > 1 ? 'es' : ''} in “Batches to counsel” ${noStu.length > 1 ? 'have' : 'has'} no students in the student list: ${noStu.join(', ')}.`, 'Teachers section', 'Check the spelling, or remove them.');
    const orphan = Object.keys(byB).filter(b => !counselB.has(b) && !skip.has(b)).sort(nat);
    if (orphan.length) add('warn', `${orphan.length} batch${orphan.length > 1 ? 'es have' : ' has'} no teacher to counsel ${orphan.length > 1 ? 'them' : 'it'}, so ${orphan.reduce((a, b) => a + byB[b].length, 0)} students are never booked: ${orphan.join(', ')}.`, 'Teachers section', 'Add these batches to “Batches to counsel” of at least one teacher.');
    const notTT = Object.keys(T).filter(t => !o.tt.teachers.includes(t) && (T[t].counsel || []).length);
    if (notTT.length) add('info', `${notTT.length} teacher${notTT.length > 1 ? 's' : ''} in the Teachers section ${notTT.length > 1 ? 'are' : 'is'} not in this week’s timetable: ${notTT.join(', ')}.`, 'Teachers section', 'Nothing to do unless they should counsel this week.');
    for (const r of batchTimetable(o.tt, s, o.students).filter(r => r.flag)) add('warn', `Batch ${r.batch}: ${r.flag}`, `Batch timetable, ${r.batch}`, r.fix);
    // counsellors in the history that are not in the Teachers section as it is now
    const unk = {}; for (const x of o.students.values()) for (const hh of x.allHistory || []) if (hh.known === false) unk[hh.byRaw] = (unk[hh.byRaw] || 0) + 1;
    for (const [v, n] of Object.entries(unk).sort((a, b) => b[1] - a[1])) add('warn', `Counsellor "${v}" (${n} counselling${n > 1 ? 's' : ''}) is not a short name or full name in the Teachers section. These counsellings still count.`, 'Student list, counselling history', `Add ${v} to the Teachers section, or write the teacher's short name in the student list.`);
    for (const i of o.fileIssues || []) if (i.level === 'warn' && !/^Counsellor "/.test(i.msg)) add('warn', i.msg, `${i.sheet}${i.row ? ' row ' + i.row : ''}`, i.fix);
    if (skip.size) add('info', `Skipped this week: ${[...skip].join(', ')}.`, 'Student list', 'Untick “Skip this week” when the batch code is fixed.');
    return out;
  }
  // which batch has class when, next to the Shift column of its students; flags where the two disagree
  function batchTimetable(tt, settings, students) {
    const ctx = makeCtx(tt, settings), byB = {};
    for (const x of students.values()) if (x.status !== 'Left') (byB[x.batch] = byB[x.batch] || []).push(x);
    const all = [...new Set([...Object.keys(byB), ...[...ctx.occ.keys()].filter(b => !ctx.isDoubt(b) && !/counsel/i.test(b))])].sort(nat);
    return all.map(b => {
      const arr = byB[b] || [], m = arr.filter(x => x.shift === 'Morning').length, e = arr.filter(x => x.shift === 'Evening').length;
      const occ = ctx.occ.get(b) || new Set(), days = {};
      for (const d of DAYS) days[d] = SLOTS.filter(sl => occ.has(d + '|' + sl));
      const eDays = DAYS.filter(d => days[d].some(x => x[0] === 'E')), mDays = DAYS.filter(d => days[d].some(x => x[0] === 'M'));
      let flag = '', fix = '';
      if (!arr.length) { flag = ''; }
      else if (!ctx.occ.has(b)) { flag = 'not in the timetable.'; fix = 'See the input checks.'; }
      else if (m && e) { flag = `${m} students are marked Morning and ${e} Evening.`; fix = 'A batch usually has one shift: check the Shift column for this batch.'; }
      else if (m && eDays.length) { flag = `students are marked Morning, but the timetable has evening classes on ${eDays.join(', ')}. They are not booked in those periods.`; fix = 'Check the Shift column or the timetable.'; }
      else if (e && mDays.length) { flag = `students are marked Evening, but the timetable has morning classes on ${mDays.join(', ')}. They are not booked in those periods.`; fix = 'Check the Shift column or the timetable.'; }
      return { batch: b, students: arr.length, morning: m, evening: e, shift: m && !e ? 'Morning' : e && !m ? 'Evening' : m && e ? 'Mixed' : '', inTimetable: ctx.occ.has(b), days, flag, fix };
    });
  }

  /* ---------- core rules ---------- */
  function makeCtx(tt, settings) {
    const cell = new Map(); const occ = new Map();
    for (const e of tt.entries) {
      cell.set(e.t + '|' + e.day + '|' + e.slot, e);
      if (e.room) for (const b of roomBatches(e.room)) { if (!occ.has(b)) occ.set(b, new Set()); occ.get(b).add(e.day + '|' + e.slot); }
    }
    const kw = settings.keyword.toLowerCase();
    const isCounsel = e => (e.room + ' ' + e.subj).toLowerCase().includes(kw);
    const isDoubt = room => /dbt|doubt/i.test(room);
    const known = new Set(settings.knownBuildings); const reduce = new Set(settings.reduceBuildings);
    function building(code) {
      const x = S(code); if (!x) return null;
      if (x.toLowerCase().startsWith('m3 old')) return 'M3 old';
      const first = x.split(/\s+/)[0]; if (known.has(first)) return first;
      return settings.batchBuildings[x] || settings.batchBuildings[roomBatches(x)[0]] || null;
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
    const isSenior = t => settings.protectSenior !== false && ((settings.teachers[t] || {}).senior === true || ((settings.teachers[t] || {}).senior === undefined && senior.has(tClass(t))));
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

  /* The week's counselling slots: the timetable's counselling cells, plus slots added and minus slots removed in Set up.
     settings.slotAdj = { week, add: [{t, day, shift}], remove: [{t, day, shift}] }; it applies only to that week. */
  const adjOf = s => (s.slotAdj && s.slotAdj.week === s.weekStart) ? s.slotAdj : { week: s.weekStart, add: [], remove: [] };
  function weekSlots(tt, settings) {
    const ctx = makeCtx(tt, settings), SH = activeShifts(settings), adj = adjOf(settings), key = x => x.t + '|' + x.day + '|' + x.shift;
    const rm = new Set((adj.remove || []).map(key));
    const out = tt.entries.filter(x => ctx.isCounsel(x) && SH.includes(x.slot)).map(x => ({ t: x.t, day: x.day, shift: x.slot, label: x.room || x.subj, added: false })).filter(x => !rm.has(key(x)));
    const seen = new Set(out.map(key));
    for (const a of adj.add || []) if (SH.includes(a.shift) && !seen.has(key(a))) { out.push({ t: a.t, day: a.day, shift: a.shift, label: 'Added', added: true }); seen.add(key(a)); }
    return out;
  }
  // one more counselling slot for teacher t: a period where t has no class and no counselling and a cabin is free.
  // Preferred: periods where students of t's batches to counsel are free (opposite shift, no class), then the emptiest period, then a day t has fewer slots.
  function pickSlot(tt, settings, t, students) {
    const ctx = makeCtx(tt, settings), cur = weekSlots(tt, settings), SH = activeShifts(settings), cab = ctx.cabinsAll.length;
    const per = {}; for (const x of cur) per[x.day + '|' + x.shift] = (per[x.day + '|' + x.shift] || 0) + 1;
    const mine = new Set(cur.filter(x => x.t === t).map(x => x.day + '|' + x.shift));
    const counsel = ((settings.teachers[t] || {}).counsel || []).map(normBatch), byShift = {};
    if (students) for (const s of students.values()) if (s.status !== 'Left') { const o = byShift[s.batch] || (byShift[s.batch] = { M: 0, E: 0 }); if (s.shift === 'Morning') o.M++; else if (s.shift === 'Evening') o.E++; }
    let best = null;
    for (const d of DAYS) for (const sl of SH) {
      const k = d + '|' + sl;
      if (!ctx.teacherFree(t, d, sl) || mine.has(k) || (per[k] || 0) >= cab) continue;
      let free = 0; for (const b of counsel) { if (!ctx.occ.has(b) || ctx.occ.get(b).has(k)) continue; const c = byShift[b]; if (c) free += sl[0] === 'E' ? c.M : c.E; }
      const sameDay = cur.filter(x => x.t === t && x.day === d).length, rank = [free ? 0 : 1, per[k] || 0, sameDay, DAYS.indexOf(d), SLOTS.indexOf(sl)];
      if (!best || cmp(rank, best.rank) < 0) best = { rank, day: d, shift: sl, students: free };
    }
    return best ? { day: best.day, shift: best.shift, students: best.students } : null;
  }

  /* Step 1+2: counselling slots, overflow moves, cabins, student counts */
  function buildPlan(tt, settings) {
    const ctx = makeCtx(tt, settings); const cabins = settings.cabins.filter(Boolean); const warnings = [];
    const SH = activeShifts(settings), MV = moveShifts(settings);
    let plan = weekSlots(tt, settings)
      .map((e, i) => ({ id: 'p' + i, t: e.t, origDay: e.added ? '' : e.day, origShift: e.added ? '' : e.shift, day: e.day, shift: e.shift, label: e.label, moved: false, manual: false, added: e.added }));
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

  /* Step 3+4: match students (Logic v2, 6 Nov 2026) */
  // Only four rules are never broken:
  //  1. the student's batch is in this teacher's "Batches to counsel" (Teachers section);
  //  2. the period is in the student's opposite shift (Shift column) and the batch has no class then (timetable);
  //  3. the student is not marked Left (and their batch is not skipped this week);
  //  4. one counselling per student per week (bookings this week and counsellings already held this week).
  // Plus the campus rule: students whose batch is at PC go only to PC cabins, and the other way round.
  // Order: each batch is a queue in roll-number order. Students still due this round (fewest counsellings in their batch)
  // come first, in roll order; when a batch has finished its round it starts again from the first roll number.
  // The slot with the fewest possible students picks first, one seat at a time.
  // keep: { slotId: [[roll, basis], ...] } – bookings already made; each is checked again and dropped when no longer valid
  function assignStudents(plan, tt, settings, students, keep) {
    const ctx = makeCtx(tt, settings), T = settings.teachers || {}, skip = new Set((settings.skipBatches || []).map(normBatch));
    const counselOf = t => new Set(((T[t] || {}).counsel || []).map(normBatch).filter(Boolean));
    const byBatch = new Map(); let leftN = 0, skipN = 0;
    for (const s of students.values()) {
      if (s.status === 'Left') { leftN++; continue; }
      if (skip.has(s.batch)) { skipN++; continue; }
      if (!byBatch.has(s.batch)) byBatch.set(s.batch, []); byBatch.get(s.batch).push(s);
    }
    const rollCmp = (a, b) => a.roll.length - b.roll.length || (a.roll < b.roll ? -1 : a.roll > b.roll ? 1 : 0);
    const batchMin = {}, rank = new Map();
    for (const [b, arr] of byBatch) {
      arr.sort(rollCmp); batchMin[b] = Math.min(...arr.map(s => s.times));
      let i = 0, j = 0; for (const s of arr) rank.set(s.roll, s.times <= batchMin[b] ? i++ : j++);
    }
    const due = s => s.times <= batchMin[s.batch];
    const shiftOk = (s, p) => s.shift === 'Morning' ? p.shift[0] === 'E' : s.shift === 'Evening' ? p.shift[0] === 'M' : false;
    const placeOk = (b, p) => ctx.siteOfBatch(b) === p.site;
    const busyAt = (b, p) => ctx.occ.has(b) && ctx.occ.get(b).has(p.day + '|' + p.shift);
    const used = new Set(), count = new Map(), assign = [], dropped = [];
    const trace = {}, tr = pid => trace[pid] || (trace[pid] = { batch: new Map(), stu: new Map(), note: '' });
    const note = (m, k, w) => { if (!m.has(k)) m.set(k, w); };
    // bookings already made stay, but only while they are still valid
    if (keep) for (const p of plan) for (const [roll, basis] of (keep[p.id] || [])) {
      const s = students.get(roll); let why = '';
      if (!s) why = 'is no longer in the student list';
      else if (s.status === 'Left') why = 'is marked Left';
      else if (used.has(roll)) why = 'is already booked in another slot';
      else if ((count.get(p.id) || 0) >= p.k) why = 'did not fit: the slot has fewer seats now';
      else if (busyAt(s.batch, p)) why = `has a class then (batch ${s.batch})`;
      else if (!shiftOk(s, p)) why = `is not in the opposite shift (${s.shift || 'no shift'} student, ${p.shift} slot)`;
      if (why) { dropped.push(`Roll ${roll} was taken out of ${p.t}'s ${p.day} ${p.shift} slot: the student ${why}. They keep their place in the queue.`); continue; }
      used.add(roll); count.set(p.id, (count.get(p.id) || 0) + 1); assign.push({ pid: p.id, s, basis: basis || 'Kept' }); tr(p.id).stu.set(roll, 'booked');
    }
    // who can sit in each slot
    const cand = plan.map(p => {
      const Tr = tr(p.id), mine = counselOf(p.t), list = [];
      if (!T[p.t]) Tr.note = `${p.t} is not in the Teachers section`;
      else if (!mine.size) Tr.note = `${p.t} has no batches to counsel in the Teachers section`;
      for (const b of mine) {
        const arr = byBatch.get(b), n = arr ? arr.length : 0;
        if (skip.has(b)) { note(Tr.batch, b, ['skipped', n]); continue; }
        if (!arr) { note(Tr.batch, b, ['noStudents', 0]); continue; }
        if (!ctx.occ.has(b)) { note(Tr.batch, b, ['noTimetable', n]); continue; }
        if (busyAt(b, p)) { note(Tr.batch, b, ['inClass', n]); continue; }
        if (!placeOk(b, p)) { note(Tr.batch, b, ['campus', n]); continue; }
        let open = 0;
        for (const s of arr) {
          if (!shiftOk(s, p)) { note(Tr.stu, s.roll, 'sameShift'); continue; }
          if (s.thisWeek && s.thisWeek.length) { note(Tr.stu, s.roll, 'doneThisWeek'); continue; }
          list.push({ s, d: due(s) ? 0 : 1, rel: s.times - batchMin[b], q: rank.get(s.roll) }); open++;
        }
        Tr.batch.set(b, [open ? 'open' : 'sameShift', n]);
      }
      list.sort((a, b) => a.d - b.d || a.rel - b.rel || a.q - b.q || (a.s.batch < b.s.batch ? -1 : a.s.batch > b.s.batch ? 1 : 0) || rollCmp(a.s, b.s));
      return { p, list };
    });
    // pass 1: students due this round; pass 2: the next round of the same batches (from the first roll number again)
    const passes = [{ due: true, tag: '' }, { due: false, tag: 'next round' }], passCount = [0, 0];
    passes.forEach((ps, pi) => {
      const ok = c => !used.has(c.s.roll) && (!ps.due || c.d === 0);
      const order = cand.filter(x => (count.get(x.p.id) || 0) < x.p.k).map(x => [x, x.list.filter(ok).length]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
      for (let progress = true; progress;) {
        progress = false;
        for (const x of order) {
          if ((count.get(x.p.id) || 0) >= x.p.k) continue;
          const c = x.list.find(ok); if (!c) continue;
          used.add(c.s.roll); count.set(x.p.id, (count.get(x.p.id) || 0) + 1); passCount[pi]++; progress = true;
          assign.push({ pid: x.p.id, s: c.s, basis: ps.due ? 'Due this round' : 'Next round' }); tr(x.p.id).stu.set(c.s.roll, 'booked');
        }
      }
    });
    for (const x of cand) { const Tr = tr(x.p.id); for (const c of x.list) if (!Tr.stu.has(c.s.roll)) Tr.stu.set(c.s.roll, (count.get(x.p.id) || 0) >= x.p.k ? 'seatsFull' : 'bookedElsewhere'); }
    // times
    const byP = {}; assign.forEach(a => (byP[a.pid] = byP[a.pid] || []).push(a));
    const pm = Object.fromEntries(plan.map(p => [p.id, p]));
    const rows = [];
    for (const pid in byP) byP[pid].sort((a, b) => rollCmp(a.s, b.s)).forEach((a, i) => { const p = pm[pid]; rows.push({ ...a, p, time: hm(p.start + p.unit * i), batchShift: a.s.shift || '' }); });
    rows.sort((a, b) => cmp([DAYS.indexOf(a.p.day), SLOTS.indexOf(a.p.shift), a.p.cabin, a.time], [DAYS.indexOf(b.p.day), SLOTS.indexOf(b.p.shift), b.p.cabin, b.time]));
    const short = plan.filter(p => (count.get(p.id) || 0) < p.k).map(p => `${p.t} on ${p.day} ${p.shift}${ctx.split ? ` (${SITE_NAME[p.site]})` : ''}: ${count.get(p.id) || 0} of ${p.k} seats filled (${tr(p.id).note || 'no more free students of this teacher’s batches at this time'}; see the Why tab).`);
    // coverage per batch
    const batches = [...byBatch].map(([b, arr]) => {
      const dueBefore = arr.filter(due).length, booked = arr.filter(s => used.has(s.roll)).length, bookedDue = arr.filter(s => used.has(s.roll) && due(s)).length, dueAfter = dueBefore - bookedDue;
      return { batch: b, students: arr.length, round: batchMin[b] + 1, dueBefore, booked, dueAfter, weeks: dueAfter ? (booked ? Math.ceil(dueAfter / booked) : null) : 0,
        counsellors: Object.keys(T).filter(t => counselOf(t).has(b)), inTimetable: ctx.occ.has(b), never: arr.filter(s => !s.times).length };
    }).sort((a, b) => nat(a.batch, b.batch));
    const all = [...byBatch.values()].flat();
    const coverage = { active: all.length, done: all.filter(s => s.times > 0).length, byClass: {}, roundDone: all.filter(s => !due(s)).length, reachable: all.length, byGroup: {}, round: 1, left: leftN, skipped: skipN, batches };
    for (const s of all) { const c = s.batch, x = coverage.byClass[c] || (coverage.byClass[c] = { active: 0, done: 0 }); x.active++; if (s.times > 0) x.done++; }
    const slotLog = plan.map(p => {
      const Tt = trace[p.id] || { batch: new Map(), stu: new Map(), note: '' }, bz = {}, sz = {};
      for (const [b, [why, n]] of Tt.batch) { const x = bz[why] || (bz[why] = { batches: [], students: 0 }); x.batches.push(b); x.students += n; }
      for (const why of Tt.stu.values()) sz[why] = (sz[why] || 0) + 1;
      return { id: p.id, t: p.t, day: p.day, shift: p.shift, site: p.site, cabin: p.cabin, k: p.k, filled: count.get(p.id) || 0, note: Tt.note, counsel: [...counselOf(p.t)], batches: bz, students: sz };
    });
    return { rows, coverage, warnings: [...dropped, ...short], dropped, counts: Object.fromEntries(plan.map(p => [p.id, count.get(p.id) || 0])), passes: passes.map((ps, i) => ({ tag: ps.tag, booked: passCount[i] })),
      slotLog, allB: [...byBatch.keys()].filter(b => ctx.occ.has(b)), studentBatches: [...byBatch.keys()], byBatchSize: Object.fromEntries([...byBatch].map(([b, a]) => [b, a.length])), batchMin };
  }

  /* ---------- the "why" log: every step from files to bookings, in plain words ---------- */
  const B_WHY = {
    noTimetable: 'batch is not in the timetable, so its free periods are unknown',
    inClass: 'batch has a class at this time',
    sameShift: 'the students of this batch study in this shift (counselling is only in the opposite shift)',
    campus: 'batch is on the other campus',
    skipped: 'batch is skipped this week',
    noStudents: 'batch has no students in the student list'
  };
  const S_WHY = {
    sameShift: 'study in this shift (counselling is only in the opposite shift)',
    doneThisWeek: 'already counselled earlier this week',
    bookedElsewhere: 'already booked with another teacher this week',
    seatsFull: 'slot was already full'
  };
  // level: ok | warn | fail
  function buildLog(o) {
    const { tt, settings, students, plan, planWarnings, moves, result, checks } = o; const L = [];
    const add = (step, level, text, detail) => L.push({ step, level, text, detail: detail || [] });
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : /ch$/.test(w) ? 'es' : 's'}`;
    const kw = S(settings.keyword).toLowerCase();
    if (!tt) add('Timetable', 'fail', 'No timetable is loaded.');
    else {
      const cells = tt.entries.filter(e => (e.room + ' ' + e.subj).toLowerCase().includes(kw));
      add('Timetable', 'ok', `${pl(tt.teachers.length, 'teacher')} and ${pl(tt.entries.length, 'filled cell')} read. Week starts ${tt.weekStart || '(not found in the file)'}.`, tt.warnings);
      add('Counselling cells', cells.length ? 'ok' : 'fail', cells.length ? `${pl(cells.length, 'cell')} contain the word "${settings.keyword}", one per counselling slot.` : `No cell contains the word "${settings.keyword}".`);
    }
    if (!students) add('Student list', 'fail', 'No student list is loaded.');
    else {
      const withH = [...students.values()].filter(s => s.times > 0).length;
      add('Student list', 'ok', `${pl(students.size, 'student')} found; ${withH} have been counselled before this week.`);
    }
    const ch = checks || [], lk = ch.filter(c => c.level === 'lock'), wn = ch.filter(c => c.level === 'warn');
    if (ch.length) add('Input checks', lk.length ? 'fail' : wn.length ? 'warn' : 'ok', `${pl(lk.length, 'problem')} to fix before planning, ${pl(wn.length, 'warning')}.`, ch.slice(0, 200).map(c => `${c.level === 'lock' ? 'Fix' : 'Check'}: ${c.what}${c.fix ? ' ' + c.fix : ''}`));
    if (!result) { add('Matching', 'fail', 'The schedule has not been calculated yet.'); return L; }
    add('Counselling slots', plan.length ? 'ok' : 'fail', `${pl(plan.length, 'slot')} planned with ${plan.reduce((a, p) => a + p.k, 0)} seats; ${pl(moves.length, 'slot')} moved to a free cabin.`, planWarnings);
    const c = result.coverage, B = c.batches || [];
    add('Rounds', 'ok', `Each batch goes in roll-number order. ${c.reachable - c.roundDone} of ${c.reachable} students are due in their batch's current round and go first.${c.left ? ` ${c.left} marked Left.` : ''}${c.skipped ? ` ${c.skipped} in batches skipped this week.` : ''}`,
      B.map(b => `${b.batch}: round ${b.round}, ${b.dueBefore} of ${b.students} due, ${b.booked} booked this week${b.dueAfter ? `, ${b.dueAfter} still due after this week` : ', round finished'}${b.counsellors.length ? '' : ' (no teacher counsels this batch)'}`));
    if (result.dropped && result.dropped.length) add('Kept bookings', 'warn', `${pl(result.dropped.length, 'booking')} taken out because they are no longer valid.`, result.dropped);
    const booked = result.rows.length, cap = plan.reduce((a, p) => a + p.k, 0), P = result.passes || [];
    add('Matching', booked ? (booked < cap ? 'warn' : 'ok') : 'fail', `${booked} of ${cap} seats filled.${P.length ? ` ${P[0].booked} with students due this round, ${P[1] ? P[1].booked : 0} from the next round.` : ''}`);
    for (const x of result.slotLog) {
      const d = [`Batches to counsel: ${x.counsel.length ? x.counsel.join(', ') : 'none'}.`];
      for (const [w, v] of Object.entries(x.batches)) if (w !== 'open') d.push(`${pl(v.batches.length, 'batch')} out (${v.students} students): ${B_WHY[w] || w}. ${v.batches.slice(0, 12).join(', ')}${v.batches.length > 12 ? ' …' : ''}`);
      for (const [w, n] of Object.entries(x.students)) if (w !== 'booked') d.push(`${pl(n, 'student')} out: ${S_WHY[w] || w}.`);
      const cand = [...Object.entries(x.batches).filter(([w]) => w !== 'open').map(([w, v]) => [B_WHY[w], v.students]), ...Object.entries(x.students).filter(([w]) => w !== 'booked').map(([w, n]) => [S_WHY[w], n])].sort((a, b) => b[1] - a[1]);
      const main = x.filled >= x.k ? 'full' : x.note ? x.note : !Object.keys(x.batches).includes('open') ? `none of the teacher's batches is free at this time (${cand.length ? cand[0][0] : 'none'})` : 'every free student of the teacher’s batches is already booked or counselled this week';
      add(`${x.day} ${x.shift} · ${x.t}`, x.filled >= x.k ? 'ok' : x.filled ? 'warn' : 'fail', `${x.filled} of ${x.k} seats filled${x.filled >= x.k ? '.' : `. Main reason: ${main}.`}`, d);
    }
    return L;
  }
  const logText = L => L.map(l => `[${l.level.toUpperCase()}] ${l.step}: ${l.text}` + l.detail.map(d => '\n    - ' + d).join('')).join('\n');

  const api = { DAYS, SLOTS, COUNSEL_SHIFTS, activeShifts, defaultRules, defaultSettings, parseTimetable, parseStudents, buildStudents, buildPlan, finalizePlan, validatePlan, assignStudents, workload, makeCtx, hm, addDays, buildLog, logText, readTemplate, fillTemplate, TEMPLATE, TB, readTeacherBatches, checkTeacherBatches, fillTeacherBatchTemplate, timetableEdits,
    roomBatches, normShift, nearMatch, weekSlots, pickSlot, readStudentList, buildStudentsV2, fillStudentList, readTeachers, taughtFromTimetable, fillTeachersTemplate, checkInputs, batchTimetable, SL, TS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MCSEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
