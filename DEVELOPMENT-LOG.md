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
