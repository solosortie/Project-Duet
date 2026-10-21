# Deploying Project Duet on Cloudflare (Workers + D1)

One Worker serves the site (static files) and the API. Notes live in D1. D1 persists published notes and drawing chunks independently of Worker deployments.
Run everything from the project root (the folder with `wrangler.jsonc`).

## First deploy

```sh
npm ci
npx wrangler login
npx wrangler d1 create duet
```

Copy the printed `database_id` into `wrangler.jsonc` (replace `REPLACE_WITH_DATABASE_ID`). Then:

```sh
npx wrangler d1 migrations apply duet --remote
npx wrangler secret put DUET_PASSPHRASE     # recommended: choose a longer phrase than the default
npx wrangler deploy
```

`deploy` prints a `https://project-duet.<your-subdomain>.workers.dev` address. Open it and test one note from each name.
Without the secret, the default passphrase (hash in `wrangler.jsonc`) applies.

## Upgrade an existing deployment

Keep your existing database ID and secret. Back up first, then apply migrations before deploying this version:

```sh
npm ci
mkdir -p backups
npm run backup
npx wrangler d1 migrations apply duet --remote
npx wrangler deploy
```

Migration `0002_drawings.sql` adds the upload/chunk tables and streak-query index without removing notes. Reload open browsers after deployment so they receive the matching drawing reader. Export backups include the complete chunk tables. This release has been tested locally; these remote commands have not been run for you.

## Custom domain

The domain's DNS must be on Cloudflare (free plan is fine). In the dashboard open Workers & Pages, then project-duet,
Settings, Domains & Routes, Add, Custom domain. HTTPS is automatic.

## Existing notes from the Python server (optional, once, into an empty database)

```sh
python3 worker/export_notes.py data/duet.sqlite3 import.sql
npx wrangler d1 execute duet --remote --file import.sql
```

Everyone signs in again afterwards; sessions are not copied.

## Backups

```sh
mkdir -p backups
npm run backup        # writes backups/duet-latest.sql; rename or copy it somewhere safe
```

D1 also keeps point-in-time recovery for a limited window (`npx wrangler d1 time-travel info duet`).

## Local development and tests

```sh
npm run db:local
npm run dev           # http://127.0.0.1:8787
npm test              # in a second terminal; 14 integration tests
```

The Python server (`./start.sh`) still works locally and applies the new schema automatically at startup. Keep its existing data directory. Run `node --test worker/drawing-test.mjs` for the two standalone codec/streak checks.

## Runtime behavior

- Walls use incremental polling every five seconds while visible, not realtime push. Clock/streak state refreshes every minute and after a successful post.
- Detailed drawings use multiple small requests under the existing 250,000-byte request cap. A note appears only after every validated chunk is stored; interrupted attempts retain the device draft and can be retried.
- Every published chunk remains in D1 and in database backups. Unpublished uploads expire after seven days; drafts stay on the originating browser.
- Music and fonts are served locally as static assets. No frontend framework or third-party font service is required.
- Check current Cloudflare plan quotas for your account before deployment; chunking addresses request size, not unlimited database capacity or traffic.
- Wrong-passphrase limiting is per visitor IP (10 tries, then 10 minutes).
