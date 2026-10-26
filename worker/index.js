// Project Duet API for Cloudflare Workers + D1. Static files are served by the assets binding.
// Every room-scoped query carries room_id; room 1 is the original personal room (no header needed).
import { uploadPost, streakState } from './drawing-api.js';
import { validateNote } from './validate.js';
import { reply, sha256, safeEqual, newToken, noteJson, dbNonce, tzOffsetSeconds } from './util.js';
import { getRoom, homeSlug, roomInfo, slugCheck, createRoom, adminRoute, slugShape, cookieName, SLUG_HEADER } from './rooms.js';

const DEFAULT_MAX_BODY = 600000; // the Python server's limit; wrangler.jsonc lowers it for the free plan's 10 ms CPU cap
const SESSION_SECONDS = 30 * 86400;

function roomSlug(request) {
  const s = request.headers.get(SLUG_HEADER);
  return s === null ? 'home' : slugShape(s) ? s : null;
}

async function getSession(request, env, slug) {
  const jar = request.headers.get('Cookie') || '';
  // The cookie named "duet" belongs to sessions made before the original room got its own address.
  // It only ever matches that room, because the query also requires the requested address.
  for (const name of slug === 'home' ? ['duet'] : [cookieName(slug), 'duet']) {
    const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(jar);
    if (!m) continue;
    const row = await env.DB.prepare("SELECT s.token, s.person, s.room_id, r.tz FROM sessions s JOIN rooms r ON r.id=s.room_id WHERE s.token=? AND s.expires>? AND r.slug=? AND r.status='live'")
      .bind(await sha256(m[1]), Date.now() / 1000, slug).first();
    if (row) return row;
  }
  return null;
}

// Streak input without scanning the whole notes table on every poll. Reads each author's days through the
// (room_id, author, created) index for a recent window and widens it only when a run touches the window's first day.
async function recentDays(env, session) {
  const off = tzOffsetSeconds(session.tz);
  const startOfToday = Math.floor((Date.now() / 1000 + off) / 86400) * 86400 - off;
  for (const span of [45, 400, 40000]) {
    const since = startOfToday - span * 86400, firstDay = Math.floor((since + off) / 86400);
    const rows = [];
    for (const author of ['aryan', 'chat']) {
      const { results } = await env.DB.prepare('SELECT DISTINCT CAST((created+?)/86400 AS INTEGER) day FROM notes WHERE room_id=? AND author=? AND created>=?').bind(off, session.room_id, author, since).all();
      for (const r of results) rows.push({ author, day: r.day });
    }
    if (span === 40000 || !rows.some((r) => r.day === firstDay)) return rows;
  }
}

async function handleGet(url, session, env) {
  const rid = session.room_id;
  if (url.pathname === '/api/session') return reply(200, { person: session.person });
  if (url.pathname === '/api/state') {
    const off = tzOffsetSeconds(session.tz), now = Date.now(), today = Math.floor((now / 1000 + off) / 86400);
    const last = await env.DB.prepare('SELECT max(id) m FROM notes WHERE room_id=?').bind(rid).first();   // read first: a note landing mid-way only causes one extra recompute
    const lastId = (last && last.m) || 0;
    // The cache is an optimisation only: if its table is missing (migration not applied yet) the answer is still computed.
    const hit = await env.DB.prepare('SELECT note_id, day, streaks FROM room_state WHERE room_id=?').bind(rid).first().catch(() => null);
    let body;
    if (hit && hit.note_id === lastId && hit.day === today) body = hit.streaks;
    else {
      const { now: _now, ...state } = streakState(await recentDays(env, session), now, off, session.tz);
      body = JSON.stringify(state);
      await env.DB.prepare('INSERT OR REPLACE INTO room_state(room_id,note_id,day,streaks) VALUES(?,?,?,?)').bind(rid, lastId, today, body).run().catch(() => {});
    }
    return reply(200, `{"now":${now},${body.slice(1)}`);
  }
  if (url.pathname.startsWith('/api/drawing/')) {
    const bits = url.pathname.split('/');
    if (bits.length !== 5 || !/^\d+$/.test(bits[4])) return reply(400, { error: 'Invalid segment.' });
    const row = await env.DB.prepare("SELECT d.data FROM drawing_chunks d JOIN uploads u ON u.id=d.upload JOIN notes n ON n.room_id=u.room_id AND n.format=4 AND json_extract(n.drawing,'$.upload')=d.upload WHERE d.upload=? AND d.part=? AND u.room_id=?").bind(bits[3], Number(bits[4]), rid).first();
    return row ? reply(200, '{"drawing":' + row.data + '}') : reply(404, { error: 'Drawing not found.' });
  }
  if (url.pathname !== '/api/notes') return reply(404, { error: 'Not found.' });
  const q = url.searchParams;
  const incremental = q.has('after');
  const raw = q.get(incremental ? 'after' : 'before');
  let cursor;
  if (raw === null) cursor = incremental ? 0 : Number.MAX_SAFE_INTEGER;
  else if (/^\d+$/.test(raw)) cursor = Number(raw);
  else return reply(400, { error: 'Invalid cursor.' });
  if (!Number.isSafeInteger(cursor) || cursor < (incremental ? 0 : 1)) return reply(400, { error: 'Invalid cursor.' });
  const sql = incremental
    ? 'SELECT * FROM notes WHERE room_id=? AND id>? ORDER BY id ASC LIMIT 41'
    : 'SELECT * FROM notes WHERE room_id=? AND id<? ORDER BY id DESC LIMIT 41';
  const { results } = await env.DB.prepare(sql).bind(rid, cursor).all();
  return reply(200, `{"notes":[${results.slice(0, 40).map(noteJson).join(',')}],"more":${results.length > 40}}`);
}

