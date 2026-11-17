# Deploying to Cloudflare

You need a Cloudflare account, Node 20 or newer, and `npm install` done.

1. **Database.** `npx wrangler d1 create duet`, then put the printed `database_id` in `wrangler.jsonc`.
2. **Migrations.** `npm run db:remote` (applies every file in `worker/migrations/`, including `0006_vault.sql`).
3. **Secrets** (never put these in `wrangler.jsonc`):
   - `npx wrangler secret put ADMIN_PASSPHRASE` your owner passphrase for the review site.
   - `npx wrangler secret put IP_SALT` any long random string; network addresses are stored only as a salted hash.
   - `npx wrangler secret put DUET_PASSPHRASE` only if you already have an original (home) wall made before locking existed. Its first login locks it and moves its old notes into the locked form. After that the secret is unused and can be deleted.
   - Optional: `npx wrangler secret put NOTIFY_WEBHOOK` a Discord or Slack webhook for new requests.
4. **Deploy.** `npm run deploy`.
5. **Addresses.** `wrangler.jsonc` `vars` names the hosts: `DUET_DASH_HOST` (the front page), `DUET_DEV_HOST` (the review site) and `DUET_ROOT_HOST` (the main address). Add them under the Worker's custom domains. Turn on "Always Use HTTPS" in Cloudflare.
6. **Search.** The front page, `/credits/`, `robots.txt` and the sitemap are served per host. Add the site in Google Search Console and submit `/sitemap.xml`. The review site and private walls stay unindexed.

## Moving the original wall

On the review site, "move home" gives the original wall its own address. The main address then shows the dashboard in its place, indexable, with its own canonical link and sitemap.

## Backups

`npm run backup` exports the database to `backups/` (git-ignored). Notes in locked walls are ciphertext, so a backup does not expose them.

## Before making the repository public

- Keep `.dev.vars` and `backups/` out of it (see `.gitignore`).
- If an old passcode hash was ever committed, change that passcode and publish from a fresh history.
- The credits page and intro already link to https://github.com/solosortie/Project-Duet.
