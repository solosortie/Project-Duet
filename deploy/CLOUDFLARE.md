# Deploying Project Duet on Cloudflare (Workers + D1)

One Worker serves the site (static files) and the API. Notes live in D1. No server, no disk, no card needed.
Run everything from the project root (the folder with `wrangler.jsonc`).

## First deploy

```sh
npm install
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
npm run backup        # writes backups/duet-latest.sql; rename or copy it somewhere safe
```

D1 also keeps point-in-time recovery for a limited window (`npx wrangler d1 time-travel info duet`).

## Local development and tests

```sh
npm run db:local
npm run dev           # http://127.0.0.1:8787
npm test              # in a second terminal; 13 integration tests
```

The Python server (`./start.sh`) still works for local use and is unchanged.

## Free plan notes

- Static files do not count as Worker requests. Only API calls do (about one every 5 seconds per open wall).
- The free plan allows 10 ms of CPU per request. `DUET_MAX_BODY` is set to 250000 bytes (about 12,000 drawn points) so
  oversized sketches get the normal "too large" message instead of a CPU error. Typical drawings use 2 to 3 ms.
  On Workers Paid you may raise it up to 600000.
- Wrong-passphrase limiting is per visitor IP (10 tries, then 10 minutes).
