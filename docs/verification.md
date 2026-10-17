# SceneVox verification

Verified locally on 2026-10-17 using installed Chrome and the participant's server-only AssemblyAI key.

## Live product story

A writer opens a scene, selects a line, speaks or types direction, hears AssemblyAI's response, sees a revision applied to the correct line, and can compare/restore takes before saving or sharing the scene.

| Boundary | Evidence |
| --- | --- |
| Browser → token route | Browser obtained a single-use token from `POST /api/voice-agent/token`; key stayed server-side. |
| Microphone → AssemblyAI | Chrome captured prerecorded synthetic speech through the same AudioWorklet used by a physical microphone. Received `input.speech.started`, partial/final user transcripts, and speech-stopped events. |
| Agent → audio | Received `reply.audio`, agent transcript deltas, and final transcript through the live AssemblyAI WebSocket. |
| Agent → scene | A real `tool.call` changed line 3 to “We still have tomorrow.” The browser asserted the new dialogue and its saved take. |
| Selection → context | In one text-driven session, Mara's line changed to “Stay with me.” and Orion's to “The sun is ours.” Selecting Mara again preserved her revision. |
| Session → billing teardown | Both live tests sent `session.end` and asserted receipt of `session.ended`. |

The spoken test completed in 17.4 seconds; the typed-context test completed in 7.3 seconds. These are test runtimes, not end-to-end response latency claims. Both tests use real API calls, not mocked transcripts or tool results.

## Regression coverage

Results: 9 browser workflow tests, 2 real AssemblyAI tests, and 3 audio resampling tests passed. The final production build and lint check passed. Production dependency audit reported zero vulnerabilities. The separate development-tool audit reported an existing advisory chain through ESLint's `braces` dependency; no forced framework downgrade was applied.

- Edits and scene titles survive reload; undo/redo restores the document.
- Script import detects characters and parenthetical directions.
- Saved takes can be restored.
- Shared snapshots open with edited Unicode dialogue in a fresh browser context.
- Portable scene export downloads correctly; malformed JSON import leaves the current scene intact.
- A 390 px viewport has no horizontal overflow and exposes scene tools and the Director.
- Denied microphone permission displays a recoverable error without requesting a paid token.
- Ending during microphone setup prevents a late token request or voice session.
- Stopping full-scene playback and previewing a selected line cannot resume the abandoned scene loop.
- A malformed snapshot URL restores the saved draft rather than overwriting it.
- Browser tests assert no uncaught page exceptions.
- Resampling tests preserve one second of audio at 24, 44.1, and 48 kHz inputs, within two samples, and emit 100 ms PCM batches.

Run commands and fixture generation are documented in the README. Production build and lint checks are also required before push.

The production browser assets were scanned against the locally configured key: 10 JavaScript/JSON assets checked, no key found. The secret file remains ignored by Git.

## Practical limits

- Automated audio testing proves capture, transcription, returned audio data, tool application, and teardown. Human listening quality and physical microphone/acoustic behavior still benefit from a short manual pass.
- Full-scene/take rehearsal uses device speech synthesis; the live Director uses AssemblyAI speech. Natural-language acting direction is saved in the script; device speech applies only basic rate/pitch adjustments.
- Scenes save in the current browser. Snapshot links carry scene text and cast; they do not sync subsequent changes or provide access control.
- The token route has a five-minute session cap and a browser-origin check. A public deployment still needs an admission/rate-limit decision before exposing unlimited token minting to visitors.
