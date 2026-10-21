# Project Duet — hosted rooms proposal

Planning only. The existing two-person release is unchanged by this proposal.

## Product
One private, illustrated room for two people. A shared codebase renders each room's names, animal choices, palette and timezone from configuration. Each room is persistent; a browser session is only the temporary means of accessing it. No per-customer deployments or generated repositories.

## Single-page setup
A small live preview beside a paper setup card on desktop; stacked on mobile. Four compact groups: Names (You / Them), Animals (two illustrated selectors), Room (palette swatches and editable URL), Access (passcode). Detect timezone and show it beneath the preview clock, with a change control. One final button: Create room. Avoid relationship questions, bios, taglines and decorative copy. Default almost everything except the names and access choice. Start with the current animals; add small curated sets later.

After creation: enter the room immediately, with one invite action for the second person and a recovery key for the owner. The invite lets the other person claim their place. Creation is retry-safe, so a double tap or lost connection does not make duplicate rooms.

## Architecture
- One Cloudflare Worker + static vanilla frontend. Root path is setup; a path such as /arya-sam-k7m2 resolves a stored room. Reserve system paths. The domain example assumes the owner obtains project-duet.com; availability is not verified.
- D1 stores rooms, members, hashed access/recovery credentials, sessions, note metadata, streak state and plans. Every query, export and upload is scoped to a room and authorized membership. Use stable internal IDs; names are display data, not permissions.
- R2 stores versioned vector drawings and generated previews privately. Keep upload bounds, validation, immutable completed objects and cleanup of abandoned uploads. Shared animal art/music is served once as static assets, not copied into each room.
- A Durable Object per active room can coordinate hibernating WebSockets. Persist a completed note before notifying the other participant; reconnect with a sequence cursor. D1 remains the source of truth. Start with adaptive polling during a small beta if needed.
- Creation API validates, rate-limits and atomically allocates the room, two member slots, room timezone and a unique slug. Return an HttpOnly member session and a one-use invite. Slugs and short display URLs are not secrets. The public service needs stronger access/recovery than the current shared 229 phrase.
- Draft keys include room ID and member ID. Use the room's IANA timezone for streak boundaries, including daylight-saving changes. Add tests proving one room cannot access another room's notes, chunks, exports or sessions.
- Existing personal room remains on its present deployment/database while the hosted version is developed separately. Later migration needs a backup and explicit mapping, not an automatic overwrite.

## Rollout
1. Extract hardcoded names, assets and timezone into a versioned room configuration.
2. Implement room isolation, membership, invite/recovery and the one-page setup. Launch a small invite-only beta.
3. Add realtime delivery, quotas, deletion/export, backups, abuse controls and service monitoring before public signup.
4. Test paid room upgrades only after both participants return and exchange notes regularly.

Do not add collaborative live drawing, arbitrary SVG uploads, public feeds or large customization libraries to the first release. Improve pen pressure, palm rejection, undo, draft recovery and mobile editing first. Verify commercial redistribution rights for included music/art before a public service.

## Capacity and cost (official limits checked 2026-10-22)
Workers Free: 100,000 dynamic requests/day, 10 ms CPU/request. Static asset requests are free/unlimited. D1 Free: 5 million rows read/day, 100,000 written/day, 500 MB per database, 5 GB across the account. R2 Standard free allowance: 10 GB-month, 1 million Class A and 10 million Class B operations/month; egress is free. Durable Objects have separate request/duration/storage limits. Domains, transactional email and payment fees are additional. Free quota is not unlimited hosting; crossing D1 free limits causes operations to fail.

Current five-second polling costs 1,440 poll requests per hour for a room with both participants viewing, before clock refreshes and saves. Around 60 such room-hours/day approaches the Workers free request budget. This is a request-only estimate, not a measured capacity guarantee. Realtime/adaptive sync and object storage should precede broad growth. Start with 20–50 beta rooms and measure usage before raising limits. Workers Paid starts at a $5 monthly subscription, with usage charges beyond allowances.

Sources:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/durable-objects/platform/pricing/

## Audience, pricing and traction hypotheses
Start with long-distance couples and close friends who already send doodles, small notes or handmade gifts. The proposition is an intimate place for a shared ritual. It will fail as a business if only the creator enjoys setup and the invited person never returns.

Offer a useful free room with explicit storage limits. Test an annual room upgrade, paid once for both people, for extra storage, animal/theme packs and anniversary keepsake exports. Keep reading and basic export available if a subscription ends. Avoid ads, paid streak repair and lifetime unlimited storage. A possible experiment is ₹499 per room/year, not a validated market price.

Acquisition hypotheses: short videos demonstrating a real note exchange, handmade-art/journaling communities, small creator partnerships and gift occasions. The necessary partner invite helps activate a room but is not automatically a broad viral loop. Offer optional shareable blank room previews, never publish private notes by default. Begin with 20–50 pairs. Measure invite acceptance, first exchange involving both people, week-four pair retention, storage/support cost and actual purchases. Do not scale on signups alone.
