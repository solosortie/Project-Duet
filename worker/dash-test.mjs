// The waiting scene's status endpoint, against `wrangler dev` (needs ADMIN_PASSPHRASE=test-admin-pass in .dev.vars).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN = process.env.DUET_TEST_ADMIN || 'test-admin-pass';
const RUN = Date.now().toString(36).slice(-5);
const d1 = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', '--command', sql], { stdio: 'pipe' });
const A = `first-${RUN}`, B = `second-${RUN}`;
let jar = {};
async function req(path, body, ip = '198.51.100.77') {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); if (pair.slice(i + 1)) jar[pair.slice(0, i)] = pair.slice(i + 1); }
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}
const make = (slug) => ({ names: ['Mira', 'Jo'], animals: ['cat', 'deer'], slug, passphrase: 'correct horse', timezone: 'Asia/Kolkata' });

test('a request reports where it stands and how many are ahead', async () => {
  d1("DELETE FROM attempts; DELETE FROM notes WHERE room_id<>1; DELETE FROM rooms WHERE id<>1");
  assert.equal((await req('/api/rooms', make(A))).status, 201);
  await new Promise((r) => setTimeout(r, 1100));   // created is in seconds; keep the order unambiguous
  assert.equal((await req('/api/rooms', make(B))).status, 201);
  assert.deepEqual((await req('/api/request?slug=' + A)).json, { status: 'pending', ahead: 0 });
  assert.deepEqual((await req('/api/request?slug=' + B)).json, { status: 'pending', ahead: 1 });
});

test('approved and declined are reported, and declined stays invisible on the public room lookup', async () => {
  assert.equal((await req('/api/admin/login', { passphrase: ADMIN })).status, 200);
  assert.equal((await req('/api/admin/decide', { slug: A, status: 'live' })).status, 200);
  assert.equal((await req('/api/request?slug=' + A)).json.status, 'live');
  assert.deepEqual((await req('/api/request?slug=' + B)).json, { status: 'pending', ahead: 0 });
  assert.equal((await req('/api/admin/decide', { slug: B, status: 'declined' })).status, 200);
  assert.deepEqual((await req('/api/request?slug=' + B)).json, { status: 'declined' });
  assert.equal((await req('/api/room?slug=' + B)).json.status, 'none');
});

test('unknown, malformed and original-wall addresses report nothing', async () => {
  for (const s of ['no-such-' + RUN, 'Bad Slug!', '', 'home']) assert.deepEqual((await req('/api/request?slug=' + encodeURIComponent(s))).json, { status: 'none' });
  await req('/api/admin/delete', { slug: A, confirm: A }); await req('/api/admin/delete', { slug: B, confirm: B });
});

test('the sender can leave a short note while waiting; nobody else can, and it shows on the review list', async () => {
  const C = `third-${RUN}`;
  const made = await req('/api/rooms', make(C), '198.51.100.78');
  assert.equal(made.status, 201);
  assert.ok(made.json.ticket);
  assert.equal((await req('/api/request/note', { slug: C, ticket: 'wrong', note: 'hi' })).status, 403);
  assert.equal((await req('/api/request/note', { slug: C, ticket: made.json.ticket, note: 'x'.repeat(401) })).status, 400);
  assert.equal((await req('/api/request/note', { slug: C, ticket: made.json.ticket, note: '  We are far apart.  ' })).status, 200);
  const list = (await req('/api/admin/rooms')).json.rooms.find((r) => r.slug === C);
  assert.equal(list.note, 'We are far apart.');
  assert.equal((await req('/api/admin/decide', { slug: C, status: 'live' })).status, 200);
  assert.equal((await req('/api/request/note', { slug: C, ticket: made.json.ticket, note: 'late' })).status, 409);
});
