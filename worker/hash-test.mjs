// Passphrase hashing: new walls get PBKDF2, older SHA-256 walls still open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPass, checkPass, kdfIter, sha256 } from './util.js';

test('new hashes are PBKDF2 and verify; wrong passphrases and tampering do not', async () => {
  const h = await hashPass('salty', 'blue lamp 77', 10000);
  assert.match(h, /^k1:10000:[0-9a-f]{64}$/);
  assert.equal(await checkPass(h, 'salty', 'blue lamp 77'), true);
  assert.equal(await checkPass(h, 'salty', 'blue lamp 78'), false);
  assert.equal(await checkPass(h, 'other-salt', 'blue lamp 77'), false);
  assert.equal(await checkPass('k1:0:' + h.split(':')[2], 'salty', 'blue lamp 77'), false);
  assert.equal(await checkPass('k1:99999999:' + h.split(':')[2], 'salty', 'blue lamp 77'), false);   // absurd cost is refused
});

test('older salted SHA-256 hashes still verify', async () => {
  const old = await sha256('salty:229');
  assert.equal(await checkPass(old, 'salty', '229'), true);
  assert.equal(await checkPass(old, 'salty', '230'), false);
  assert.equal(await checkPass('', 'salty', '229'), false);
  assert.equal(await hashPass('salty', '229', 0), old);
});

test('the cost setting has a sane default and limits', () => {
  assert.equal(kdfIter({}), 10000);
  assert.equal(kdfIter({ DUET_KDF_ITER: '0' }), 0);
  assert.equal(kdfIter({ DUET_KDF_ITER: '50000' }), 50000);
  assert.equal(kdfIter({ DUET_KDF_ITER: '99999999' }), 600000);
  assert.equal(kdfIter({ DUET_KDF_ITER: 'abc' }), 10000);
});
