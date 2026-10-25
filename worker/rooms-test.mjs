// Multi-room integration tests against `wrangler dev` (needs ADMIN_PASSPHRASE=test-admin-pass in .dev.vars).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN = process.env.DUET_TEST_ADMIN || 'test-admin-pass';
const RUN = Date.now().toString(36).slice(-5);
const d1 = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', '--command', sql], { stdio: 'pipe' });

class Client {
  constructor(room, ip) { this.jar = {}; this.room = room; this.ip = ip; }
  async req(path, body, headers = {}) {
    const h = { 'Content-Type': 'application/json', ...headers };
    if (this.room) h['X-Duet-Room'] = this.room;
    if (this.ip) h['CF-Connecting-IP'] = this.ip;
    const cookie = Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';'); const i = pair.indexOf('=');
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)];
      if (v === '' || /max-age=0/i.test(c)) delete this.jar[k]; else this.jar[k] = v;
    }
    let json = null; try { json = await res.json(); } catch { /* empty */ }
    return { status: res.status, json };
  }
}
const make = (slug, o = {}) => ({ dynamic: 'friends', names: ['Mira', 'Jo'], animals: ['cat', 'deer'], slug, passphrase: 'correct horse', timezone: 'America/New_York', ...o });
const note = (o = {}) => ({ nonce: `rt-${RUN}-${Math.random().toString(36).slice(2, 10)}`, text: 'hello', paper: 'cream', drawing: [], format: 3, text_size: 40, ...o });
let admin;
async function approve(slug) { assert.equal((await admin.req('/api/admin/decide', { slug, status: 'live' })).status, 200); await new Promise((r) => setTimeout(r, 50)); }
async function enter(slug, person, pass = 'correct horse') {
  const c = new Client(slug); assert.equal((await c.req('/api/unlock', { passphrase: pass })).status, 200);
  assert.equal((await c.req('/api/person', { person })).status, 200); return c;
}
const A = `amber-${RUN}`, B = `birch-${RUN}`;

test('setup: clear limits, sign in as owner', async () => {
  d1('DELETE FROM attempts');
  admin = new Client(null, '198.51.100.5');
  assert.equal((await admin.req('/api/admin/login', { passphrase: 'wrong' })).status, 401);
  assert.equal((await admin.req('/api/admin/rooms')).status, 401);
  assert.equal((await admin.req('/api/admin/login', { passphrase: ADMIN })).status, 200);
  assert.equal((await admin.req('/api/admin/session')).status, 200);
});

test('addresses: shape, reserved words and availability', async () => {
  const c = new Client();
  for (const s of ['dev', 'api', 'home', 'ab', 'a--b', '-ab', 'UPPER space', 'x'.repeat(30)]) assert.equal((await c.req(`/api/slug?slug=${encodeURIComponent(s)}`)).json.ok, false, s);
  assert.equal((await c.req(`/api/slug?slug=${A}`)).json.ok, true);
});

test('creation is validated and starts pending', async () => {
  const c = new Client(null, '203.0.113.10');
  const bad = [{ names: ['Mira', 'mira'] }, { names: ['<b>x</b>', 'Jo'] }, { animals: ['cat', 'dragon'] }, { dynamic: 'rivals' }, { passphrase: 'short' }, { passphrase: 'seven77' }, { slug: 'dev' }, { names: ['', 'Jo'] }];
  for (const o of bad) assert.equal((await c.req('/api/rooms', make(`zz-${RUN}`, o))).status, 400, JSON.stringify(o));
  const r = await c.req('/api/rooms', make(A));
  assert.equal(r.status, 201); assert.equal(r.json.status, 'pending');
  const again = await c.req('/api/rooms', make(A));
  assert.equal(again.status, 200, 'the same request sent twice returns the pending room'); assert.equal(again.json.repeat, true);
  assert.equal((await c.req('/api/rooms', make(A, { passphrase: 'a different one' }))).status, 409, 'a different request for the same address is refused');
  const nodyn = make(`nd-${RUN}`); delete nodyn.dynamic; assert.equal((await c.req('/api/rooms', nodyn)).status, 201, 'dynamic is optional');
  await admin.req('/api/admin/delete', { slug: `nd-${RUN}`, confirm: `nd-${RUN}` });
  assert.equal((await c.req(`/api/slug?slug=${A}`)).json.ok, false);
});

test('a pending room leaks nothing and cannot be entered', async () => {
  const c = new Client(A);
  const info = await c.req(`/api/room?slug=${A}`);
  assert.equal(info.status, 200); assert.deepEqual(info.json, { slug: A, status: 'pending' });
  const u = await c.req('/api/unlock', { passphrase: 'correct horse' });
  assert.equal(u.status, 403); assert.equal(u.json.status, 'pending');
  assert.equal((await new Client('nobody-here').req('/api/room?slug=nobody-here')).status, 404);
});

