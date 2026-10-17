# SceneVox

SceneVox is a streaming voice performance studio for writers, game teams, and audio-fiction creators. Paste a scene, cast its characters, add performance direction, and hear the dialogue while the draft is still changing.

Built for AssemblyAI’s **Voice hackathon week: Hack into speech**.

## Current prototype

- Editable two-character cinematic scene
- Per-character voice assignment
- Per-line direction and instant replay
- Full-scene playback with active-line and waveform feedback
- Responsive studio interface
- Guided 60-second judge tour with a scripted wow moment
- Live **Talk to Director** mode powered by the AssemblyAI Voice Agent API
- Microphone streaming, real-time transcripts, spoken responses, and barge-in handling
- Voice-agent tool calling that rewrites the selected scene line in place
- Clearly labeled browser-speech preview when AssemblyAI credentials are absent
- Live provider readiness from the server health route
- Typed TTS provider contract so the event stream can replace preview speech without a UI rewrite

The interactive Director uses AssemblyAI’s documented Voice Agent API. Script playback still uses a clearly labeled browser-speech preview while the standalone TTS endpoint remains an early-access integration.

## Demo path

Select **60s judge tour** in the top bar. The tour walks through the ready-made script, contrasting character voices, and the emotional direction change before streaming the judge cut.

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
npm audit --omit=dev
```

Product scope and build decisions live in [`docs/hackathon-build`](./docs/hackathon-build/).
