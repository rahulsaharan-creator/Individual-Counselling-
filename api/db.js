// Counselling Planner database API (a Vercel function).
// Data lives in the Supabase Postgres database attached to this Vercel project (POSTGRES_URL).
// Two PINs, set as Vercel environment variables, decide what each person can do:
//   PLANNER_PIN   – publishes the weekly schedule, saves weekly records, reads everything
//   RECEPTION_PIN – enters teacher and student in-out times and attendance
// The tables have row level security switched on with no policies, so Supabase's public API cannot read them;
// only this function, which holds the database password, can.
const { Pool } = require('pg');
const crypto = require('crypto');

const dbUrl = () => process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || '';
let pool = null, ready = null;
function getPool() {
  if (!pool) {
    const u = new URL(dbUrl());
    u.searchParams.delete('sslmode'); u.searchParams.delete('supa');
    pool = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10000 });
  }
  return pool;
}
const q = async (text, params) => (await getPool().query(text, params)).rows;

const SCHEMA = `
create table if not exists cp_weeks (week date primary key, slots jsonb not null, rows jsonb not null, published_at timestamptz not null default now());
create table if not exists cp_slot_att (week date not null, slot_key text not null, data jsonb not null default '{}', updated_at timestamptz not null default now(), primary key (week, slot_key));
create table if not exists cp_student_att (week date not null, roll text not null, data jsonb not null default '{}', updated_at timestamptz not null default now(), primary key (week, roll));
create table if not exists cp_records (roll text not null, date date not null, week date not null, counsellor text, name text, batch text, time text, parent boolean not null default false, primary key (roll, date));
create index if not exists cp_records_week on cp_records (week);
alter table cp_weeks enable row level security;
alter table cp_slot_att enable row level security;
alter table cp_student_att enable row level security;
alter table cp_records enable row level security;`;
function init() { if (!ready) ready = q(SCHEMA).catch(e => { ready = null; throw e; }); return ready; }

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
function roleOf(pin) {
  if (!pin) return null;
  if (process.env.PLANNER_PIN && same(pin, process.env.PLANNER_PIN)) return 'planner';
  if (process.env.RECEPTION_PIN && same(pin, process.env.RECEPTION_PIN)) return 'reception';
  return null;
}
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const isWeek = w => typeof w === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w);
const clean = (data, keys) => {
  const out = {};
  for (const k of keys) if (data && k in data) { const v = data[k]; out[k] = typeof v === 'boolean' ? v : String(v == null ? '' : v).slice(0, 300); }
  return out;
};
const SLOT_KEYS = ['in', 'out', 'status', 'call', 'remark'];
const STU_KEYS = ['in', 'out', 'att', 'parent', 'reason'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const configured = !!(dbUrl() && process.env.PLANNER_PIN && process.env.RECEPTION_PIN);
  if (req.method === 'GET') return res.status(200).json({ configured });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!configured) return res.status(503).json({ error: 'The database is not set up yet.' });
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch (e) { return res.status(400).json({ error: 'Bad request.' }); } }
  const role = roleOf(req.headers['x-pin']);
  if (!role) { await new Promise(r => setTimeout(r, 800)); return res.status(401).json({ error: 'Wrong PIN.' }); }
  const need = r => { if (role !== r) throw fail(403, r === 'planner' ? 'Only the planner can do this.' : 'Only reception can enter attendance and in-out times.'); };
  const wk = body.week;
  try {
    await init();
    switch (body.action) {
      case 'whoami': return res.json({ role });
      case 'weeks':
        return res.json({ weeks: await q(`select week::text as week, published_at from cp_weeks order by week desc limit 30`) });
      case 'getWeek': {
        if (!isWeek(wk)) throw fail(400, 'No week given.');
        const w = await q(`select week::text as week, slots, rows, published_at from cp_weeks where week = $1`, [wk]);
        const sa = await q(`select slot_key, data from cp_slot_att where week = $1`, [wk]);
        const ua = await q(`select roll, data from cp_student_att where week = $1`, [wk]);
        return res.json({ schedule: w[0] || null, att: { slots: Object.fromEntries(sa.map(r => [r.slot_key, r.data])), stu: Object.fromEntries(ua.map(r => [r.roll, r.data])) } });
      }
      case 'publish': {
        need('planner');
        if (!isWeek(wk) || !Array.isArray(body.slots) || !Array.isArray(body.rows)) throw fail(400, 'Nothing to publish.');
        await q(`insert into cp_weeks (week, slots, rows, published_at) values ($1, $2, $3, now())
                 on conflict (week) do update set slots = excluded.slots, rows = excluded.rows, published_at = now()`, [wk, JSON.stringify(body.slots), JSON.stringify(body.rows)]);
        return res.json({ ok: true, at: new Date().toISOString() });
      }
      case 'setSlotAtt': case 'setStuAtt': {
        need('reception');
        const slot = body.action === 'setSlotAtt', key = String(body.key || '').slice(0, 200);
        if (!isWeek(wk) || !key) throw fail(400, 'Missing week or key.');
        const data = clean(body.data, slot ? SLOT_KEYS : STU_KEYS);
        const t = slot ? 'cp_slot_att' : 'cp_student_att', k = slot ? 'slot_key' : 'roll';
        const r = await q(`insert into ${t} (week, ${k}, data, updated_at) values ($1, $2, $3, now())
                 on conflict (week, ${k}) do update set data = ${t}.data || excluded.data, updated_at = now() returning data`, [wk, key, JSON.stringify(data)]);
        return res.json({ ok: true, data: r[0].data });
      }
      case 'records': {
        need('planner');
        const rows = await q(`select roll, date::text as date, week::text as week, counsellor as "by", name, batch, time, parent from cp_records order by date, roll`);
        return res.json({ records: rows });
      }
      case 'saveWeek': case 'importRecords': {
        need('planner');
        const list = Array.isArray(body.list) ? body.list.filter(x => x && x.roll && isWeek(x.date) && isWeek(x.week)) : [];
        const c = await getPool().connect();
        try {
          await c.query('begin');
          if (body.action === 'saveWeek') { if (!isWeek(wk)) throw fail(400, 'No week given.'); await c.query(`delete from cp_records where week = $1`, [wk]); }
          await c.query(`insert into cp_records (roll, date, week, counsellor, name, batch, time, parent)
              select r.roll, r.date::date, r.week::date, r."by", r.name, r.batch, r.time, coalesce(r.parent, false)
              from jsonb_to_recordset($1::jsonb) as r(roll text, date text, week text, "by" text, name text, batch text, time text, parent boolean)
              on conflict (roll, date) do update set week = excluded.week, counsellor = excluded.counsellor, name = excluded.name, batch = excluded.batch, time = excluded.time, parent = excluded.parent`,
            [JSON.stringify(list.map(x => ({ roll: String(x.roll), date: x.date, week: x.week, by: String(x.by || ''), name: String(x.name || ''), batch: String(x.batch || ''), time: String(x.time || ''), parent: !!x.parent })))]);
          await c.query('commit');
        } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
        return res.json({ ok: true, saved: list.length });
      }
      default: throw fail(400, 'Unknown action.');
    }
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    return res.status(code).json({ error: code === 500 ? 'Database error: ' + (e.message || 'unknown') : e.message });
  }
};
