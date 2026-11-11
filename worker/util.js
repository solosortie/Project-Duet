// Shared helpers for the Worker modules.
export const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Cross-Origin-Resource-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' };
const enc = new TextEncoder();

export async function sha256(s) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  let out = '';
  for (const b of new Uint8Array(d)) out += b.toString(16).padStart(2, '0');
  return out;
}
// Passphrase hashes. New ones are PBKDF2-SHA256 ("k1:<iterations>:<hex>"); older salted SHA-256 hashes still verify
// and are upgraded the next time that wall is opened. DUET_KDF_ITER sets the cost (default 10000, 0 turns it off).
export const kdfIter = (env) => { const n = Number(env && env.DUET_KDF_ITER); return Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), 600000)) : 10000; };
const hexOf = (buf) => { let o = ''; for (const b of new Uint8Array(buf)) o += b.toString(16).padStart(2, '0'); return o; };
export async function hashPass(salt, pass, iter) {
  if (!iter) return sha256(`${salt}:${pass}`);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return `k1:${iter}:` + hexOf(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: iter }, key, 256));
}
export async function checkPass(stored, salt, pass) {
  stored = String(stored || '');
  if (!stored) return false;
  if (stored.startsWith('k1:')) { const iter = Number(stored.split(':')[1]); return iter > 0 && iter <= 600000 && safeEqual(stored, await hashPass(salt, pass, iter)); }
  return safeEqual(stored, await sha256(`${salt}:${pass}`));
}
export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function reply(status, body, cookie) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY });
  for (const c of [].concat(cookie || [])) headers.append('Set-Cookie', c);
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
}

// Notes of rooms other than room 1 store their nonce as "<roomId>:<nonce>" so the global UNIQUE(nonce)
// can never collide across rooms. These helpers hide that from the API.
export const dbNonce = (roomId, nonce) => (roomId === 1 ? nonce : `${roomId}:${nonce}`);
export function publicNote(row) {
  const { room_id: roomId, ...rest } = row;
  if (roomId !== 1 && typeof rest.nonce === 'string') rest.nonce = rest.nonce.slice(String(roomId).length + 1);
  return rest;
}
// Serialize a note row. The stored drawing is already JSON text, so it is spliced in without a parse/stringify round trip.
export function noteJson(row) {
  const { drawing, ...rest } = publicNote(row);
  return JSON.stringify(rest).slice(0, -1) + ',"drawing":' + (drawing || '[]') + '}';
}

// IANA time zone helpers (no dependencies). Offsets are cached for a few minutes per zone.
const offsets = new Map();
export function validTimezone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}
export function tzOffsetSeconds(tz, now = Date.now()) {
  const hit = offsets.get(tz);
  if (hit && now - hit.at < 300000) return hit.value;
  let value = 19800;
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    value = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(now / 1000) * 1000) / 60000) * 60;
  } catch { /* unknown zone: keep the original Asia/Kolkata offset */ }
  offsets.set(tz, { value, at: now });
  return value;
}
