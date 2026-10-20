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