test('creation is rate limited per visitor', async () => {
  const c = new Client(null, '203.0.113.99');
  for (let i = 0; i < 3; i++) assert.equal((await c.req('/api/rooms', make(`rl${i}-${RUN}`))).status, 201);
  assert.equal((await c.req('/api/rooms', make(`rl3-${RUN}`))).status, 429);
  for (let i = 0; i < 3; i++) await admin.req('/api/admin/delete', { slug: `rl${i}-${RUN}`, confirm: `rl${i}-${RUN}` });
});

test('owner review lists requests, approves, and the room goes live', async () => {
  const list = (await admin.req('/api/admin/rooms')).json.rooms;
  const row = list.find((r) => r.slug === A);
  assert.equal(row.status, 'pending'); assert.equal(row.name_a, 'Mira'); assert.ok(list[0].status === 'pending');
  assert.equal((await admin.req('/api/admin/decide', { slug: 'home', status: 'declined' })).status, 404);
  assert.equal((await admin.req('/api/admin/decide', { slug: A, status: 'maybe' })).status, 400);
  await approve(A);
  const info = (await new Client(A).req(`/api/room?slug=${A}`)).json;
  assert.equal(info.status, 'live'); assert.deepEqual(info.names, { aryan: 'Mira', chat: 'Jo' }); assert.deepEqual(info.animals, { aryan: 'cat', chat: 'deer' });
  assert.equal(info.timezone, 'America/New_York');
});

test('a live room: its own passphrase, notes, and time zone', async () => {
  const c = new Client(A, '203.0.113.20');
  assert.equal((await c.req('/api/unlock', { passphrase: 'nope-nope' })).status, 401);
  assert.equal((await c.req('/api/unlock', { passphrase: '229' })).status, 401, 'the original room phrase must not open a new room');
  const a = await enter(A, 'aryan'), b = await enter(A, 'chat');
  const n = note({ text: 'first note in a new room' });
  const r = await a.req('/api/notes', n);
  assert.equal(r.status, 201); assert.equal(r.json.note.nonce, n.nonce); assert.equal(r.json.note.room_id, undefined);
  assert.equal((await a.req('/api/notes', n)).json.note.id, r.json.note.id, 'retry is idempotent');
  const seen = (await b.req('/api/notes')).json.notes;
  assert.equal(seen.length, 1); assert.equal(seen[0].recipient, 'chat');
  assert.equal((await a.req('/api/time')).json.timezone, 'America/New_York');
  assert.equal((await a.req('/api/state')).json.timezone, 'America/New_York');
});

test('isolation: rooms never see each other', async () => {
  const mk = new Client(null, '203.0.113.30'); assert.equal((await mk.req('/api/rooms', make(B, { passphrase: 'another phrase' }))).status, 201); await approve(B);
  const a = await enter(A, 'aryan'), b = await enter(B, 'aryan', 'another phrase'), home = await enter('home', 'aryan', '229').catch(() => null);
  assert.equal((await b.req('/api/notes')).json.notes.length, 0);
  const shared = note({ text: 'same nonce in B' });
  assert.equal((await a.req('/api/notes', { ...shared, text: 'secret in A' })).status, 201);
  const clash = await b.req('/api/notes', shared);
  assert.equal(clash.status, 201); assert.equal(clash.json.note.text, 'same nonce in B', 'a nonce reused in another room must not leak or collide');
  assert.equal((await a.req('/api/notes')).json.notes.some((x) => x.text === 'same nonce in B'), false);
  // a cookie for room A is worthless against room B or the original room
  const stolen = new Client(B); stolen.jar = { [`duet_${A}`]: a.jar[`duet_${A}`], duet_x: 'x' };
  assert.equal((await stolen.req('/api/notes')).status, 401);
  const cross = new Client(B); cross.jar = { [`duet_${B}`]: a.jar[`duet_${A}`] };
  assert.equal((await cross.req('/api/notes')).status, 401);
  const legacy = new Client(null); legacy.jar = { duet: a.jar[`duet_${A}`] };
  assert.equal((await legacy.req('/api/notes')).status, 401);
  if (home) assert.equal((await home.req('/api/notes')).json.notes.some((x) => /secret in A|first note in a new room/.test(x.text)), false);
});

test('isolation: uploads and chunks are room-scoped', async () => {
  const a = await enter(A, 'aryan'), b = await enter(B, 'aryan', 'another phrase');
  const id = 'ab'.repeat(32), nonce = `up-${RUN}-nonce1`;
  const pts = { tool: 'ink', color: '#594739', width: 4, stride: 2, points: [10, 10, 20, 20] };
  assert.equal((await a.req('/api/uploads', { upload: id, author: 'aryan', nonce, paper: 'cream', text_size: 40, total: 1 })).status, 200);
  assert.equal((await a.req('/api/uploads/chunk', { upload: id, author: 'aryan', part: 0, drawing: [pts] })).status, 200);
  assert.equal((await b.req('/api/uploads/chunk', { upload: id, author: 'aryan', part: 0, drawing: [pts] })).status, 404);
  assert.equal((await b.req('/api/uploads/commit', { upload: id, author: 'aryan' })).status, 404);
  const done = await a.req('/api/uploads/commit', { upload: id, author: 'aryan' });
  assert.equal(done.status, 201); assert.equal(done.json.note.nonce, nonce); assert.equal(done.json.note.format, 4);
  assert.equal((await a.req(`/api/drawing/${id}/0`)).status, 200);
  assert.equal((await b.req(`/api/drawing/${id}/0`)).status, 404, 'room B must not read room A drawings');
});

