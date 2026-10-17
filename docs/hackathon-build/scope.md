# SceneVox — hackathon scope

## One-line pitch

SceneVox turns a written scene into a directed, streaming voice performance so creators can hear whether dialogue works before they record it.

## Why this can win

The product makes streaming text-to-speech the visible, audible center of the experience. A judge can paste a script, cast voices, direct a line, and hear the result in under a minute. The demo is emotional and instantly legible, while still showing latency, synchronization, and product craft.

## Primary user

Indie game writers, audio-fiction creators, screenwriters, and small creative teams who need to audition dialogue quickly without booking actors for every draft.

## Golden path

1. Open a ready-made cinematic scene.
2. See the script automatically separated by character.
3. Cast a voice for each role.
4. Add lightweight direction such as “quiet urgency” or “barely holding back.”
5. Stream the scene and follow the active line in real time.
6. Change one line or its direction and replay only that beat.
7. Share or export the final read.

## Hackathon MVP

- Polished responsive studio interface
- Two-character sample scene that works immediately
- Editable dialogue and per-line performance direction
- Character-to-voice assignment
- Stream/play/stop controls with visible progress
- Active-line highlighting and lightweight waveform feedback
- Browser speech preview when AssemblyAI credentials are unavailable
- Provider boundary for the official `wss://streaming-tts.assemblyai.com/v1/ws` integration
- Honest engine indicator so the fallback is never presented as AssemblyAI output

## Stretch goals

- Word-synchronized highlighting from TTS timestamps
- Multi-take A/B comparison
- Pronunciation dictionary for names and invented terms
- Automatic speaker parsing from pasted scripts
- Shareable scene links and WAV export
- A 60-second judge-mode demo that resets to a known scene

## Explicit non-goals for the first pass

- Full screenplay file import
- Collaborative editing
- Accounts, payments, or project libraries
- Voice cloning
- A general-purpose voice chatbot

## Success measures

- A first-time judge hears the first line within 15 seconds.
- Editing and replaying one line takes no more than two interactions.
- The interface always makes the selected character, voice, and active line obvious.
- The real AssemblyAI stream can replace the preview provider without redesigning the UI.