async function handleUnlock(request, data, env, secure, slug) {
  const room = await getRoom(env, slug);
  if (!room || room.status === 'declined') return reply(404, { error: 'No such room.' });
  if (room.status !== 'live') return reply(403, { error: 'Waiting for approval.', status: room.status });
  const ip = `${room.id}:${request.headers.get('CF-Connecting-IP') || 'local'}`;
  const now = Date.now() / 1000;
  const r = await env.DB.prepare('SELECT count, until FROM attempts WHERE ip=?').bind(ip).first();
  if (r && r.until > now && r.count >= 10) return reply(429, { error: 'Too many tries. Come back in ten minutes.' });
  const given = await sha256(String(data.passphrase ?? ''));
  let expected;
  if (room.id === 1) expected = env.DUET_PASSPHRASE ? await sha256(String(env.DUET_PASSPHRASE)) : String(env.DUET_PASSPHRASE_SHA256 || '');
  else expected = String(room.pass_hash || '');
  const input = room.id === 1 ? given : await sha256(`${room.salt}:${String(data.passphrase ?? '')}`);
  if (!expected || !safeEqual(input, expected)) {
    const count = r && r.until > now ? r.count + 1 : 1;
    await env.DB.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').bind(ip, count, now + 600).run();
    return reply(401, { error: 'That’s not quite it. Try again.' });
  }
  const token = newToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE ip=?').bind(ip),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
    env.DB.prepare('INSERT INTO sessions(token,person,expires,room_id) VALUES(?,?,?,?)').bind(await sha256(token), null, now + SESSION_SECONDS, room.id),
  ]);
  return reply(200, { ok: true }, `${cookieName(slug)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`);
}

