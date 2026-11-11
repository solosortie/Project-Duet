// Guard rails, against `wrangler dev` (needs ADMIN_PASSPHRASE=test-admin-pass in .dev.vars).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const RUN = Date.now().toString(36).slice(-5);
const d1 = (sql) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'duet', '--local', '--command', sql], { stdio: 'pipe' });
const ip = (n) => `198.18.${(Date.now() % 200) + 1}.${n}`;
function get(path, host, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    http.get({ host: u.hostname, port: u.port, path: u.pathname + u.search, headers: { Host: host, ...headers } }, (res) => {
      let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
}
async function post(path, body, headers = {}) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json, headers: res.headers };
}

test('polling endpoints allow normal use and slow down floods, with a plain Retry-After', async () => {
  const h = { 'CF-Connecting-IP': ip(1) };
  for (let i = 0; i < 40; i++) assert.equal((await fetch(BASE + '/api/slug?slug=free-' + RUN + i, { headers: h })).status, 200);
  const r = await fetch(BASE + '/api/slug?slug=free-' + RUN + 'x', { headers: h });
  assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
  assert.equal((await fetch(BASE + '/api/slug?slug=free-' + RUN + 'y', { headers: { 'CF-Connecting-IP': ip(2) } })).status, 200);   // someone else is unaffected
});

test('notes: a dozen tries an hour per person, then wait', async () => {
  d1('DELETE FROM attempts');
  const h = { 'CF-Connecting-IP': ip(3) };
  for (let i = 0; i < 12; i++) assert.equal((await post('/api/request/note', { slug: 'nobody', ticket: 'x', note: 'hi' }, h)).status, 403);
  assert.equal((await post('/api/request/note', { slug: 'nobody', ticket: 'x', note: 'hi' }, h)).status, 429);
});

test('new requests: six an hour per person', async () => {
  d1('DELETE FROM attempts; DELETE FROM rooms WHERE id<>1');
  const h = { 'CF-Connecting-IP': ip(4) };
  const body = (n) => ({ names: ['Mira', 'Jo'], animals: ['cat', 'deer'], slug: `g${n}-${RUN}`, passphrase: 'abc123', timezone: 'UTC' });
  let seen429 = false;
  for (let i = 0; i < 4; i++) { const r = await post('/api/rooms', body(i), h); assert.ok([201, 429].includes(r.status)); if (r.status === 429) seen429 = true; }
  assert.ok(seen429, 'the existing three-a-day cap still applies');
  d1('DELETE FROM attempts; DELETE FROM rooms WHERE id<>1');
});

test('admin sign-in: a few tries, then a wait; the wrong guesses never unlock it', async () => {
  d1('DELETE FROM attempts');
  const h = { 'CF-Connecting-IP': ip(5) };
  for (let i = 0; i < 6; i++) assert.equal((await post('/api/admin/login', { passphrase: 'nope' + i }, h)).status, 401);
  assert.equal((await post('/api/admin/login', { passphrase: 'nope' }, h)).status, 429);
  assert.equal((await post('/api/admin/login', { passphrase: 'test-admin-pass' }, h)).status, 429);
  d1('DELETE FROM attempts');
});

test('only JSON is accepted on writes', async () => {
  const r = await fetch(BASE + '/api/slug', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
});

test('search engines: the dash front page is open, everything else is closed', async () => {
  const dash = await get('/robots.txt', 'dash.localhost:8787'), dev = await get('/robots.txt', 'dev.localhost:8787'), walls = await get('/robots.txt', 'localhost:8787');
  assert.match(dash.body, /Allow: \/\n/); assert.match(dash.body, /Sitemap: .*\/sitemap\.xml/);
  assert.match(dev.body, /Disallow: \/\n/); assert.match(walls.body, /Disallow: \/\n/);
  assert.equal((await get('/sitemap.xml', 'dash.localhost:8787')).status, 200);
  assert.equal((await get('/sitemap.xml', 'dev.localhost:8787')).status, 404);
  const devPage = await get('/', 'dev.localhost:8787');
  assert.match(String(devPage.headers['x-robots-tag']), /noindex/);
  assert.equal(await get('/', 'dash.localhost:8787').then((r) => r.headers['x-robots-tag']), undefined);
});

test('security headers on pages and on the API', async () => {
  for (const r of [await get('/', 'dash.localhost:8787'), await get('/api/slug?slug=zz-' + RUN, 'dash.localhost:8787', { 'CF-Connecting-IP': ip(6) })]) {
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.ok(r.headers['referrer-policy']);
  }
  const page = await get('/', 'dash.localhost:8787');
  assert.match(String(page.headers['content-security-policy']), /frame-ancestors 'none'/);
});

test('wall passphrase: parallel wrong guesses are all counted, so only ten ever get an answer', async () => {
  const h = { 'CF-Connecting-IP': `203.0.${Date.now() % 250}.${(Math.random() * 200 | 0) + 1}` };
  const res = await Promise.all(Array.from({ length: 40 }, (_, i) => post('/api/unlock', { passphrase: `wrong-${RUN}-${i}` }, h)));
  const n = (s) => res.filter((r) => r.status === s).length;
  assert.equal(n(401), 10, 'exactly ten guesses are answered');
  assert.equal(n(429), 30, 'the rest are asked to wait');
  assert.ok(res.filter((r) => r.status === 429).every((r) => Number(r.headers.get('retry-after')) > 0));
});

test('review sign-in: parallel wrong guesses are all counted too', async () => {
  const h = { 'CF-Connecting-IP': `203.1.${Date.now() % 250}.${(Math.random() * 200 | 0) + 1}` };
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/api/admin/login', { passphrase: `nope-${RUN}-${i}` }, h)));
  assert.equal(res.filter((r) => r.status === 401).length, 6);
  assert.equal(res.filter((r) => r.status === 429).length, 14);
});

test('robots.txt keeps the dash page and its styles and scripts crawlable', async () => {
  const r = await get('/robots.txt', 'dash.purrpause.space');
  assert.match(r.body, /^Allow: \/$/m);
  assert.match(r.body, /Disallow: \/api\//);
  assert.doesNotMatch(r.body, /Disallow: \/dash\/\s/);   // dash.css and dash.js live under /dash/
  assert.match(r.body, /Sitemap: .*sitemap\.xml/);
});
