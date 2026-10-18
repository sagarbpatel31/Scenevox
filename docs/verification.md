# SceneVox verification

## Tested revision and environment

- Tested commit: [`51730ead6469c2d9006c3a52c524d525f43a9fd5`](https://github.com/sagarbpatel31/Scenevox/commit/51730ead6469c2d9006c3a52c524d525f43a9fd5). Later documentation-only commits do not change the tested app.
- Local date: 2026-10-17 PDT (2026-10-18 UTC).
- macOS, Node 22.19.0, Chrome 155.0.8059.80, Next.js 16.4.2 production build at `http://localhost:3101`.
- Live tests used the participant's server-only AssemblyAI key. Ordinary regression tests substituted deterministic provider events and did not use paid APIs.
- [GitHub clean-machine CI run](https://github.com/sagarbpatel31/Scenevox/actions/runs/39104174426): **passed** on Ubuntu / Node 24 / Playwright Chromium, without AssemblyAI secrets. Lint, 10 tests, production build and 18 browser regressions succeeded.

## Results

| Check | Result |
| --- | --- |
| Lint, TypeScript, production build | Passed |
| Audio, schema and server-route tests | 10 passed |
| Production browser regressions | 18 passed in 36.6 seconds |
| Real AssemblyAI rendering, recording, replay and exports | Passed; 40.2-second test runtime |
| Real synthetic-microphone Director flow | Passed; 18.5-second test runtime |
| Real typed Director / selection context flow | Passed; 8.4-second test runtime |
| Browser asset secret scan | 10 JS/JSON assets checked; configured key absent |
| Physical microphone and human listening | **Pending — not presentation-ready until completed** |

Test runtimes are not response-latency measurements. The measured per-take values below are separate.

## Full product story and evidence

A writer hears an exact original → requests a rewrite → generates the revision → compares recordings → chooses a take → downloads a scene WAV.

| Boundary | Evidence |
| --- | --- |
| Browser → token route | Purpose validated; render cap 60 seconds; Director cap remains 300. Unknown purposes and cross-origin requests rejected in route tests. Raw key stays server-side. |
| Exact script → AssemblyAI | Three real greetings preserved names, punctuation, numbers and Unicode byte-for-byte in returned transcripts. Rendering never opens a microphone or sends input audio. |
| Provider → recording | Real PCM16 chunks, nonzero samples, final transcripts and word timestamps captured. Six generated clips ended with `session.ended`; one existing clip was reused during four-line scene assembly. |
| Recording → local storage | IndexedDB blobs survive reload; scene schema v2 stores metadata separately. Browser regression seeds an actual v1-only draft before startup and verifies migration plus retained v1 backup. |
| Audio → comparison | A/B switches the single playback owner; replay, real sample peaks, playback-clock word highlighting and recorded-take restore exercised. Missing timestamps produce active-line highlighting, not invented timings. |
| Scene → WAV | Individual and full-scene WAV downloads verified. Mono, 24,000 Hz, PCM16 headers; decoded samples nonempty. Real export length equals selected clip durations plus three 300 ms gaps. Simulated four-line export is exactly 4.90 seconds. |
| Edits → cache validity | Exact text/voice fingerprint controls reuse. Changing text or voice marks earlier audio as different; changed scenes disable the previous scene download until rerendered. |
| Failure → recovery | Cancellation, duplicate clicks, connection loss, provider errors, 60-second timeout, absent timings, quota failure and missing audio after reload tested. No partial recording is accepted. |
| Storage → budget | A seeded 50 MB database rejects a new recording without deleting the existing asset. New unsaved WAV remains downloadable. Explicit deletion preserves text takes. |
| Scene → portability | JSON and share links carry text, never audio blobs or local asset references. Missing local audio offers regeneration. |
| Microphone → Director | Synthetic speech passes through the real AudioWorklet and AssemblyAI transcription. A tool revises line 3 to “We still have tomorrow.” Typed requests revise two different lines in one session; selection context stays correct. Both flows assert `session.ended`. |

All nine previous browser workflows remain covered: edit/reload/undo/redo, import/cast/takes, Unicode sharing, portable export, invalid import/share recovery, mobile layout, microphone denial, cancellation during permission setup, and device-playback cancellation races. Browser suites assert no uncaught exceptions. Resampling is checked at 24, 44.1 and 48 kHz.

Production testing found a rapid-refresh race inside the 300 ms autosave debounce. The app now flushes the latest document on `pagehide`; missing-audio recovery and immediate refresh pass on the production build.

## Observed live recording measurements

These are three samples, not service guarantees or a statistical benchmark. First audio includes the temporary-token request and WebSocket startup. Provider session length comes from `session.ended`; request total also includes client/network overhead. [Machine-readable measurements](./recording-measurements.json).

| Exact greeting | Voice | First audio | Clip | Provider session | Request total |
| --- | --- | ---: | ---: | ---: | ---: |
| Mara, meet Zoë at 9:42. Café déjà vu? | alba | 1.738 s | 4.280 s | 6.045 s | 6.986 s |
| Orion—keep all 42 seedlings safe! | george | 2.106 s | 3.120 s | 4.345 s | 5.482 s |
| Don’t leave, Élodie. We have tomorrow. | alba | 2.192 s | 3.650 s | 4.627 s | 6.011 s |

## Reproduce and remaining boundaries

Run commands and synthetic microphone-fixture generation are in the [README](../README.md). Live tests are opt-in and billed. CI runs lint, unit/route tests, build, and simulated browser regressions without an API key. Test attachments include live recording metadata; no credentials are logged.

AssemblyAI's live voice-list URL returned HTTP 426 during verification. The server route attempts the live catalog, then explicitly labels a fallback using [AssemblyAI's official voice roster](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/voices); Retry remains available. Alba and George were verified live, not every listed voice. Exact reads use the documented [greeting-to-TTS path](https://www.assemblyai.com/docs/voice-agents/voice-agent-api/greeting); direction notes are not an emotional-delivery control.

Complete the [physical-microphone and listening checklist](./demo-checklist.md) before calling the demo presentation-ready. Automation confirms data and playback paths, not human-perceived acting, pronunciation or acoustic quality. No public deployment, new provider, accounts or hosted recordings were added. Public token admission/rate limits remain a separate deployment decision.
