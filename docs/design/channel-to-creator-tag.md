# Design note: crediting a creator's Associates tag from their channel

Status: **draft for discussion. Nothing here is built yet.** Owner: Naor. Date: 2026-09-29.

## Problem
Today the Amazon tag on a link comes from the **viewer's** own settings (`chrome.storage.local.affiliateTag`, or their signed-in account). If there is none, it falls back to `streamsnap03-20`, and invalid tags also fall back to it (`normalizeTag` in `extension/services/amazon_service.js`). Nothing maps the stream a viewer is watching to that streamer's tag. The landing page used to claim otherwise; that copy was removed in this PR.

Relevant code that already exists:
- D1 `users.affiliate_tag`, `users.is_streamer` and `users.stream_channels` (a JSON field of `{youtube, twitch, kick, tiktok}` handles, migration 0002).
- `account.html` saves the creator's channel handles to KV (`creator:channels:<userId>`), not to D1 `stream_channels`. **The two stores don't match.**
- `GET /creator/gear/public?channel=` looks a streamer up with `stream_channels LIKE %channel%` **or** `affiliate_tag = channel`. This is an **unverified substring match**: anyone can type someone else's handle. No client calls the endpoint today.

## Where the mapping lives
- **Source of truth: D1**, in a new table, `creator_channels(platform, channel_id, user_id, affiliate_tag_snapshot, verified_at, verification_method, status, created_at, updated_at)`.
- Primary key: `(platform, channel_id)`. Use the **stable platform ID**, not the display handle. Handles can be renamed and reused, and a handle may only be stored as a display hint.
- **Read path: KV** (`ctag:<platform>:<channel_id>` → `{tag, userId, v}`). Write it when verification succeeds and delete it when the claim is revoked. The extension only calls a cached `GET /creator/tag?platform=&channel_id=`.
- Stop using the `LIKE` lookup for anything that affects attribution.

## Registration and proof of ownership (a verified claim is required before any tag is used)
| Platform | Preferred proof | Fallback |
|---|---|---|
| YouTube | Google OAuth with the `youtube.readonly` scope → `channels.list?mine=true` returns the channel ID | Code in the channel description |
| Twitch | Twitch OAuth → `GET /helix/users` returns the user ID | Code in the channel panel or bio |
| Kick | OAuth *(availability needs verification)* | Code in the bio |
| TikTok | Login Kit *(scope and approval need verification)* | Code in the bio |
| Facebook | Page access via Facebook Login *(app review needs verification)* | Code in the Page "About" section |

- **Verification code flow:** the worker issues a short random code with a limited lifetime. The creator pastes it into their bio. The worker fetches the public profile, finds the code and marks the claim verified. The creator can remove the code afterwards.
- **Re-check:** periodically re-verify OAuth-based claims, and re-verify when the tag changes. Tag changes should be rate-limited.

## How the extension resolves the channel ID (all of this needs a spike; the DOM and APIs change often)
- **YouTube:** the `ytInitialPlayerResponse.videoDetails.channelId` field or the page's channel link (`/channel/UC…`). Also handle `@handle` URLs.
- **Twitch:** the login name from the URL path, turned into a user ID by the worker (Helix) and cached.
- **Kick:** the slug from the URL path, turned into an ID by the worker if possible.
- **TikTok:** the `@username` from a live or video URL, which is only a handle. Treat it as lower confidence.
- **Facebook:** the Page ID from page metadata. This is the hardest one; it might not be supported at first.
- The content script sends `{platform, channelId}` to the background script, which asks the worker. Nothing else about the page is sent.

## Tag priority (**product decision, needs Naor**)
- Option A: verified creator tag > viewer's own tag > `streamsnap03-20`.
- Option B: viewer's own tag > verified creator tag > default. A viewer who is an Associate buying for themselves keeps their own tag.
- Option C: a revenue split. A single Amazon link can only carry one tag, so any split has to be settled off-platform (payouts), which is a much bigger scope.
- Whichever option is chosen: never use an unverified claim, always pass the tag through `normalizeTag`, and **show the viewer which tag a link uses** (e.g. "Supports @creator").

## Amazon Associates policy concerns (all marked as needing verification against the current Operating Agreement; this note does not quote policy)
- Whether a third-party tool may insert **another Associate's** tag into links shown to users who aren't on that Associate's own site or channel.
- Disclosure rules: the creator may need to disclose on their stream, and StreamSnap already shows its own disclosure.
- Whether the creator's account has to list StreamSnap or their channel as an approved site or app.
- Rules on cookies or attribution when a link is opened from a browser extension.
- Rules on changing or overriding a user's own tag (relevant to Option A).
- **Get legal or Associates support confirmation before shipping.**

## Privacy
- The worker only sees `(platform, channelId)`. It should not log it together with the viewer's identity, and should aggregate it where possible.
- Creator OAuth tokens: store only what verification needs, prefer checking once and then dropping the token, and encrypt anything that is kept.
- Update `privacy.html` and the Chrome Web Store data disclosure before launch.

## Abuse
- **Fake claims:** handled by requiring OAuth or a verification code, keying on the stable ID and keeping claims unique per `(platform, channel_id)`.
- **Disputes:** an admin tool to revoke claims, an audit log, and support for transferring a claim when a channel changes hands.
- **Tag hijacking** (someone takes over an account and changes the tag): notify the creator by email when the tag changes, and add a short delay before a new tag takes effect.
- **Scraping or enumerating** the lookup endpoint: rate-limit it and return only the tag.

## Caching
- The KV entry for a verified channel lasts about 24 hours and is deleted when the claim or tag changes. A lookup that finds nothing is cached for about 1 hour so the worker isn't hit on every scan.
- The extension keeps an in-memory cache per tab/channel for the session, and only looks up when the user clicks a link, not on every frame.

## Open decisions for Naor
1. Tag priority A, B or C.
2. Which platforms go first (suggest YouTube and Twitch via OAuth).
3. Whether to require OAuth, or also accept verification codes.
4. Whether the Associates policy review can happen before any build.
5. Whether to merge the KV channel store and D1 `stream_channels` into the new table and retire the `LIKE` lookup.
6. What UI tells viewers whose tag a link uses.
