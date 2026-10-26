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

Keep your existing database ID and secret. Do not create a replacement D1 database or import the sample/local database over the live one. Back up first, then apply migrations before deploying this version:

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

## Rooms and the approval gate (purrpause.space/dev)

The same Worker now hosts many duets. Nothing about the original room changes: `/` stays your room (room 1), with its
own passphrase and notes.

| Address | What it is |
|---|---|
| `/` | the original room |
| `/dev` | a plain what-it-is page with an "I have read this, continue" button (music starts then, with an on/off button), followed by the maker, three cards: names and animals, address (1 to 24 characters), passphrase (3 or more characters; the generated one is much stronger), then **Send request** |
| `/dev/review` | owner review: approve, decline, open or delete a duet (needs `ADMIN_PASSPHRASE`) |
| `/<address>` | a duet. Pending: a waiting page that opens the room by itself once approved. Unknown: a "nobody here" page |

How it behaves:
- A request starts as **pending**. Nobody can sign in until you approve it. Declined requests behave like unknown addresses.
- Each duet has its own passphrase, notes, drawings, streaks and time zone. A session cookie only works for its own room.
- A request sent twice (double tap, lost connection) returns the same pending room instead of an error.
- Limits: 3 requests per visitor per day, 200 pending at once, a reserved word list for addresses.
- Optional ping for each request: `npx wrangler secret put NOTIFY_WEBHOOK` with a Discord or Slack webhook URL.
- Internally the two people are still stored as slots `aryan` and `chat`; the names and animals shown come from the room.

### Going live (do these in order, from the project folder)

```sh
npm install
npm run backup                                          # copy of your notes first
npx wrangler d1 migrations apply duet --remote          # adds rooms and the streak cache; your notes become room 1
npx wrangler secret put ADMIN_PASSPHRASE                # your owner passphrase for /dev/review
npx wrangler deploy
```

Run the migration and the deploy back to back: for those few seconds the old Worker cannot sign anyone in, because
sessions gained a column. After deploying, check `/`, `/dev` and `/dev/review`.

### Local testing

```sh
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
npm test        # in a second terminal: unit, original-room and multi-room tests
```

### Not built yet

The Python server (`./start.sh`) stays single-room. Realtime sync, an invite link for the second person, passphrase
recovery and e-mail notices are not part of this release; see `PRODUCT-PLAN.md`.

### Moving your own wall to its own address (and making `/` the welcome page)

Nothing is copied: your wall is already a room in the same database, so its notes, drawings, streaks and passphrase stay exactly where they are. The move only gives it an address.

1. `npm run backup`, then deploy this version as usual.
2. Open `/dev/review`, find the card marked "your wall", press its arrow, and type the new address (for example `chanchan-aryanchan`).
3. `/` is now the welcome page, and your wall opens at `/chanchan-aryanchan`. Anyone still logged in at the old address is sent to the new one automatically, and unsent drafts carry over.
4. Tell ChatChan the new address (bookmarks and home-screen shortcuts to `/` now open the welcome page).

To undo it, press the same arrow and type `home`. Your passphrase stays whatever `DUET_PASSPHRASE` is set to.

Each visit to `/` now passes through the Worker once (one request), so the welcome page costs a little of the free daily budget; images, scripts and music do not.

### Short passphrases and addresses

A passphrase may be as short as 3 characters and an address as short as 1. That is easy to type but easy to guess:
failed sign-ins are limited to 10 per visitor per 10 minutes, which slows guessing but does not stop a determined
attacker using many connections. The generated five-word passphrase is the safe default; short addresses can also be
claimed first by whoever asks first, which is where your approval step helps.
