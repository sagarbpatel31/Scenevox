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
- Guided 60-second judge tour through the live Director and take workflow
- Live **Talk to Director** mode powered by the AssemblyAI Voice Agent API
- Microphone streaming, typed direction, real-time transcripts, spoken responses, and barge-in handling
- Voice-agent tool calling that rewrites the selected scene line in place
- Clearly labeled device-voice script rehearsal, independent of the live Director
- Live provider readiness from the server health route
- Typed TTS provider contract so the event stream can replace preview speech without a UI rewrite

The interactive Director uses AssemblyAI’s documented Voice Agent API. Script playback still uses a clearly labeled browser-speech preview while the standalone TTS endpoint remains an early-access integration.

## Demo path

1. Select line 3 of **The Last Garden**.
2. Click **Talk to Director** and say: “Shorten this line, with fear beneath the smile.” You can also type a note without granting microphone access.
3. Hear the AssemblyAI Director respond and watch the dialogue change in place.
4. Select **Takes** to audition or restore an earlier version.
5. Import your own script, share a snapshot, or export the screenplay and portable scene file.

**60s judge tour** introduces this flow in the app. Director context follows line selection during a live session.

Script import accepts `NAME: (direction) Dialogue` or uppercase screenplay character cues. Export `.txt` for a clean screenplay; export `.json` to retain cast, voices, and takes.

Autosave uses versioned local browser storage. Share links contain scene text in the URL fragment; recipients can edit their copy. These are snapshots, not collaborative or private cloud documents.

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

The browser requests a single-use temporary token from `/api/voice-agent/token`. Live Director sessions are capped at five minutes and send `session.end` during normal teardown to avoid unnecessary billable time.

## Quality checks

```bash
npm run lint
npm run build
npm test
npm run test:e2e
npm audit --omit=dev
```

Start the app on port 3100 before running browser tests (`npm run dev -- -p 3100`). The suite uses installed Chrome; override `SCENEVOX_CHROME_PATH` or `SCENEVOX_TEST_URL` if needed. Normal tests do not consume AssemblyAI credits.

Real API tests are opt-in. On macOS, run `node tests/prepare-voice-fixture.mjs` to generate synthetic speech, then use the returned path:

```bash
SCENEVOX_TEST_AUDIO=/absolute/path/returned-by-script.wav npm run test:live
```

These tests use brief billed sessions to verify microphone capture → AssemblyAI transcription → tool call → visible revision → streamed reply audio → clean teardown. A second test verifies typed requests and context changes. No human microphone recording is used.

See [the verification report](./docs/verification.md) for evidence and current limitations.

Product scope and build decisions live in [`docs/hackathon-build`](./docs/hackathon-build/).
