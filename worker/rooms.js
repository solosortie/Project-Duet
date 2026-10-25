// Rooms: lookup, public info, creation (pending approval) and the owner's review API.
import { reply, sha256, safeEqual, newToken, validTimezone } from './util.js';

export const ANIMALS = ['deer', 'cat'];                       // add a name here once assets/<name>*.svg exist
export const DYNAMICS = ['partners', 'friends', 'siblings', 'family'];
const RESERVED = new Set(['dev', 'api', 'assets', 'healthz', 'home', 'admin', 'review', 'static', 'new', 'www', 'help', 'about', 'duet', 'demo', 'login', 'logout', 'app', 'robots', 'favicon', 'index', 'index-html', 'sitemap', 'manifest', 'status', 'support', 'privacy', 'terms']);
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} .'’-]{0,19}$/u;
const ADMIN_COOKIE = 'duet_admin';
const DAY = 86400;

export const SLUG_HEADER = 'X-Duet-Room';
export const slugShape = (s) => typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,22})[a-z0-9]$/.test(s) && !s.includes('--');
export const slugFree = (s) => slugShape(s) && !RESERVED.has(s);
export const cookieName = (slug) => (slug === 'home' ? 'duet' : `duet_${slug}`);

const cache = new Map();
export async function getRoom(env, slug) {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < 10000) return hit.room;
  const room = (await env.DB.prepare('SELECT * FROM rooms WHERE slug=?').bind(slug).first()) || null;
  cache.set(slug, { room, at: Date.now() });
  return room;
}
const forget = (slug) => { cache.delete(slug); cache.delete('#home'); };

// The address of the original room (room 1). 'home' means it still lives on the main page.
export async function homeSlug(env) {
  const hit = cache.get('#home');
  if (hit && Date.now() - hit.at < 10000) return hit.room;
  const row = await env.DB.prepare('SELECT slug FROM rooms WHERE id=1').first();
  const slug = row ? row.slug : 'home';
  cache.set('#home', { room: slug, at: Date.now() });
  return slug;
}

export async function roomInfo(slug, env) {
  if (!slugShape(slug) && slug !== 'home') return reply(404, { status: 'none' });
  const r = await getRoom(env, slug);
  if (!r || r.status === 'declined') return reply(404, { status: 'none' });
  if (r.status !== 'live') return reply(200, { slug: r.slug, status: r.status });
  return reply(200, { slug: r.slug, status: 'live', legacy: r.id === 1, dynamic: r.dynamic, timezone: r.tz,
    names: { aryan: r.name_a, chat: r.name_b }, animals: { aryan: r.animal_a, chat: r.animal_b } });
}

export async function slugCheck(slug, env) {
  if (!slugFree(slug)) return reply(200, { ok: false, reason: 'invalid' });
  const hit = await env.DB.prepare('SELECT 1 FROM rooms WHERE slug=?').bind(slug).first();
  return reply(200, { ok: !hit, reason: hit ? 'taken' : undefined });
}

const clean = (s) => (typeof s === 'string' ? s.normalize('NFC').replace(/\s+/g, ' ').trim() : '');

export async function createRoom(request, data, env, ctx) {
  const names = Array.isArray(data.names) ? data.names.map(clean) : [];
  const animals = Array.isArray(data.animals) ? data.animals : [];
  const slug = typeof data.slug === 'string' ? data.slug.toLowerCase() : '';
  const pass = typeof data.passphrase === 'string' ? data.passphrase : '';
  const tz = validTimezone(data.timezone) ? data.timezone : 'UTC';
  if (names.length !== 2 || !names.every((n) => NAME.test(n)) || names[0].toLowerCase() === names[1].toLowerCase()) return reply(400, { error: 'Check the names.' });
  if (animals.length !== 2 || !animals.every((a) => ANIMALS.includes(a))) return reply(400, { error: 'Choose two animals.' });
  const dynamic = data.dynamic === undefined ? 'partners' : data.dynamic;
  if (!DYNAMICS.includes(dynamic)) return reply(400, { error: 'Choose a dynamic.' });
  if (!slugFree(slug)) return reply(400, { error: 'That address is not available.' });
  if ([...pass].length < 8 || [...pass].length > 64) return reply(400, { error: 'Passphrase needs at least eight characters.' });

  const twin = await env.DB.prepare('SELECT status,salt,pass_hash,name_a,name_b FROM rooms WHERE slug=?').bind(slug).first();
  if (twin && twin.status === 'pending' && twin.name_a === names[0] && twin.name_b === names[1] && twin.pass_hash === await sha256(`${twin.salt}:${pass}`)) {
    return reply(200, { ok: true, slug, status: 'pending', repeat: true });
  }
  const now = Date.now() / 1000;
  const ipHash = (await sha256(`${request.headers.get('CF-Connecting-IP') || 'local'}|${env.IP_SALT || 'duet'}`)).slice(0, 24);
  const recent = await env.DB.prepare('SELECT count(*) n FROM rooms WHERE ip_hash=? AND created>?').bind(ipHash, now - DAY).first();
  if (recent.n >= 3) return reply(429, { error: 'Too many requests today.' });
  const pending = await env.DB.prepare("SELECT count(*) n FROM rooms WHERE status='pending'").first();
  if (pending.n >= 200) return reply(503, { error: 'Requests are paused for now.' });

  const salt = newToken().slice(0, 22);
  try {
    await env.DB.prepare('INSERT INTO rooms(slug,status,dynamic,name_a,name_b,animal_a,animal_b,tz,salt,pass_hash,ip_hash,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(slug, 'pending', dynamic, names[0], names[1], animals[0], animals[1], tz, salt, await sha256(`${salt}:${pass}`), ipHash, now).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return reply(409, { error: 'That address is taken.' });
    throw e;
  }
  forget(slug);
  if (env.NOTIFY_WEBHOOK) {
    const text = `New duet request: ${slug} (${names[0]} & ${names[1]})`;
    ctx.waitUntil(fetch(env.NOTIFY_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, text }) }).catch(() => {}));
  }
  return reply(201, { ok: true, slug, status: 'pending' });
}

