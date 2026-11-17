/* The vault: end-to-end encryption for walls.
   The passcode never leaves the browser. From it (and a public per-wall salt) the browser derives:
     proof : a 256-bit login code. The server stores only a hash of it.
     enc   : an AES-GCM key that seals notes, drawings and drafts. The server never sees it.
     siv   : an HMAC key used to make sealing repeatable, so a retried save produces identical bytes.
   Works in browsers and in Node (tests). */
(function (root, factory) {
  var api = factory(root.crypto || (typeof require === 'function' ? require('node:crypto').webcrypto : null));
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Vault = api;
})(typeof self !== 'undefined' ? self : globalThis, function (crypto) {
  'use strict';
  var subtle = crypto.subtle, enc = new TextEncoder(), dec = new TextDecoder();
  var ITER = 300000, PIECE = 150000;
  var current = null;

  function hex(buf) { var o = ''; new Uint8Array(buf).forEach(function (b) { o += b.toString(16).padStart(2, '0'); }); return o; }
  function b64u(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function newSalt() { return hex(crypto.getRandomValues(new Uint8Array(16))); }

  async function hkdf(master, label) {
    return subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(label) }, master, 256);
  }
  // The slow step (300,000 rounds) is what makes guessing a short passcode expensive for anyone who gets the database.
  async function derive(passcode, saltHex, iter) {
    var pw = await subtle.importKey('raw', enc.encode(String(passcode).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    var bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('duet-vault-v1|' + saltHex), iterations: iter || ITER }, pw, 256);
    var master = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveBits']);
    var proof = hex(await hkdf(master, 'duet/auth'));
    var encKey = await subtle.importKey('raw', await hkdf(master, 'duet/enc'), 'AES-GCM', false, ['encrypt', 'decrypt']);
    var siv = await subtle.importKey('raw', await hkdf(master, 'duet/siv'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return { proof: proof, enc: encKey, siv: siv };
  }

  // A sealed value is "v1.<iv>.<ciphertext>". The IV comes from the siv key, the context and the content, so the same
  // note sealed twice is byte-identical (retries stay idempotent) while different content never shares an IV.
  async function seal(keys, value, context) {
    var plain = enc.encode(JSON.stringify(value)), aad = enc.encode('duet-v1|' + context);
    var mac = await subtle.sign('HMAC', keys.siv, concat(aad, new Uint8Array([0]), plain));
    var iv = new Uint8Array(mac).slice(0, 12);
    var ct = await subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad }, keys.enc, plain);
    return 'v1.' + b64u(iv) + '.' + b64u(ct);
  }
  async function open(keys, sealed, context) {
    var m = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]+)$/.exec(String(sealed));
    if (!m) throw new Error('Not sealed.');
    var plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(m[1]), additionalData: enc.encode('duet-v1|' + context) }, keys.enc, unb64u(m[2]));
    return JSON.parse(dec.decode(plain));
  }
  function concat() { var n = 0, i; for (i = 0; i < arguments.length; i++) n += arguments[i].length; var out = new Uint8Array(n), o = 0; for (i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; } return out; }
  function pieces(sealed) { var out = []; for (var i = 0; i < sealed.length; i += PIECE) out.push(sealed.slice(i, i + PIECE)); return out; }
  var isSealed = function (s) { return typeof s === 'string' && /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/.test(s); };

  // Keys are kept for this wall in the browser (non-extractable) so a page reload does not ask for the passcode again.
  function db() {
    return new Promise(function (ok, no) {
      if (typeof indexedDB === 'undefined') return no(new Error('no storage'));
      var r = indexedDB.open('duet-vault', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('keys'); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); };
    });
  }
  async function run(mode, fn) { var d = await db(); return new Promise(function (ok, no) { var tx = d.transaction('keys', mode), req = fn(tx.objectStore('keys')); tx.oncomplete = function () { ok(req && req.result); }; tx.onerror = tx.onabort = function () { no(tx.error); }; }); }
  async function save(slug, keys) { try { await run('readwrite', function (s) { return s.put({ enc: keys.enc, siv: keys.siv }, slug); }); } catch (e) { /* keys stay in memory for this tab */ } }
  async function restore(slug) { try { var k = await run('readonly', function (s) { return s.get(slug); }); if (k && k.enc && k.siv) { current = k; return k; } } catch (e) { /* none */ } return null; }
  async function clear(slug) { current = null; try { await run('readwrite', function (s) { return s.delete(slug); }); } catch (e) { /* nothing stored */ } }

  return { ITER: ITER, PIECE: PIECE, newSalt: newSalt, derive: derive, seal: seal, open: open, pieces: pieces, isSealed: isSealed,
    use: function (k) { current = k; }, keys: function () { return current; }, save: save, restore: restore, clear: clear, hex: hex, b64u: b64u };
});
