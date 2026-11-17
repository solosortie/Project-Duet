// Test helpers for locked walls: make the same salt/proof the pages make, with the page's own vault.js.
import { createHash } from 'node:crypto';
import Vault from './vault-load.mjs';
export { Vault };
export const saltFor = (slug) => createHash('sha256').update(String(slug || Math.random())).digest('hex').slice(0, 32);
// A request body that carries a passcode becomes one that carries a salt and proof instead, as the dash does.
export async function sealRoomBody(body) {
  const { passphrase, ...rest } = body;
  const salt = saltFor(rest.slug);
  return { ...rest, vault: { salt, proof: (await Vault.derive(passphrase, salt)).proof } };
}
// Opens a wall the way the walls page does: ask whether it is locked, then send a proof (or the old passphrase).
export async function unlockBody(base, room, body) {
  const info = await (await fetch(base + '/api/vault', { headers: room ? { 'X-Duet-Room': room } : {} })).json().catch(() => ({}));
  return info.vault ? { proof: (await Vault.derive(body.passphrase, info.salt)).proof } : body;
}
