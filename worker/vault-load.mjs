// Loads the browser's public/vault.js inside Node, so tests exercise the exact code the pages run.
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../public/vault.js', import.meta.url), 'utf8');
const ctx = { crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, Uint8Array, ArrayBuffer, JSON, String, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
export default ctx.Vault;