// ---- owner review (admin) ----
async function adminSession(request, env) {
  const m = new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`).exec(request.headers.get('Cookie') || '');
  if (!m) return null;
  return (await env.DB.prepare("SELECT token FROM sessions WHERE token=? AND room_id=0 AND person='admin' AND expires>?").bind(await sha256(m[1]), Date.now() / 1000).first()) || null;
}

export async function adminLogin(request, data, env, secure) {
  if (!env.ADMIN_PASSPHRASE) return reply(503, { error: 'Review is not configured.' });
  const ip = `admin:${request.headers.get('CF-Connecting-IP') || 'local'}`, now = Date.now() / 1000;
  const r = await env.DB.prepare('SELECT count, until FROM attempts WHERE ip=?').bind(ip).first();
  if (r && r.until > now && r.count >= 6) return reply(429, { error: 'Too many tries.' });
  const ok = safeEqual(await sha256(String(data.passphrase ?? '')), await sha256(String(env.ADMIN_PASSPHRASE)));
  if (!ok) {
    await env.DB.prepare('INSERT OR REPLACE INTO attempts VALUES(?,?,?)').bind(ip, r && r.until > now ? r.count + 1 : 1, now + 900).run();
    return reply(401, { error: 'Not quite.' });
  }
  const token = newToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE ip=?').bind(ip),
    env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(now),
    env.DB.prepare("INSERT INTO sessions(token,person,expires,room_id) VALUES(?,'admin',?,0)").bind(await sha256(token), now + 8 * 3600),
  ]);
  return reply(200, { ok: true }, `${ADMIN_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${8 * 3600}${secure ? '; Secure' : ''}`);
}

// Returns a Response for handled admin routes, or null when the path is not an admin route.
export async function adminRoute(request, url, data, env, secure) {
  const p = url.pathname;
  if (!p.startsWith('/api/admin/')) return null;
  if (p === '/api/admin/login') return adminLogin(request, data || {}, env, secure);
  if (!env.ADMIN_PASSPHRASE) return reply(503, { error: 'Review is not configured.' });
  const session = await adminSession(request, env);
  if (!session) return reply(401, { error: 'Sign in first.' });
  if (p === '/api/admin/session') return reply(200, { ok: true });
  if (p === '/api/admin/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(session.token).run();
    return reply(200, { ok: true }, `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
  }
  if (p === '/api/admin/rooms') {
    const { results } = await env.DB.prepare("SELECT r.id,r.slug,r.status,r.dynamic,r.name_a,r.name_b,r.animal_a,r.animal_b,r.tz,r.created,r.decided,(SELECT count(*) FROM notes n WHERE n.room_id=r.id) notes FROM rooms r ORDER BY (r.status='pending') DESC, r.created DESC LIMIT 200").all();
    return reply(200, { rooms: results });
  }
  if (p === '/api/admin/move-home') {
    const to = data && data.slug;
    if (to !== 'home' && !slugFree(to)) return reply(400, { error: 'That address is not available.' });
    const clash = await env.DB.prepare('SELECT 1 FROM rooms WHERE slug=? AND id<>1').bind(to).first();
    if (clash) return reply(409, { error: 'That address is taken.' });
    const before = await env.DB.prepare('SELECT slug FROM rooms WHERE id=1').first();
    await env.DB.prepare('UPDATE rooms SET slug=? WHERE id=1').bind(to).run();
    if (before) forget(before.slug);
    forget(to);
    return reply(200, { ok: true, slug: to });
  }
  const slug = data && data.slug;
  const room = slugShape(slug) ? await env.DB.prepare('SELECT id,status FROM rooms WHERE slug=?').bind(slug).first() : null;
  if (!room || room.id === 1) return reply(404, { error: 'No such room.' });
  if (p === '/api/admin/decide') {
    if (data.status !== 'live' && data.status !== 'declined') return reply(400, { error: 'Choose live or declined.' });
    await env.DB.prepare('UPDATE rooms SET status=?, decided=? WHERE id=?').bind(data.status, Date.now() / 1000, room.id).run();
    forget(slug);
    return reply(200, { ok: true, status: data.status });
  }
  if (p === '/api/admin/delete') {
    if (data.confirm !== slug) return reply(400, { error: 'Type the address to confirm.' });
    await env.DB.batch([
      env.DB.prepare('DELETE FROM drawing_chunks WHERE upload IN (SELECT id FROM uploads WHERE room_id=?)').bind(room.id),
      env.DB.prepare('DELETE FROM uploads WHERE room_id=?').bind(room.id),
      env.DB.prepare('DELETE FROM notes WHERE room_id=?').bind(room.id),
      env.DB.prepare('DELETE FROM sessions WHERE room_id=?').bind(room.id),
      env.DB.prepare('DELETE FROM rooms WHERE id=?').bind(room.id),
    ]);
    forget(slug);
    return reply(200, { ok: true });
  }
  return reply(404, { error: 'Not found.' });
}
