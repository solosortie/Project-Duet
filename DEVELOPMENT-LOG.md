# Project Duet — development log

## Foundation
- Vanilla HTML/CSS/JavaScript frontend; Python API and SQLite WAL storage.
- Shared server-checked passphrase (configured as 229), expiring HttpOnly sessions, trust-based person selection.
- ChatChan and Aryan Chan each write to the other's wall; both walls share persisted notes.
- Existing database schemas migrate without removing records.

## Visual system
- Oat paper, cocoa outlines, moss, honey and muted terracotta palette; design/PALETTE.md documents colors.
- Original Duet Hand title font with editable generator and a separate licensed handwriting font for notes.
- Reference-inspired cat and deer SVGs, colored portraits, paper edges, three tape styles, hand-drawn controls, simple outlined mug favicon.
- Final onboarding: centered title with cat, deer beside passphrase card, full-width green ground with grass marks and a translucent brown soil layer. Removed decorative pencil.
- Portal choice cards carry distinct animal portraits. Identity text uses a readable system sans font and the selected person's portrait at the right.
- Ear and tail motion now loop with spline easing; reduced-motion users receive still assets. Interaction no longer restarts SVG timelines.
- Tape crosses paper edges, including bottom and side arrangements. Add-note icon folds on hover without rotating its label.

## Editors and persistence
- Separate note and canvas modes, preview and confirmed posting.
- Notes: 200-word/3,000-character limits enforced by client and server; clickable text sizes and tabular counter.
- Canvas: pencil, pressure-sensitive ink, marker, eraser, ink/paper selection, sizes, undo/redo. Eraser has a dedicated cursor and size footprint.
- Local drafts per identity/mode, debounced stable save status, retry-safe nonces, conflict preservation and request timeouts.
- Incremental five-second synchronization preserves existing cards and catches up beyond forty missed posts. This is polling, not realtime push.
- Looping music with playback/volume controls; gesture-unlocked synthesized button sound.

## Responsive behavior
- Wide screens show both walls; narrow screens use wall tabs. Editors wrap controls and scroll when required.
- Welcome and choosing layouts are compact single screens at ordinary phone/desktop heights. Extremely short windows, enlarged text or accessibility zoom may scroll rather than hide controls.
- Ground spans the viewport; mobile animal placement and header spacing adapt separately.

## Operations and verification
- Dependency-free local launcher; production Gunicorn container, Caddy HTTPS, persistent SQLite volume.
- Daily verified SQLite snapshots, retention, retry on backup failure, restore preserving the previous database; deployment commands in deploy/README.md.
- Ten integration tests previously passed under both local HTTP and Gunicorn: auth/origin/session expiry, routing, retries/conflicts, limits/drawing validation, schema migration, pagination/catch-up, backup/restore, private-file protection.
- This final asset pass: JavaScript syntax, SVG XML and Compose configuration checked; desktop and phone entry screens inspected in Chromium.
- Production DNS/TLS and physical iOS/Android checks remain host/device tasks. No public deployment has been performed.

## Known boundaries
- Shared phrase and selectable identities are intentional; 229 is not strong authentication.
- Drafts stay on their device; published cards are append-only. No delete/edit-published interface.
- Browser audio policies require user interaction. Actual sound output depends on device/browser settings.
- Keep one application instance and its existing volume; copy backups off the server. An indefinitely loaded wall can accumulate cards in browser memory.

## Uploaded UI revision — meadow enhancement
Based on the supplied Downloads/project-duet.zip, preserving its UI/backend changes. Added layered green hills and a small wildflower SVG; extended meadow turf; retained the backdrop on choosing. Anchored the cat within PROJECT and deer to the measured ground level. Added reduced-motion-aware portrait selection animation, preventing simultaneous identity submissions. Walls now use a subtle sage wash while notes retain their paper colors. Desktop and 390px phone entry/choosing/wall views checked in Chromium; no browser errors observed. Other device sizes adapt through fluid dimensions and content-aware ground positioning; physical-device testing remains advisable.

## Cloudflare backend
- `worker/index.js` ports the Python API to a Cloudflare Worker with D1; same routes, validation, cookies, rate limit, retry and conflict behavior. Static files use the Workers assets binding.
- `worker/test.mjs` runs 13 integration tests against `wrangler dev`; `worker/export_notes.py` imports an existing SQLite database.
- Free-plan CPU guard: request bodies are capped at 250 KB (`DUET_MAX_BODY`).