async function handleNote(data, session, env) {
  const checked = validateNote(data, session.person);
  if (!checked.note) return reply(checked.status, { error: checked.error });
  const n = checked.note, person = session.person, rid = session.room_id;
  const recipient = person === 'aryan' ? 'chat' : 'aryan';
  const drawingJson = JSON.stringify(n.drawing);
  const key = dbNonce(rid, n.nonce);

  const prev = await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(key).first();
  if (prev && prev.author !== person) return reply(409, { error: 'This draft belongs to the other person.' });
  if (prev) {
    const same = prev.text === n.text && prev.paper === n.paper && prev.format === n.format
      && prev.text_size === n.textSize && JSON.stringify(JSON.parse(prev.drawing)) === drawingJson;
    if (!same) {
      return reply(409, `{"code":"draft_changed","note":${noteJson(prev)},"error":${JSON.stringify('The earlier version was already saved. Your changes are kept here; stick again to save them as a new note.')}}`);
    }
  }
  await env.DB.prepare('INSERT OR IGNORE INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size,room_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(key, person, recipient, n.text, drawingJson, n.paper, Date.now() / 1000, n.format, n.textSize, rid).run();
  const saved = await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(key).first();
  return reply(201, `{"ok":true,"note":${noteJson(saved)}}`);
}

async function handlePost(request, url, env, ctx, slug) {
  const origin = request.headers.get('Origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { /* malformed origin is rejected below */ }
    if (host !== url.host) return reply(403, { error: 'Origin rejected.' });
  }
  const maxBody = Number(env.DUET_MAX_BODY) || DEFAULT_MAX_BODY;
  if (Number(request.headers.get('Content-Length') || 0) > maxBody) return reply(413, { error: 'This drawing is too large.' });
  const body = await request.text();
  if (body.length > maxBody) return reply(413, { error: 'This drawing is too large.' });
  let data;
  try { data = JSON.parse(body); } catch { return reply(400, { error: 'Invalid request.' }); }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return reply(400, { error: 'Invalid request.' });

  const secure = url.protocol === 'https:';
  if (url.pathname === '/api/rooms') return createRoom(request, data, env, ctx);
  const admin = await adminRoute(request, url, data, env, secure);
  if (admin) return admin;
  if (slug === null) return reply(400, { error: 'Invalid room.' });
  if (url.pathname === '/api/unlock') return handleUnlock(request, data, env, secure, slug);

  const session = await getSession(request, env, slug);
  if (!session) return reply(401, { error: 'Please enter the passphrase.' });
  if (url.pathname === '/api/person') {
    if (data.person !== 'aryan' && data.person !== 'chat') return reply(400, { error: 'Choose a person.' });
    await env.DB.prepare('UPDATE sessions SET person=? WHERE token=?').bind(data.person, session.token).run();
    return reply(200, { ok: true });
  }
  if (url.pathname === '/api/logout') {
    const jar = request.headers.get('Cookie') || '', names = [...new Set([cookieName(slug), 'duet'])], hashes = [session.token];
    for (const name of names) { const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(jar); if (m) hashes.push(await sha256(m[1])); }
    await env.DB.batch(hashes.map((h) => env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(h)));
    return reply(200, { ok: true }, names.map((n) => `${n}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict` + (secure ? '; Secure' : '')));
  }
  if (url.pathname.startsWith('/api/uploads')) {
    const room = { id: session.room_id };
    const out = await uploadPost(url.pathname, data, session.person, env, room);
    return reply(out.status, out.data);
  }
  if (url.pathname === '/api/notes') return handleNote(data, session, env);
  return reply(404, { error: 'Not found.' });
}

// "/" is the original wall until it is given its own address; after that it is the welcome page.
// Anyone still holding a login from the old address is sent to the new one.
async function rootPage(request, env, url) {
  const home = await homeSlug(env);
  if (home === 'home') return env.ASSETS.fetch(request);
  if (/(?:^|;\s*)duet=/.test(request.headers.get('Cookie') || '')) {
    return new Response(null, { status: 302, headers: { Location: `${url.origin}/${home}`, 'Cache-Control': 'no-store' } });
  }
  return env.ASSETS.fetch(new Request(`${url.origin}/dev/`, request));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/healthz') return reply(200, { ok: true });
      if (url.pathname === '/') return await rootPage(request, env, url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      const slug = roomSlug(request);
      if (url.pathname === '/api/time') {
        const room = slug ? await getRoom(env, slug) : null;
        return reply(200, { now: Date.now(), timezone: (room && room.tz) || 'Asia/Kolkata' });
      }
      if (request.method === 'GET') {
        if (url.pathname === '/api/room') return roomInfo(url.searchParams.get('slug') || 'home', env);
        if (url.pathname === '/api/slug') return slugCheck(String(url.searchParams.get('slug') || '').toLowerCase(), env);
        if (url.pathname.startsWith('/api/admin/')) return (await adminRoute(request, url, null, env, url.protocol === 'https:')) || reply(404, { error: 'Not found.' });
        if (slug === null) return reply(400, { error: 'Invalid room.' });
        const session = await getSession(request, env, slug);
        if (!session) return reply(401, { error: 'Please enter the passphrase.' });
        return await handleGet(url, session, env);
      }
      if (request.method === 'POST') return await handlePost(request, url, env, ctx, slug);
      return reply(405, { error: 'Method not allowed.' });
    } catch (err) {
      console.error('duet error', err && err.message);
      return reply(503, { error: 'Storage is temporarily unavailable. Your draft is kept; try again.' });
    }
  },
};
