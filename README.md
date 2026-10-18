# SceneVox

SceneVox is a streaming voice performance studio for writers, game teams, and audio-fiction creators. Paste a scene, cast its characters, add performance direction, and hear the dialogue while the draft is still changing.

Built for AssemblyAI’s **Voice hackathon week: Hack into speech**.

## Current prototype

- Editable sample scene and screenplay import with automatic character detection (up to 12 roles / 100 lines)
- Autosave on this device, with undo and redo
- Portable scene files and share links containing the current cast and dialogue
- Per-line take history, audition, and restore
- Per-character voice assignment
- Per-line direction and instant replay
- Full-scene playback with active-line and waveform feedback
- Responsive studio interface
- Guided judge tour: hear the original → revise → A/B → download
- Real AssemblyAI exact-script recordings with separate character voice selectors
- Replay, measured waveform, provider word timings, and A/B switching without overlapping clips
- Per-take and full-scene mono 24 kHz / 16-bit PCM WAV export, with 300 ms gaps between lines
- Sequential scene rendering, cached by exact text and voice, with cancellation and recoverable errors
- IndexedDB recording storage (50 MB cap), explicit deletion, and immediate download if saving fails
- Live **Talk to Director** mode powered by the AssemblyAI Voice Agent API
- Microphone streaming, typed direction, real-time transcripts, spoken responses, and barge-in handling
- Voice-agent tool calling that rewrites the selected scene line in place
- Clearly labeled device-voice script rehearsal, independent of the live Director
- Live provider readiness from the server health route
- Typed TTS provider contract so the event stream can replace preview speech without a UI rewrite

The Director and recorded performances use AssemblyAI’s documented Voice Agent API. Recordings pass the **exact script as the greeting**, which goes directly to TTS without an LLM rewrite. Render sessions never request a microphone. Direction remains a creative note in this mode; it does not control emotional delivery. Device speech remains a separate, unsaved preview. No new AI provider or hosted audio storage is used.

## Demo path

1. Select line 3 of **The Last Garden**.
2. Choose AssemblyAI voices in **Cast**, then **Generate take** in **Recorded performances**. Play A to hear the original.
3. Ask the Director to shorten the line. Speak or type: “Shorten this line, with fear beneath the smile.” Watch the revision apply.
4. Generate the revision. Switch **Play A / Play B**, replay, and **Use recorded take** to select the wording and voice you prefer.
5. **Render scene** generates only missing clips. **Download scene WAV** exports the chosen lines with 300 ms gaps. Download individual WAVs as well.

**60s judge tour** introduces this flow in the app. Director context follows line selection during a live session.

Script import accepts `NAME: (direction) Dialogue` or uppercase screenplay character cues. Keep each rendered line at 1–500 characters; longer lines stay editable and must be split before rendering. Each render session is capped at 60 seconds, one at a time; the Director pauses during rendering.

Export `.txt` for a screenplay or `.json` for text, cast, voice choices, and text takes. JSON and share URLs never contain audio blobs or device asset references. After import or storage loss, regenerate recordings. Browser storage can be cleared by the browser; WAV downloads are your durable backup. Deleting audio preserves text takes and does not silently evict other recordings.

Autosave uses scene schema v2 and migrates v1 drafts, retaining the old local-storage key as a backup. Audio blobs live separately in IndexedDB. Share links contain scene text in the URL fragment; recipients edit their own copy. These are snapshots, not collaborative or private cloud documents.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local` and add the API key for local development:

```dotenv
ASSEMBLYAI_API_KEY=
ASSEMBLYAI_TTS_WS_URL=wss://streaming-tts.assemblyai.com/v1/ws
```

`ASSEMBLYAI_API_KEY` is server-only. Never rename it with a `NEXT_PUBLIC_` prefix or send it to browser code.

The browser requests a single-use temporary token from `/api/voice-agent/token`: `purpose: "render"` caps sessions at 60 seconds, while `purpose: "director"` (or a legacy empty request) retains the five-minute Director cap. Rendering sends `session.end` after `reply.done` and requires `session.ended` before accepting a recording.

`GET /api/voice-agent/voices` requests the live AssemblyAI catalog. If the upstream catalog fails (it returned HTTP 426 during this milestone), the UI explicitly labels the fallback roster from [AssemblyAI’s official voice documentation](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/voices) and offers Retry. Alba and George have been tested with real renders; other documented voices are not individually verified.

## Quality checks

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm audit --omit=dev
```

Start the app on port 3100 before running browser tests (`npm run dev -- -p 3100`). On macOS the suite uses installed Chrome; on Linux it uses Playwright Chromium (`npx playwright install --with-deps chromium`). Override `SCENEVOX_CHROME_PATH` or `SCENEVOX_TEST_URL` if needed. CI starts the production build automatically. The GitHub Actions workflow runs lint, audio/route tests, a production build, and browser regressions without API secrets. Simulated provider tests verify protocol handling and UI behavior, not speech quality or real provider latency.

Real API tests are opt-in. On macOS, run `node tests/prepare-voice-fixture.mjs` to generate synthetic speech, then use the returned path:

```bash
SCENEVOX_TEST_AUDIO=/absolute/path/returned-by-script.wav npm run test:live
```

These opt-in tests use billed sessions to verify the Director and actual rendering/recording/replay/WAV export, including Unicode, exact transcripts, distinct voices, caching and clean teardown. Live measurements are attached to the test results. The microphone test uses synthesized speech, not a human microphone recording. Run only recording tests with `SCENEVOX_LIVE_TESTS=1 npx playwright test tests/e2e/recordings-live.spec.ts`.

Before calling the demo presentation-ready, perform the physical-microphone and human-listening checklist in [the verification report](./docs/verification.md). No public deployment is part of this milestone.

See [the verification report](./docs/verification.md) for evidence and current limitations.

Product scope and build decisions live in [`docs/hackathon-build`](./docs/hackathon-build/).
