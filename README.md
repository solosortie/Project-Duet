# Project Duet

Vanilla HTML, CSS and JavaScript. Python backend. SQLite storage.

## Start

Python 3.10+ is the only runtime requirement. No install or build step.

```sh
./start.sh
```

Open **http://localhost:8765**. The configured passphrase is **229**. On Windows, run `python server.py` and open http://localhost:8000.

If an earlier version is running, stop it with Ctrl+C and restart. The backend must restart to pick up the new configuration and database migration. Keep your existing `data/` directory to preserve notes. This archive includes no test notes or database.

## Interface and editors

The centered title uses a heavier original Duet Hand font. ChatChan's deer is on the left, Aryan's cat on the right. Site labels use the original Duet Hand lowercase letters; notes retain their separate handwriting font. A person icon and “Logged in as …” identify the selected portal; wall headings explicitly name their owner.

**Add a note** opens two choices:

- **A canvas:** pencil, pressure-sensitive ink, translucent marker, eraser, five ink colors, stroke-size slider, paper colors, undo/redo, and preview. Draw with mouse, touch, or stylus. The stroke preview has padded bounds; round caps stay inside the canvas edges even at the largest width.
- **A note:** a dedicated writing surface, paper and text-size controls, and a live counter. The limit is **200 words and 3,000 characters**, enforced in both the interface and backend. Written notes flow naturally instead of being clipped into a fixed canvas.

Canvas and note drafts are saved separately for each person on this device. Closing an editor keeps its draft. **Preview** shows the finished note; **Stick to the wall** waits for SQLite confirmation before clearing the draft. Failed saves preserve drafts, and retried requests do not create duplicate posts. Existing notes and database records remain compatible. Published notes are append-only.

## Sound and animation

Settings contains music playback and volume. Play and mute have distinct SVG icons. Buttons produce a very quiet, short synthesized squish; no sound-effect download is needed. The three supplied tracks cycle in order: Coffee, tranquil, Sky. Settings → Sound includes a small next-track control. Playback starts after browser-permitted interaction.

The page has no decorative coffee mugs; a dedicated transparent, tightly framed mug SVG is used only as the favicon. The cat's whiskers connect to its cheeks. The deer has brown patches and a filled brown nose. Gentle tail and ear movements loop continuously with eased timing. Reduced-motion preferences are respected automatically, without a motion checkbox.

Responsive rules cover narrow phones, tablets, desktops, and short landscape screens. Dialogs scroll when necessary; note text remains readable and editing controls wrap rather than overflowing.

## Shared time and streaks

All three screens share a server-synchronized Kolkata clock, gently changing sky and meadow colors. The circular clock and date appear only on the walls. The clock falls back to device time while offline and resynchronizes on return.

The streak is shared. Both people must successfully post at least one note or drawing during the same Kolkata calendar day (midnight to midnight). The second contribution completes that day and increases the shared count once. Two small marks indicate today's contributions. Midnight clears those marks but preserves the previous count while renewal is due; a completely missed or one-sided day breaks the run. Historical posts count under these same rules; no notes are changed. Completion takes 2.4 seconds, including a continuous flame-to-badge return; a broken streak takes 1.7 seconds. Renewal stays at the badge/clock for 0.8 seconds without incrementing the number. Reduced-motion preferences use a brief still indicator.

## Configuration and hosting

The passphrase hash is stored server-side in `config.json`; that file is not served as a public asset. `DUET_PASSPHRASE` overrides it if set. Remove an old environment override if you want the configured **229** to take effect.

| Variable | Default / purpose |
| --- | --- |
| `DUET_PASSPHRASE` | Optional override for the configured phrase |
| `DUET_HOST` | `127.0.0.1`; use `0.0.0.0` inside a container |
| `PORT` | `8000`; launcher uses `8765` |
| `DUET_DATA` | `data/` beside server.py; use a persistent disk |
| `DUET_SECURE_COOKIE` | `1` for an HTTPS deployment |

**Cloudflare (free):** the backend also runs as a Cloudflare Worker with D1; see [deploy/CLOUDFLARE.md](deploy/CLOUDFLARE.md).

The project is delivered as local files, not deployed to a public URL. To share it remotely, use a Python/container host with persistent storage and HTTPS. Static-only hosting cannot run the database backend. Run one application instance with its SQLite volume.

The production container uses Gunicorn (one process, four threads). The local launcher remains dependency-free. A complete Docker Compose stack includes Caddy for HTTPS and a daily verified backup service. See [deployment instructions](deploy/README.md).

Use an HTTPS proxy preserving the original Host header. For local HTTP use the launcher rather than secure cookies. The server rejects cross-origin mutations, uses HttpOnly/SameSite session cookies, expires sessions after 30 days, and limits wrong passphrase attempts. Identity selection is intentionally trust-based: either holder of the shared phrase can choose either name.

The server uses the socket source address for rate limiting; behind a reverse proxy both people may share its ten-minute block after ten wrong attempts. It deliberately does not trust arbitrary forwarded IP headers.

