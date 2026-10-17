# Build notes

## 2026-10-15 — direction

- Verified the official Luma event: October 15–23, online, teams of 1–4, $2,000 across 20 winners.
- The event page does not publish a judging rubric, so the product strategy emphasizes immediate clarity, meaningful use of streaming TTS, memorable audio, and visible polish.
- Selected a browser-first creative tool over a generic voice agent.
- Working name: **SceneVox**.
- Chose a provider abstraction because the event endpoint is known but the standalone TTS message schema is not publicly documented yet.
- The first implementation will use browser speech only as a clearly labeled preview fallback.

## 2026-10-15 — prototype and verification

- Created the Next.js studio prototype with editable dialogue, casting, direction controls, scene playback, and responsive styling.
- Verified a production build and lint pass.
- Verified the root page returns HTTP 200 and contains the key studio content.
- Verified `/api/health` returns the event endpoint and reports `browser-preview` without an API key.
- Verified production dependencies have zero reported vulnerabilities.
- Confirmed the official endpoint accepts a WebSocket upgrade and then rejects an unauthenticated client with: `Unauthorized: missing Authorization header or token query param`.
- Confirmed AssemblyAI’s public TTS product page still labels the standalone API “coming soon”; the message schema remains an official early-access dependency.
- Browser automation was blocked by an admin policy check, so visual layout and audio interaction still need one manual browser pass.

## 2026-10-17 — judge-ready demo milestone

- Published the initial prototype to `github.com/sagarbpatel31/Scenevox` on the `main` branch.
- Added a typed provider contract and moved browser speech behind the provider boundary.
- Added live engine readiness from `/api/health`; the UI distinguishes local preview, key readiness, and the still-pending official event protocol.
- Added a three-step, 60-second judge tour that ends with a directed full-scene performance.
- Made the share control functional by copying the current scene URL.
- Kept the AssemblyAI key server-only and did not invent an unpublished WebSocket message schema.

## 2026-10-17 — live AssemblyAI director

- Validated the participant's AssemblyAI API key by minting a short-lived token without displaying either secret.
- Moved the local secret from an unignored `.env` file to the gitignored `.env.local` convention.
- Added a same-origin server route that mints single-use Voice Agent tokens and caps sessions at five minutes.
- Added cross-browser microphone resampling, echo cancellation, live transcripts, streamed PCM playback, barge-in cleanup, and explicit `session.end` teardown.
- Added the `revise_selected_line` client tool so the spoken director can update the selected dialogue and performance direction in the studio.
- Used inline session configuration because the dashboard Agent is still rate-limited and the Voice Agent API supports one-off dynamic agents without an `agent_id`.
