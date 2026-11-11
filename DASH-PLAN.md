# The dash and the review site

Three sites share one Worker:

| Host | Purpose | Files |
|---|---|---|
| `purrpause.space` | the walls (and `/<address>` waiting page) | `public/` and `public/dash/hold/` |
| `dash.purrpause.space` | where a duet is requested and waited for | `public/dash/` |
| `dev.purrpause.space` | where requests are reviewed | `public/devsite/` |

`DUET_DASH_HOST` and `DUET_DEV_HOST` in `wrangler.jsonc` name the two subdomains. The dash host can only reach `/api/rooms`, `/api/slug`, `/api/request` and `/api/room`. The review API (`/api/admin/*`) answers on the dev host only. The walls host sends `/` to the dash once the original wall has its own address.

## Dash flow

1. **What this is.** The intro text, word for word. "I have read this, continue" remembers the choice and starts the music (off by default if it was turned off before).
2. **Names and animals.** Two notes side by side. Tap the portrait to swap cat and deer (the other person's animal swaps too, so they are never the same). Names: letters, numbers, spaces, 1 to 20, different from each other.
3. **Address.** Live availability check (debounced), suggestions built from the names, 1 to 24 letters, numbers or hyphens.
4. **Passphrase.** At least 3 characters, show/hide, and a generator that picks 5 words from a list of 128 (no modulo bias).
5. **Look over.** The two walls as they will look, with pencils to jump back to any step. The passphrase is never shown.
6. **Waiting.** The request hangs on a line behind the requests that came first.
   - In the queue: papers on the line show how many are ahead, with the number. Polls every 6 s (paused while the tab is hidden, backs off on errors).
   - Approved: the papers clear, a green stamp lands, petals fall, and Open / Copy invite appear.
   - Not approved: the note slumps and loses a pin, a red stamp lands.
   - Progress is saved, so a refresh returns to the same step or the same waiting scene.

The passphrase is held in memory only. After a refresh the waiting scene works, but Copy invite is gone.

## Waiting page at `/<address>`

The same scene, without names. Declined and unknown addresses both read "Nobody here yet" (a declined request is not revealed to visitors). When the wall goes live the page reloads into it.

## Review site

Sign in with the owner passphrase. Tabs: waiting (oldest first, numbered), live, declined. Approve or decline stamps the note and clears it. Live walls: open, delete (type the address to confirm, inline). The original wall can be moved to its own address (two-step confirm, inline). Refreshes every 15 s and shows the waiting count in the tab title.

## Look

All three sites share the walls' sky and meadow: the three cloud layers (`clouds.js`), three hill layers, the flowers, the same hour-by-hour sky colours (Kolkata time) and the same paper stock (`paper.js`, also used by the editor and the walls). The deer sits in the grass on the dash only.

## Local development

On `localhost`, `*.localhost` and `127.0.0.1` the host-name rules are relaxed, so the review API and `/` work without the real subdomains. Try `http://dash.localhost:8787/` and `http://dev.localhost:8787/`.

## Tape

One roll per note. Yellow: one strip across the top. Red: one strip, or one long piece over a top corner. Green and blue: an upright pair, one strip, or two slanted pieces.

## Not included

Page-curl corners, an email or push message to the person waiting, and a reason shown for a decline. The server already supports a notify webhook for new requests.

## Latest look notes
Note: step stones are clickable; waiting screen has an optional note (see DEVELOPMENT-LOG). Sound settings live in the gear dialog on the dash (same keys as the walls page). Cards use rounded borders and no cuts. Waiting colours follow `--ink`/`--muted`. Next planned: overhaul the review site into a real control panel.