## Walls background, flowers and export
- Walls screen has a time-of-day background (morning, day, evening, night from the visitor's local clock): sky, stars, two drifting cloud layers, paper grain, fixed meadow hills and seven small flowers (`meadow-sprig`, `meadow-daisy`, `meadow-tulip`, `meadow-bell`). Entry and choosing screens keep their own backdrop.
- Settings has Sound and Export tabs. Export (`public/export.js`) builds both downloads in the browser: a zip of notes (notes.json with strokes, notes.csv, PNG per canvas, readme) and a self-contained HTML copy of the walls page frozen at the current time of day. Either wall or both can be chosen.
- Responsive check at 12 viewport sizes from 320px to 1920px, including landscape phones: no layout breakage.


## 2026-10-21 — shared light, clock, streaks and reliable canvases
- Preserved the existing meadow, animals, tape, paper colors and minimal interface. Both entry screens and the walls now share interpolated lighting, original sun/moon SVGs and stars. Note paper stays readable at night.
- Added a sparse hand-drawn 12/3/6/9 clock and date. Time is anchored to the server and rendered in Asia/Kolkata across all screens; the celestial arc is illustrative.
- Added individual streaks derived from confirmed posts, including historical notes. Kolkata midnight boundaries, duplicate posts, missed days, and first-post flame feedback are covered.
- Added the two supplied tracks; all three cycle automatically. Settings has one small next-track control, retaining volume and mute behavior.
- Rebuilt Duet Hand with thicker capitals and 26 real lowercase glyphs. Applied it to site labels; note typography remains separate.
- Fixed large drawings without flattening or dropping detail: lossless packed vector chunks, immutable retries, owner checks, atomic publication and incremental hydration on both backends. Kept existing request caps. Old notes remain compatible; new canvases also work in exports.
- Moved drafts to IndexedDB to avoid localStorage's small synchronous quota. Drafts clear only after confirmed publication. Long pointer strokes continue in a new segment rather than losing later samples.
- Added migration 0002, retained existing data/configuration, updated Docker and SQLite-to-D1 export for chunk tables. Incomplete uploads expire after seven days; published drawings are retained.
- Verification: 12 Python integration tests passed with the standard server and pinned Gunicorn 23.0.0; 14 Worker integration tests passed on isolated local D1; two codec/streak unit tests passed. Final focused reruns covered upload cleanup and export/import round-trip. Browser checks covered desktop/phone day and night, draft reload, confirmed text/canvas saves, streak display and next-track control; no console errors observed.
- No production database, DNS or deployment was changed. Physical-device audio and public-host latency still require a deployed smoke check.

## Final interaction polish
- Clock appears only on walls, with a border following its circular face and the date outside. Completed, renewal and broken states tint the dial.
- Enlarged idle flame, increasing warmth with streak length, full-screen continuation and desaturation effects returning to the badge. Broken-run feedback is deduplicated locally against the server's last posted day.
- Layered cloud drift on onboarding and choosing, reserved edge lanes for sun/moon, livelier cat tail and deer ears.
- Added Duet Text: lighter capitals matching genuine lowercase glyphs. Music/next and export controls have clear spacing and uneven outlined buttons.
- Rechecked Python's 12 tests and the two standalone codec/streak checks after state changes; settings and onboarding/selection clock visibility inspected in Chromium.

- Final adjustments: animal and flame timing slowed approximately 25%; date switches to warm cream at night. Confirmed a new note increments the visible daily streak in the temporary preview.

- Design preference: keep buttons level, including hover states; do not add button rotation. Removed rotation from controls and added sound-panel breathing room with a subtle playback/volume divider.

- Fixed header icon contrast at the source: paper buttons now own dark ink instead of inheriting night sky text. Unified settings tabs, export labels, descriptions and actions under Duet Text, with distinct font metadata. PASSCODE entry has an inset field and focus treatment; cat blink morphs eyelids smoothly instead of flashing a thick overlay.

- Cat tail: replaced uniform oscillation with a slower asymmetric swish, eased reversals, diminishing follow-through and a resting pause.

- Flame artwork now morphs between curved outlines. Celebrations ease into an arcing return and trigger a separate ignition animation on the badge. Reduced motion uses a still flame.
- Added opt-in `?dev=1` controller with isolated request simulation and memory-only drawings/drafts, date acceleration, streak states/replay, scene selection, sound and editor access, latency/failure controls and sample walls. No backend debug endpoints or authentication changes. Added tests for opt-in isolation, retry behavior, failed saves and midnight transitions.

- Settings title uses original bold capitals; tabs are slightly heavier. Tracks renamed Coffee / tranquil / Sky. Identity stays unboxed: dark cocoa by day and warm cream at night. Removed celestial icons. Replaced flame transforms with hand-drawn contour sequences for ignition, extinction and renewal, day-progress hue and a soft afterglow; preview renewal replays the same effect. Removed independent flame-speed control so SVG and scene timings stay synchronized.

## Audit fixes
- Worker `/api/state` reads each author's recent days through the (author, created) index instead of scanning every note on each 60 s refresh; it widens the window only when a streak reaches its edge (new test covers a 60-day run).
- Removed a duplicate D1 binding, nine unreferenced SVGs and an empty function; `npm test` now runs unit and integration tests; restored `.gitignore`/`.dockerignore` (data, caches, databases excluded).

## 2026-10-22 — final release verification
- Preserved the latest local patches. Flame contours retain a fixed base/tip height through idle cycles and run 50% slower; removed floating sparks from idle/renewal.
- Checked onboarding, choosing and walls at seven viewport sizes (320×568 through 1440×900, including landscape); no horizontal overflow and header controls stayed within bounds. Inspected mobile settings and both editors at 320px; editors scroll vertically. Physical phones and mobile keyboards were not tested.
- Fixed an empty-preview-draft fallback discovered during the editor check; added regression coverage.
- Current Python suite: 12 passing tests. Unit suites pass. Wrangler deployment dry run succeeds. Verified migration 0002 preserves an existing note's full row and ID. Earlier Worker integration coverage remains documented above; no remote database was changed or deployment performed.

## Shared streak and grounded wall scenes
- Shared daily completion now requires one confirmed note/drawing from each person. Historical day intersections determine the count; repeat posts do not double-count. Both backends retain existing notes and expose contribution progress.
- Added smooth number changes, two contribution marks, a continuous 2.4-second flame-to-badge flight, 1.7-second broken-state sequence and local 0.8-second renewal. Pending days retain the count. Remote posts refresh streak state through the existing note-sync loop.
- Wall animals now share SVG coordinates with their support: grassy soil bank for deer; short-legged wooden table, saucer and coffee mug for cat. Enlarged scenes proportionally; no floating divider lines. Preserved patched animal contours and tail/ear loops; removed body bobbing that lifted them off the surfaces. Still variants included.
- Updated the developer preview to shared streak controls and tested first/second contributions, retry duplicates, midnight renewal, missed days and restarted runs.

- Validation: 13 Python integration tests and unit suites pass; Cloudflare deployment dry run succeeds. Both scenes inspected at desktop, 390px and 320px phone widths. Existing notes are untouched; shared streak totals can differ because only days with both authors now qualify.

## Rooms and approval
- Migration 0003 adds `rooms` and a `room_id` on notes, sessions and uploads; room 1 is the original room. Every Worker query is room-scoped; nonces, uploads and drawing chunks cannot cross rooms (covered by `worker/rooms-test.mjs`).
- `/dev` maker, `/dev/review` owner approval, `/<address>` rooms (single-page fallback + `room.js`). Requests are pending until approved; limits and reserved addresses apply.
- The Python server stays single-room.
- Onboarding reduced to three cards; scene animals stay fixed; address suggestions; passphrase generator and invite copy; request status is remembered; creation is retry-safe; passphrases need 8+ characters.
- What-it-is page with a read-first button, music after the button, deer placed on the hill crest by measuring the art, `/` switches to the welcome page when the original wall is given an address (`move-home`), old logins and drafts carry over.
- Onboarding text is one bold font (`design/build_onboarding_font.py` builds `duet-hand-bold.ttf`: equal stroke weight for every letter, lowercase included, plus the punctuation the original lacks); title and card labels stay in the app's Duet Hand.
- Passphrase minimum is 3 characters and addresses are 1 to 24 characters (client, server and tests).
- `/api/state` serves a cached streak result (`room_state`, migration 0004) that is recomputed only when a note arrives or the day changes; reading it no longer depends on how many notes a room holds.
- Streak lookup no longer fails when its cache table is missing (deploy before migration is safe).
- Drawing speed: finished strokes live on a cached layer and only the stroke in progress is redrawn once per frame; the page behind an open dialog stops animating and the editor backdrop is no longer blurred. Measured pointer latency fell from 103-156 ms to 7-11 ms per event (35 ms instead of 307 ms on a 4x slower CPU).
- Wall notes are cropped from their stroke bounds (no full-canvas pixel read-back) and painted when they near the screen; building a card went from 12 ms to 3.5 ms. Note dates use the room's time zone.

## One editor: drawing and text on the same page
- The separate written-note editor and the two-choice dialog are gone. "Add a note" opens one editor with Pencil, Ink, Marker, Text and Eraser. Text items sit on the page like strokes (`tool:'text'`, one anchor point, box width/height, one of four sizes, ink colour, up to 500 characters); they can be edited, moved, resized, deleted and undone.
- Validation (`worker/validate.js`), chunk storage (`worker/drawing-api.js`, `public/drawing-store.js`), the wall renderer, previews and exports all understand text items. Written notes made earlier keep displaying; an unsent written draft becomes a text item on the page.
- Layout: tool rail on the left, undo/redo directly above the page, Preview and Stick at the bottom (Stick is the primary action, bottom right); on phones the page comes first with the tools under it and the actions pinned to the bottom. Every control is at least 44 px. Shortcuts: P I M T E, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl/Cmd+Enter or Esc to finish text.
- The Python server does not accept text items (it is local-only); use the Worker.

## Fill, colour menu, nibs, faster wall, black-canvas fix
- **Wall load.** The wall no longer waits for every drawing. Cards appear at once and each drawing is fetched when its card nears the screen (four at a time). `GET /api/drawing/<upload>` returns a whole note in one request, found through the indexed nonce (stored as `<roomId>:<nonce>` outside room 1) instead of scanning notes, and is sent `immutable` so a second visit reads it from the browser's disk cache. With 35 drawing notes and 250 ms per request the wall went from about 13 s blank to all cards at about 2 s and the first screen drawn at about 2.4 s (local measurement, synthetic notes). The export still loads everything, four at a time.
- **Black canvas on phones.** The editor canvas was created with `desynchronized: true`, which comes up opaque black on some phones. It is now `{alpha: true, desynchronized: false}`, the paper colour is painted behind the strokes in `paintLive` (so erasing still works), the paper repaints when it changes, and `#drawing` has a transparent background with `color-scheme: only light`. Not reproducible in desktop Chromium, so check on a real phone.
- **Phone size.** Phones use the page edge to edge, and portrait tablets (up to 1000 px) use the stacked layout, so the page is about 97% of the width. A landscape phone is limited by its height.
- **Fill tool.** `public/fill.js` finds the area under a tap on the page as drawn so far (about 9% ink is a wall, gaps up to 4 units close) and stores its outline as a `fill` item (closed loops of integer points, at most 24 loops and 1500 points). It is drawn with `destination-over`, so it sits behind the lines. An open shape (area over 55% of the page) is refused with a short shake and a toast. Python server: fill is not supported there (like text).
- **Colours.** Any `#rrggbb` ink is accepted (server, Python server and client). The five inks stay as they were; one extra circle opens a menu with 13 more colours, a picker, and colours you saved on this device (`duet-colors` in local storage).
- **Nibs.** Pencil is graphite grain from a seeded tile (the same on every device) with a denser centre. The marker is a chisel highlighter: a nib at 35 degrees, thick across and thin along, flat ends, multiply blending and a single fill so it never darkens itself. Notes drawn earlier with these tools now show the new look. The size preview draws with the real nib at the real on-page size.
- Tests: `worker/fill-test.mjs` (fill module) and `worker/features-test.mjs` (colours, fills, the one-request drawing endpoint) were added to `npm test`.

## Private drafts
- Migration 0005 adds `drafts` and `draft_chunks`. A draft belongs to the person who saved it: only they can list, open, copy, bin or restore it, on any of their devices. Sticking it posts a note and removes the draft.
- Saves are chunked like note uploads (`POST /api/drafts`, one chunk per request, the last one commits). The commit is a conditional UPDATE on `rev`, so a stale save from another device gets a 409 and the client keeps it as a copy; nothing is overwritten. Repeating the same save is a no-op.
- Binned drafts are kept 7 days (`GET /api/drafts?deleted=1`, `/restore`). Abandoned chunk sets are swept after a day. 24 drafts per person.
- The note poll (`/api/notes?after=`) carries `drafts:{n,t}` for your own drafts, so the Drafts badge updates with no extra request.
- Client: `public/drafts.js`, hand-drawn Drafts button and shelf (taped cards with JPEG thumbnails), name field and Save draft in the editor, autosave to the server 6 s after a change and on close. The copy in IndexedDB is a crash buffer for unsent edits.
- The `?dev=1` preview has an in-memory shelf; the Python server has no drafts (like text and fill).
- Tests: `worker/drafts-test.mjs` (11, in `npm test`), plus a headless-browser pass of draw, save, shelf, reopen.

## New animal art
- Hand-drawn PNGs replaced the SVG animals in four slots, as WebP with transparency: `cat.webp` (lying on the PROJECT wordmark, header and entry screens), `deer.webp` (entry meadow), `deer-seat.webp` (ChatChan's wall, on the supplied grass bank), `cat-seat.webp` (Aryan's wall, on the brick wall with torn left, right and bottom edges).
- Each was cropped to the subject and fitted to the old SVG's viewBox and contact line, so the existing CSS positions still work. `room.js` now rewrites `.svg` and `.webp` names, so rooms that swap animals keep working.
- The old animal SVGs are still in `assets/` (portraits, favicons and the `-still` variants are unchanged and still used).

## Portraits, favicons, wall cat
- `portrait-cat.webp` and `portrait-deer.webp` replace the SVG portraits (choose cards, identity avatar, dev pages).
- `favicon-cat.png` and `favicon-deer.png` (128 px, head on a round badge) replace the per-person SVG favicons; `updateFavicon()` sets the right type. The generic `favicon.svg` is still used before a person is chosen.
- `cat-seat.webp` is now cut straight from the supplied wall image (its drawn fuzzy edges kept; the thin top line outside the wall removed).
- `cat.webp` (header) sits 20 units further right so the tail hangs from the T.

## Tape
- Four hand-drawn rolls (`assets/tape-red|yellow|blue|green.webp`) and five layouts, chosen from the note's nonce so both people see the same: 0 two pieces on opposite corners, 1 two on the top corners, 2 one strip across the top middle, 3 one long piece across the top-right corner, 4 two upright pieces over the top edge. One roll per note. `addTapes()` in `app.js` and the `data-tape` rules at the end of `style.css`; each piece is centred on `--x/--y` and turned by `--r`. Draft cards use the same function.
- The old tape SVGs remain only for the `/dev` pages. The entry card uses the yellow roll.
- Page-curl corners from the reference sheet are not implemented.


## Dash and review site audit
- Merged the dash and review site into the latest walls code; shared paper tiles moved to `public/paper.js`.
- Fixed: review API and `/` unusable on localhost when the host names are set; passphrase step could resume past a lost passphrase; waiting scene overflowed on phones; stamp text was clipped; open confirmations in the review list were wiped by the refresh; failed delete/decide were silent.
- Old `/dev` folder and `dev.zip` removed.

## Round: dash polish 2 (favicon, sound, cards, buttons, hanging)
- Walls entry title: per-animal placement. A swapped deer now rests on the letters (`.brand-cat[src*="deer"]` rule in style.css); the cat rule is unchanged.
- Dash title cat sits on the letters (`.wm img`).
- Mug button removed. Replaced by a gear (top-right) opening a "Sound" dialog (music on/off, track, volume). It shares the walls page's localStorage keys (`duet-audio`, `duet-track`).
- New neutral favicon (superseded in the next round by the cat and deer icons).
- Cards are proper rounded cards (no clip-path cuts). Buttons restyled (moss primary, secondary, back, icon, link, chip). Step progress is now stepping stones.
- Waiting scene: sagging twisted rope with nails, leaning pegs, rounded card. Link, hourglass and status icon use `--ink` so they stay readable on the night sky.

## Round: dash polish 3
- One page, no scrolling: the intro is three short pages inside one card; step screens are sized to fit (main only scrolls as a last resort on tiny windows). Scroll hint removed.
- All dash cards carry the same horizontal yellow tape. Buttons redone (Next/Back with labels, press-down feel, hand-cut corners). Step stones are buttons: back always, forward only when the steps before are valid.
- Cream paper is warm and grainy instead of white. The review card shows the passphrase with an eye button.
- After sending: a "save your passphrase" panel (eye, copy) stays on the waiting and approved screens. The passphrase is only in memory, so it cannot be shown again after a refresh.
- Optional note while waiting: `POST /api/request/note {slug, ticket, note}` (migration 0005 adds `rooms.note`, `rooms.ticket`). The ticket is returned once at creation and kept by the sender's browser (stored hashed). Max 400 characters, pending only. Shown on the review site.
- Hand-drawn "i" on each card with a short tip (hover, or tap on touch).
- Hourglass: sand runs down, a thin stream falls, then it turns over.
- Favicon: the neutral one is gone. `fav.js` alternates the cat and the deer icons per visit (walls pages still use the chosen animal).
- Review site: plain soft background, flat cards, no tape or sky; shows the sender's note.

## Round: dash polish 4
- Dash cards use different horizontal tapes again (colour chosen per card).
- The "i" opens a small note beside the cards (below them on a narrow screen), closes on a second tap, outside click or Escape.
- Waiting screen simplified: card, status, one slim passphrase row, one action. Copy invite moved to the approved state.
- Note box intro shortened.
- Main site: an "i" next to settings opens the introductory text; settings/about buttons use the dash button style.
- Review site brought back to the shared look (sky, hills, paper cards, dash buttons), still without tape.

## Round: production pass
- Dash: the "i" beside the gear brings the intro back (walls site has none). Continue on the first visit starts the music (retries on the next tap if the browser refuses). One info icon on the names step. The swap button flies the two pictures across.
- Guard rails (worker/guard.js, quiet by design): per-person limits on the public endpoints (in memory), and durable limits in D1 for new requests (6/hour on top of 3/day), notes (12/hour), walls passphrase tries (10 per wall per 10 min, 40 across walls), and review sign-in (6 per 15 min per person, 40/hour overall). Network addresses are only ever stored as a salted hash; set a secret `IP_SALT` in production (`npx wrangler secret put IP_SALT`). Writes must be JSON (415 otherwise). 429s carry Retry-After.
- Headers: CSP, frame denial, permissions policy, COOP/CORP, HSTS in public/_headers and on API replies. Static files are cached a day (assets) or revalidated (html/js/css).
- Search: dash front page is indexable (title, description, canonical, Open Graph, Twitter card, JSON-LD, sitemap). Walls and review site are noindex (meta + X-Robots-Tag) and robots.txt disallows them. Fonts are preloaded with font-display swap, one h1 per page. The canonical and sitemap URLs assume dash.purrpause.space; change them if the domain changes.
- Responsive: checked 320x568 up to 2560x1440 and phone landscape (no sideways overflow; very short screens scroll inside the page rather than clip).
- New tests: worker/guard-test.mjs. Run all: test, rooms-test, features-test, drafts-test, dash-test, guard-test, npm run test:unit.

## Final merge: limiter, fit, search

- Passphrase tries, review sign-in, new requests and notes now reserve their slot before the secret is checked (one atomic upsert), so parallel guesses all count. Limits: 10 tries per wall per person per 10 minutes, 40 per person across walls, 120 per wall per hour across everyone, review sign-in 6 per 15 minutes and 40 per hour. A correct passphrase hands its slot back.
- New walls store passphrases with PBKDF2-SHA256 (`k1:<iterations>:<hex>`, default 10000, set `DUET_KDF_ITER` to change, 0 turns it off). Older SHA-256 walls still open and are upgraded the next time they are opened. On the free Workers plan keep the cost low; raise it on a paid plan.
- `robots.txt` on the dash now only blocks `/api/` and `/dash/hold/`, so crawlers can load the dash styles and scripts. Unknown addresses fall back to the app shell, which is `noindex`.
- Dash layout: the intro card shrinks to the screen and scrolls inside itself as a last resort; steps and the waiting screen fit from 320x568 to desktop and in phone landscape (down to 568x320) with no page scroll. Checked in a headless browser at 10 sizes.
- Swap on the names step slides the two cards across each other. The info note opens under the buttons (or above the card) so it never covers Next. "I have read this, continue" always starts the music.
- Tests: `npm test` now also runs `guard-test.mjs` (parallel-guess, robots, headers, limits) and `hash-test.mjs` (hashing) runs with the unit tests.
- Production: set `IP_SALT` as a secret (`npx wrangler secret put IP_SALT`) and apply migrations `0005_drafts.sql` and `0005_request_note.sql`.

## Final polish round
- Intro card: titles per page (What this is / How to start / Please know), redundant inner headings removed, one bottom row (Back, dots, Next / Continue) with consistent sizes, title shrinks while the intro is open so the third page has room, page never scrolls (card scrolls inside only at 320px and phone landscape).
- "A note for the developer": concise line, neutral placeholder.
- Copy button on the final card copies the address and passphrase; copy-address when no passphrase is held.
- Custom thin scrollbars on all three sites.
- Root move: after admin move-home the root serves the dash in place (no redirect), and robots, sitemap and indexing treat it as public. Assets are fetched as /dash/ and /devsite/ so no redirect to /dash/ happens.
- Cat shifted right onto "ECT" (dash.css .wm img, style.css .brand-cat).
