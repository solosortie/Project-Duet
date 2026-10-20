// Project Duet API for Cloudflare Workers + D1. Static files are served by the assets binding.
import { validateNote } from './validate.js';

const DEFAULT_MAX_BODY = 600000; // the Python server's limit; wrangler.jsonc lowers it for the free plan's 10 ms CPU cap
const SESSION_SECONDS = 30 * 86400;
const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

const enc = new TextEncoder();
async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  let out = '';
  for (const b of new Uint8Array(d)) out += b.toString(16).padStart(2, '0');
  return out;
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function reply(status, body, cookie) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

// Serialize a note row. The stored drawing is already JSON text, so it is spliced in
// without a parse/stringify round trip (keeps CPU low on the free plan).
function noteJson(row) {
  const { drawing, ...rest } = row;
  const head = JSON.stringify(rest);
  return head.slice(0, -1) + ',"drawing":' + (drawing || '[]') + '}';
}

async function passphraseHash(env) {
  if (env.DUET_PASSPHRASE) return sha256(String(env.DUET_PASSPHRASE));
  return String(env.DUET_PASSPHRASE_SHA256 || '');
}

async function getSession(request, env) {
  const m = /(?:^|;\s*)duet=([^;]+)/.exec(request.headers.get('Cookie') || '');
  if (!m) return null;
  const token = await sha256(m[1]);
  const row = await env.DB.prepare('SELECT token, person FROM sessions WHERE token=? AND expires>?')
    .bind(token, Date.now() / 1000).first();
  return row || null;
}

async function handleGet(url, session, env) {
  if (url.pathname === '/api/session') return reply(200, { person: session.person });
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
    ? 'SELECT * FROM notes WHERE id>? ORDER BY id ASC LIMIT 41'
    : 'SELECT * FROM notes WHERE id<? ORDER BY id DESC LIMIT 41';
  const { results } = await env.DB.prepare(sql).bind(cursor).all();
  const shown = results.slice(0, 40).map(noteJson).join(',');
  return reply(200, `{"notes":[${shown}],"more":${results.length > 40}}`);
}

async function handleUnlock(request, data, env, secure) {
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const now = Date.now() / 1000;
  const r = await env.DB.prepare('SELECT count, until FROM attempts WHERE ip=?').bind(ip).first();
  if (r && r.until > now && r.count >= 10) return reply(429, { error: 'Too many tries. Come back in ten minutes.' });
  const given = await sha256(String(data.passphrase ?? ''));
  if (!safeEqual(given, await passphraseHash(env))) {
    const count = r && r.until > now ? r.count + 1 : 1;
    await env.DB.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').bind(ip, count, now + 600).run();
    return reply(401, { error: 'That’s not quite it. Try again.' });
  }
  const token = newToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE ip=?').bind(ip),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
    env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(token), null, now + SESSION_SECONDS),
  ]);
  return reply(200, { ok: true }, `duet=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`);
}

async function handleNote(data, session, env) {
  const checked = validateNote(data, session.person);
  if (!checked.note) return reply(checked.status, { error: checked.error });
  const n = checked.note;
  const person = session.person;
  const recipient = person === 'aryan' ? 'chat' : 'aryan';
  const drawingJson = JSON.stringify(n.drawing);

  const prev = await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(n.nonce).first();
  if (prev && prev.author !== person) return reply(409, { error: 'This draft belongs to the other person.' });
  if (prev) {
    const same = prev.text === n.text && prev.paper === n.paper && prev.format === n.format
      && prev.text_size === n.textSize && JSON.stringify(JSON.parse(prev.drawing)) === drawingJson;
    if (!same) {
      return reply(409, `{"code":"draft_changed","note":${noteJson(prev)},"error":${JSON.stringify('The earlier version was already saved. Your changes are kept here; stick again to save them as a new note.')}}`);
    }
  }
  await env.DB.prepare('INSERT OR IGNORE INTO notes(nonce,author,recipient,text,drawing,paper,created,format,text_size) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(n.nonce, person, recipient, n.text, drawingJson, n.paper, Date.now() / 1000, n.format, n.textSize).run();
  const saved = await env.DB.prepare('SELECT * FROM notes WHERE nonce=?').bind(n.nonce).first();
  return reply(201, `{"ok":true,"note":${noteJson(saved)}}`);
}

async function handlePost(request, url, env) {
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
  if (url.pathname === '/api/unlock') return handleUnlock(request, data, env, secure);

  const session = await getSession(request, env);
  if (!session) return reply(401, { error: 'Please enter the passphrase.' });
  if (url.pathname === '/api/person') {
    if (data.person !== 'aryan' && data.person !== 'chat') return reply(400, { error: 'Choose a person.' });
    await env.DB.prepare('UPDATE sessions SET person=? WHERE token=?').bind(data.person, session.token).run();
    return reply(200, { ok: true });
  }
  if (url.pathname === '/api/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(session.token).run();
    return reply(200, { ok: true }, 'duet=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''));
  }
  if (url.pathname === '/api/notes') return handleNote(data, session, env);
  return reply(404, { error: 'Not found.' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/healthz') return reply(200, { ok: true });
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (request.method === 'GET') {
        const session = await getSession(request, env);
        if (!session) return reply(401, { error: 'Please enter the passphrase.' });
        return await handleGet(url, session, env);
      }
      if (request.method === 'POST') return await handlePost(request, url, env);
      return reply(405, { error: 'Method not allowed.' });
    } catch (err) {
      console.error('duet error', err && err.message);
      return reply(503, { error: 'Storage is temporarily unavailable. Your draft is kept; try again.' });
    }
  },
};