test('streaks follow the room time zone', async () => {
  const a = await enter(A, 'aryan');
  const st = (await a.req('/api/state')).json;
  assert.equal(st.streaks.aryan.today, true); assert.ok(st.streaks.aryan.count >= 1);
});

test('declined rooms are closed; deleting removes everything', async () => {
  assert.equal((await admin.req('/api/admin/decide', { slug: B, status: 'declined' })).status, 200); await new Promise((r) => setTimeout(r, 50));
  const b = new Client(B);
  assert.equal((await b.req('/api/unlock', { passphrase: 'another phrase' })).status, 404);
  assert.equal((await b.req(`/api/room?slug=${B}`)).status, 404);
  assert.equal((await admin.req('/api/admin/delete', { slug: A, confirm: 'wrong' })).status, 400);
  assert.equal((await admin.req('/api/admin/delete', { slug: A, confirm: A })).status, 200);
  assert.equal((await admin.req('/api/admin/delete', { slug: B, confirm: B })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await new Client(A).req(`/api/room?slug=${A}`)).status, 404);
  assert.equal((await admin.req('/api/admin/delete', { slug: 'home', confirm: 'home' })).status, 404);
  const left = execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', '--json', '--command', 'SELECT (SELECT count(*) FROM notes WHERE room_id>1) n,(SELECT count(*) FROM uploads WHERE room_id>1) u,(SELECT count(*) FROM drawing_chunks WHERE upload=\'' + 'ab'.repeat(32) + '\') c'], { stdio: 'pipe' }).toString();
  assert.match(left, /"n": 0/); assert.match(left, /"u": 0/); assert.match(left, /"c": 0/);
});

test('moving the original wall to its own address keeps notes and logins, and "/" becomes the welcome page', async () => {
  const addr = `wall-${RUN}`, sleep = () => new Promise((r) => setTimeout(r, 60));
  const home = await enter('home', 'aryan', '229');
  const n = note({ text: `moving day ${RUN}` });
  assert.equal((await home.req('/api/notes', n)).status, 201);
  try {
    assert.equal((await admin.req('/api/admin/move-home', { slug: 'dev' })).status, 400);
    assert.equal((await admin.req('/api/admin/move-home', { slug: addr })).status, 200); await sleep();
    const moved = new Client(addr); moved.jar = { duet: home.jar.duet };                 // a login made before the move
    const seen = await moved.req('/api/notes');
    assert.equal(seen.status, 200); assert.ok(seen.json.notes.some((x) => x.text === n.text), 'notes survive the move');
    const info = (await new Client(addr).req(`/api/room?slug=${addr}`)).json;
    assert.equal(info.legacy, true); assert.deepEqual(info.names, { aryan: 'Aryan Chan', chat: 'ChatChan' });
    assert.equal((await new Client('home').req('/api/room?slug=home')).status, 404);
    const fresh = new Client(addr);
    assert.equal((await fresh.req('/api/unlock', { passphrase: '229' })).status, 200); assert.ok(fresh.jar[`duet_${addr}`], 'a new login gets a cookie for the new address');
    const html = await (await fetch(BASE + '/')).text();
    assert.match(html, /I have read this, continue/); assert.doesNotMatch(html, /room\.js/);
    const go = await fetch(BASE + '/', { redirect: 'manual', headers: { Cookie: `duet=${home.jar.duet}` } });
    assert.equal(go.status, 302); assert.equal(go.headers.get('location'), `${BASE}/${addr}`);
    fresh.jar.duet = home.jar.duet;
    assert.equal((await fresh.req('/api/logout', {})).status, 200);
    assert.equal((await moved.req('/api/notes')).status, 401, 'signing out ends the old login too');
  } finally {
    assert.equal((await admin.req('/api/admin/move-home', { slug: 'home' })).status, 200); await sleep();
  }
  const back = await (await fetch(BASE + '/')).text();
  assert.match(back, /room\.js/); assert.doesNotMatch(back, /I have read this/);
  assert.equal((await new Client('home').req('/api/room?slug=home')).json.status, 'live');
  const again = await enter('home', 'aryan', '229');
  assert.ok((await again.req('/api/notes')).json.notes.some((x) => x.text === n.text), 'notes are still there after moving back');
});

test('owner sign-out', async () => {
  assert.equal((await admin.req('/api/admin/logout', {})).status, 200);
  assert.equal((await admin.req('/api/admin/rooms')).status, 401);
});
