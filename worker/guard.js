// Quiet guard rails. Nothing here is meant to be noticed by people using the site normally:
// the limits are far above what a person does, and a refused request only asks them to wait a moment.
import { reply, sha256 } from './util.js';

// ---- cheap, in-memory limits (per Worker instance) for the read-only and polling endpoints ----
const buckets = new Map();
export function memLimit(key, max, windowMs, now = Date.now()) {
  let b = buckets.get(key);
  if (!b || now >= b.reset) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  if (buckets.size > 4000) for (const [k, v] of buckets) if (now >= v.reset) buckets.delete(k);
  return b.n <= max;
}

// ---- durable limits (D1) for the things that matter: creating requests, notes and every kind of password try ----
// Uses the existing attempts(ip, count, until) table with namespaced keys, so no new table is needed.
export async function dbHit(env, key, windowSec, now = Date.now() / 1000) {
  const row = await env.DB.prepare('INSERT INTO attempts(ip,count,until) VALUES(?1,1,?2+?3) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN until<=?2 THEN 1 ELSE count+1 END, until=CASE WHEN until<=?2 THEN ?2+?3 ELSE until END RETURNING count, until')
    .bind(key, now, windowSec).first();
  return row;
}
export async function dbLimit(env, key, max, windowSec) {
  const r = await dbHit(env, key, windowSec);
  return { ok: r.count <= max, wait: Math.max(1, Math.ceil(r.until - Date.now() / 1000)) };
}
export async function dbPeek(env, key, now = Date.now() / 1000) {
  const r = await env.DB.prepare('SELECT count, until FROM attempts WHERE ip=?').bind(key).first();
  return r && r.until > now ? r : { count: 0, until: 0 };
}
export async function sweep(env) {   // now and then, drop expired counters; costs nothing the rest of the time
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM attempts WHERE until<?').bind(Date.now() / 1000 - 60).run().catch(() => {});
}

// who is asking: a salted hash of the network address, so nothing readable is ever stored
export async function who(request, env) {
  return (await sha256(`${request.headers.get('CF-Connecting-IP') || 'local'}|${env.IP_SALT || 'duet'}`)).slice(0, 20);
}

export function slow(wait, text) {
  const res = reply(429, { error: text || 'A lot of tries. Please wait a moment and try again.', wait });
  res.headers.set('Retry-After', String(wait));
  return res;
}

// limits for the public endpoints, per person (per minute unless noted). Far above normal use.
const READS = { '/api/slug': 40, '/api/request': 90, '/api/room': 90, '/api/time': 60 };
export async function guardEdge(request, url, env) {
  const id = await who(request, env), p = url.pathname;
  if (request.method === 'GET') {
    const cap = READS[p] || 240;   // notes, state and drawings poll every few seconds
    if (!memLimit(`g:${p in READS ? p : 'any'}:${id}`, cap, 60000)) return slow(20);
  } else if (!memLimit(`p:${id}`, 600, 60000)) return slow(20);   // writes, including chunked drawing uploads
  return null;
}

// Counters are reserved BEFORE a secret is checked (so parallel guesses all count), and handed back on success.
export async function dbRefund(env, key) { await env.DB.prepare('UPDATE attempts SET count=MAX(count-1,0) WHERE ip=?').bind(key).run().catch(() => {}); }
export const wait = (r, now = Date.now() / 1000) => Math.max(30, Math.ceil(r.until - now));
