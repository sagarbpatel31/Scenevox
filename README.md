# SceneVox

SceneVox is a streaming voice performance studio for writers, game teams, and audio-fiction creators. Paste a scene, cast its characters, add performance direction, and hear the dialogue while the draft is still changing.

Built for AssemblyAI’s **Voice hackathon week: Hack into speech**.

## Current prototype

- Editable two-character cinematic scene
- Per-character voice assignment
- Per-line direction and instant replay
- Full-scene playback with active-line and waveform feedback
- Responsive studio interface
- Clearly labeled browser-speech preview when AssemblyAI credentials are absent
- Server-only environment boundary for the event TTS endpoint

The official standalone TTS API is early access. Its public product page still says “coming soon,” so this repository does not guess its WebSocket message schema. The real adapter should be added from the event’s official quickstart as soon as it is available.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment

Copy `.env.example` to `.env.local` and add the API key there when the early-access schema is available:

```dotenv
ASSEMBLYAI_API_KEY=
ASSEMBLYAI_TTS_WS_URL=wss://streaming-tts.assemblyai.com/v1/ws
```

`ASSEMBLYAI_API_KEY` is server-only. Never rename it with a `NEXT_PUBLIC_` prefix or send it to browser code.

## Quality checks

```bash
npm run lint
npm run build
npm audit --omit=dev
```

Product scope and build decisions live in [`docs/hackathon-build`](./docs/hackathon-build/).
