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
      keyword: 'Counselling',
      shifts: { M1: ['07:00', '08:45'], M2: ['09:00', '10:45'], M3: ['11:00', '12:45'], E1: ['14:00', '15:45'], E2: ['16:00', '17:45'], E3: ['18:00', '19:45'] },
      counselShifts: { M1: false, M2: true, M3: true, E1: false, E2: true, E3: true },
      autoMoveShifts: { M1: false, M2: true, M3: true, E1: false, E2: true, E3: true },
      baseStudents: 9,
      reduceBuildings: ['M3', 'M3 old', 'M4', 'GP'],
      knownBuildings: ['M1', 'M2', 'M3', 'M4', 'MHS2', 'GP', 'PC'],
      checks: { M1: { before: '', after: 'M2' }, M2: { before: 'M1', after: 'M3' }, M3: { before: 'M2', after: '' }, E1: { before: '', after: 'E2' }, E2: { before: 'E1', after: 'E3' }, E3: { before: 'E2', after: '' } },
      pcVenueBuilding: 'PC',
      classGroups: '11th | Target, 12th',
      moveOverflow: true,
      noRepeatTeacher: true,
      oppositeShiftOnly: true,
      minGapDays: 0,
      rules: defaultRules(),
      batchBuildings: (master && master.batchBuildings) || {},
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
  function buildStudents(records, weekStart) {
    const cut = weekStart ? new Date(weekStart + 'T00:00:00Z') : null;
    const st = new Map();
    for (const rec of records) {
      let s = st.get(rec.roll);
      const d = rec.date;
      if (!s) { s = { roll: rec.roll, name: rec.name, batch: rec.batch, course: rec.course, seen: d, hist: new Map() }; st.set(rec.roll, s); }
      else if (d && (!s.seen || d >= s.seen)) { s.seen = d; s.batch = rec.batch; s.name = rec.name || s.name; s.course = rec.course || s.course; }
      if (d && rec.by && (!cut || d < cut)) s.hist.set(iso(d), rec.by);
    }
    for (const s of st.values()) {
      const h = [...s.hist.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
      s.history = h.map(([date, by]) => ({ date, by }));
      s.times = h.length; s.last = h.length ? h[h.length - 1][0] : ''; s.teachersSeen = new Set(h.map(x => x[1]));
      delete s.hist;
    }
    return st;
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
      let venue = 'M1 Building';
      for (const adj of [chk.before, chk.after]) { if (!adj) continue; const e = cell.get(t + '|' + day + '|' + adj); if (e && building(e.room) === settings.pcVenueBuilding) { venue = 'PC Campus'; break; } }
      return { k, start: st, end: en, rule: why.join('; ') || 'No reduction', venue };
    }
    const teacherFree = (t, day, sl) => !cell.has(t + '|' + day + '|' + sl);
    return { cell, occ, isCounsel, isDoubt, building, compute, teacherFree, unit };
  }

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
    const at = (d, s) => plan.filter(p => p.day === d && p.shift === s);
    const moves = [];
    if (settings.moveOverflow) {
      for (let guard = 0; guard < 500; guard++) {
        let over = null;
        for (const d of DAYS) for (const s of SH) if (!over && at(d, s).length > cabins.length) over = [d, s];
        if (!over) break;
        const [d, s] = over; let best = null;
        for (const p of at(d, s)) for (const d2 of DAYS) for (const s2 of MV) {
          if ((d2 === d && s2 === s) || at(d2, s2).length >= cabins.length || !ctx.teacherFree(p.t, d2, s2)) continue;
          if (plan.some(q => q.t === p.t && q.day === d2 && q.shift === s2)) continue;
          const same = plan.some(q => q !== p && q.t === p.t && q.day === d2) ? 1 : 0;
          const key = [Math.abs(DAYS.indexOf(d2) - DAYS.indexOf(d)), same, -ctx.compute(p.t, d2, s2).k, DAYS.indexOf(d2), SLOTS.indexOf(s2), p.t];
          if (!best || cmp(key, best.key) < 0) best = { key, p, d2, s2 };
        }
        if (!best) { warnings.push(`${d} ${s} has ${at(d, s).length} teachers but only ${cabins.length} cabins, and no free cabin fits their timetables. Move one manually.`); break; }
        moves.push({ t: best.p.t, from: `${d} ${s}`, to: `${best.d2} ${best.s2}` });
        Object.assign(best.p, { day: best.d2, shift: best.s2, moved: true });
      }
    }
    plan = finalizePlan(plan, tt, settings);
    return { plan, moves, warnings };
  }
  function cmp(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }

  /* assign cabins (respecting manual cabins), counts, times, dates */
  function finalizePlan(plan, tt, settings) {
    const ctx = makeCtx(tt, settings); const cabins = settings.cabins.filter(Boolean);
    for (const d of DAYS) for (const s of SLOTS) {
      const here = plan.filter(p => p.day === d && p.shift === s);
      const taken = new Set(here.filter(p => p.manual && p.cabin && cabins.includes(p.cabin)).map(p => p.cabin));
      const free = cabins.filter(c => !taken.has(c));
      here.filter(p => !(p.manual && p.cabin && cabins.includes(p.cabin))).sort((a, b) => a.t < b.t ? -1 : 1)
        .forEach(p => { p.cabin = free.shift() || ''; });
    }
    for (const p of plan) {
      const c = ctx.compute(p.t, p.day, p.shift);
      p.k = p.manualK != null ? p.manualK : c.k; p.start = c.start; p.end = p.manualK != null ? c.start + ctx.unit(p.shift) * p.manualK : c.end;
      if (p.manualK == null) p.end = c.end;
      p.rule = p.manualK != null ? `Set manually to ${p.manualK}` : `${c.k} students · ${c.rule}`; p.venue = c.venue;
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
    return out;
  }

  /* Step 3+4: match students */
  function assignStudents(plan, tt, settings, students) {
    const ctx = makeCtx(tt, settings);
    const groups = settings.classGroups.split('|').map(g => g.split(',').map(S).filter(Boolean));
    const groupOf = cls => { const i = groups.findIndex(g => g.includes(cls)); return i < 0 ? 'cls:' + cls : 'g' + i; };
    const tcls = t => (settings.teachers[t] && settings.teachers[t].cls) || '';
    // batch class = majority class of teachers teaching its regular classes
    const votes = {};
    for (const e of tt.entries) {
      if (!e.room || ctx.isCounsel(e) || ctx.isDoubt(e.room)) continue; const c = tcls(e.t); if (!c) continue;
      (votes[e.room] = votes[e.room] || {})[c] = (votes[e.room][c] || 0) + 1;
    }
    const batchCls = {}; for (const b in votes) batchCls[b] = Object.entries(votes[b]).sort((a, b2) => b2[1] - a[1])[0][0];
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
    const used = new Set(); const assign = []; let repeatSkips = 0, gapSkips = 0; const count = new Map();
    const gapCut = settings.minGapDays > 0 && settings.weekStart ? addDays(settings.weekStart, -settings.minGapDays) : '';
    const shiftOf = b => { let m = 0, e = 0; (ctx.occ.get(b) || []).forEach(k => k.split('|')[1][0] === 'M' ? m++ : e++); return m >= e ? 'Morning' : 'Evening'; };
    function fill(p, batches, basis) {
      const pool = [];
      for (const b of batches) if (freeAt(b, p.day, p.shift)) for (const s of (byBatch.get(b) || [])) pool.push(s);
      pool.sort((a, b) => (a.last || '') < (b.last || '') ? -1 : (a.last || '') > (b.last || '') ? 1 : a.batch < b.batch ? -1 : a.batch > b.batch ? 1 : a.roll < b.roll ? -1 : 1);
      for (const s of pool) {
        if ((count.get(p.id) || 0) >= p.k) return;
        if (used.has(s.roll)) continue;
        if (gapCut && s.last && s.last >= gapCut) { gapSkips++; continue; }
        if (settings.noRepeatTeacher && s.teachersSeen.has(p.t)) { repeatSkips++; continue; }
        used.add(s.roll); count.set(p.id, (count.get(p.id) || 0) + 1); assign.push({ pid: p.id, s, basis });
      }
    }
    const allB = [...byBatch.keys()].filter(b => ctx.occ.has(b));
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
    for (const r of rules) for (const p of plan) if (tMatch(r, p.t)) fill(p, pool(r, p.t), r.name || 'Rule');
    // times
    const byP = {}; assign.forEach(a => (byP[a.pid] = byP[a.pid] || []).push(a));
    const pm = Object.fromEntries(plan.map(p => [p.id, p]));
    const rows = [];
    for (const pid in byP) byP[pid].sort((a, b) => a.s.roll < b.s.roll ? -1 : 1).forEach((a, i) => { const p = pm[pid]; rows.push({ ...a, p, time: hm(p.start + p.unit * i), batchShift: shiftOf(a.s.batch) }); });
    rows.sort((a, b) => cmp([DAYS.indexOf(a.p.day), SLOTS.indexOf(a.p.shift), a.p.cabin, a.time], [DAYS.indexOf(b.p.day), SLOTS.indexOf(b.p.shift), b.p.cabin, b.time]));
    const short = plan.filter(p => (count.get(p.id) || 0) < p.k).map(p => `${p.t} on ${p.day} ${p.shift}: ${count.get(p.id) || 0} of ${p.k} seats filled (not enough free students who haven't met this teacher).`);
    const noCls = [...new Set(plan.filter(p => !tcls(p.t)).map(p => p.t))].map(t => `${t} has no class (11th / Target / 12th) in the teacher list, so only students of batches they teach could be matched.`);
    return { rows, repeatSkips, gapSkips, warnings: [...noCls, ...short], counts: Object.fromEntries(plan.map(p => [p.id, count.get(p.id) || 0])) };
  }

  const api = { DAYS, SLOTS, COUNSEL_SHIFTS, activeShifts, defaultRules, defaultSettings, parseTimetable, parseStudents, buildStudents, buildPlan, finalizePlan, validatePlan, assignStudents, workload, makeCtx, hm, addDays };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MCSEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