## Data and backups

The server upgrades the existing SQLite schema automatically without removing notes. Notes and vector strokes live in `data/duet.sqlite3` (or `DUET_DATA`); drafts live in browser IndexedDB, with migration from older local-storage drafts. Detailed canvases are stored losslessly in validated vector chunks, with a single published manifest after every chunk arrives. Retry-safe uploads preserve pressure and coordinates; failed saves keep the local draft. The limits remain 500 strokes and 4,000 points per stroke segment. Unpublished uploads older than seven days are cleaned up when a new upload starts. Notes synchronize incrementally every five seconds while the page is visible. Unchanged notes are not redrawn. Reconnecting catches up in batches without losing intervening posts.

Create a consistent backup while the server is running:

```sh
python3 backup.py --directory backups
```

Restore **after stopping the server**:

```sh
python3 backup.py --restore backups/duet-TIMESTAMP.sqlite3 --server-stopped
```

The restore preserves the replaced database as a `.before-restore-*` file. Keep backups on another device too. Drafts are local to the browser and are not included in server backups. Changing the passphrase does not revoke existing sessions; to revoke them, stop the server and clear the SQLite `sessions` table.

## Assets and fonts

Editable SVGs and still companions are in `public/assets/`. The cat and deer use a 400×210 viewBox; the favicon is 32×32, tape 140×40. The animated variants contain looping tail/ear motion. Replace both animated and `-still.svg` files when substituting artwork. Three tape designs and six deterministic arrangements keep each note’s tape stable across refreshes. The deer nestles beside the entry card. Dedicated portrait SVGs identify the two choices.

`duet-hand.ttf` is the original display font generated from the centerlines in `design/build_font.py`. It includes heavier uppercase letters, 26 distinct lowercase letters, digits and basic punctuation. To rebuild only, install fontTools and run that script. No fontTools installation is needed to run the site. Its license is in `design/FONT-LICENSE.txt`. Caveat's separate SIL Open Font License is in `public/assets/FONT-LICENSE.txt`.

## Checks

```sh
python3 test_server.py
node --test worker/drawing-test.mjs
```

The test suite uses a temporary database. It covers authentication, origin rejection, logout, recipient routing, shared storage, confirmed saves, retry deduplication, changed-draft conflicts, brush/pressure validation, legacy notes, persisted database records, cursors, and private-file protection. Twelve integration tests pass on both the standard local server and Gunicorn, including incremental catch-up beyond forty notes, identity conflicts, expired sessions, and a real backup/restore round trip. The final UI was checked at phone, tablet, desktop, and short landscape viewport sizes in Chromium. Physical iOS/Android devices still need a final smoke check; browser emulation is not a substitute for those devices.

## Practical limits

This is a small, shared space: either holder of the phrase can select either name. There are no personal accounts or published-note deletion controls. The chosen phrase `229` is easy to guess, so do not treat it as strong protection for sensitive material. Published drawings retain editable stroke data in storage, but this release posts finished cards rather than reopening published cards for editing. Older notes load progressively; an extremely long session can eventually accumulate many cards in memory. Music waits for a browser-permitted gesture; click sounds use Web Audio. No external fonts, analytics, or frontend framework are loaded.

Full release history: [DEVELOPMENT-LOG.md](DEVELOPMENT-LOG.md).

Duet Text is the lighter mixed-case companion font (`python design/build_font.py --text` to rebuild with fontTools installed). Display titles and compact system labels retain Duet Hand. Streak renewal changes the dial tint; a confirmed daily post plays a brief flame celebration returning to its badge. A broken run fades to an unlit flame once per device for that break. Reduced-motion settings replace the large motion with a brief still indicator.

## Visual development controller

Append `?dev=1` to the site URL (for example `http://localhost:8765/?dev=1`). Open **Dev preview** at the bottom left. This opt-in preview intercepts all API requests locally: it does not bypass server authentication or write notes/streaks to the database. Preview drafts use memory; browser preferences use a separate preview prefix. Reload resets preview notes, date and streak overrides. **Exit preview** returns to the real site.

Controls: all three screens, either person, Kolkata date/time, frozen or accelerated time, day jumps, a shared streak count and both daily contribution switches, gain/break replay, renewal tint, reduced motion, tracks and existing sound controls, both editors, request latency/failure, sample notes and empty walls. Advancing through midnight changes completed → due → broken; rewinding does not reconstruct history (set the desired streak state explicitly). Paper, ink, brush and text-size controls remain in their actual editors. Resize the browser for responsive testing. Preview is a visual/API simulation, not a replacement for backend integration tests.

Check preview behavior with `node --test worker/dev-preview-test.mjs`.

Flame contours animate independently of their fixed position. Gain ignites, break fades into embers, and renewal shows a waiting flame. Color warms from yellow toward red over the Kolkata day; the surrounding glow stays subtle. Sun and moon artwork is currently removed.
Testing phase ongoing
