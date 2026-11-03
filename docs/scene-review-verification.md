# Scene review verification — 2026-11-02

Tested implementation: [`554a909add947305b03fd7733e956b7c532a1172`](https://github.com/sagarbpatel31/Scenevox/commit/554a909add947305b03fd7733e956b7c532a1172).

Story: render missing takes → assemble the local WAV → review that same audio inside the studio → pause, seek or jump to a line → download it. Long dialogue can be split without losing text before rendering.

## Environment and results

- macOS, Node 22.19.0, installed Chrome, Next.js 16.4.2 production server on port 3101.
- Lint passed without warnings; TypeScript and production build passed.
- 12 audio/schema/route unit tests passed.
- 25 production-browser tests passed in 30.1 seconds, including all 18 previous regressions.
- [Clean-machine GitHub CI run](https://github.com/sagarbpatel31/Scenevox/actions/runs/41571709801) **passed** on Ubuntu, Node 24 and Playwright Chromium without AssemblyAI secrets: lint, 12 tests, production build and 25 browser regressions.
- The production browser bundle was scanned: 10 JS/JSON assets checked, configured API key absent.
- Provider audio in this continuation was **simulated**. No paid generation tests were run and no new live latency measurement is claimed. The real AssemblyAI evidence in the older report remains dated 2026-10-17.

## Verified boundaries

| Boundary | Evidence |
| --- | --- |
| Render → review | The assembled WAV is loaded by a native audio element. A simulated four-line mix decodes to 4.90 seconds, matching its export. |
| Player → clock | Play advances the media clock; pause holds it; resume continues. Stop returns to zero. Keyboard seeking reaches the end; a line-3 jump reaches 2.60 seconds. |
| Clock → script | The active scene line and captions follow actual media time. Frame-count unit tests confirm no active segment in the 300 ms gaps or after the final sample. Provider word timings are relative to each clip, never estimated. |
| Player → playback ownership | Starting A/B, device preview, the Director or another render stops the mix. A stale callback cannot resume it or clear a newer device preview's active line. Rerendering replaces the old audio URL and reuses cached clips. |
| Intentional pause → late play promise | A deterministic test delays the play promise, pauses, then rejects it with `AbortError`. The intentional pause invalidates that request so no false playback-error message appears. |
| Edits → stale mix | Changing text or voice stops playback and disables the old mix's playback/export. Undoing the text edit makes the matching mix reviewable again. |
| Long text → split lines | Unicode, punctuation, whitespace, speaker and direction are preserved. Joining the resulting text chunks exactly reproduces the original. Each chunk fits the 500-code-point render limit. The full original stays in take history; one undo restores the unsplit scene. |
| Oversized word → recovery | A 501-character uninterrupted word is refused with an editable error, rather than cut or truncated. |
| Voice choice → persistence | A recorded default voice is saved into scene assignments. Reordering the catalog and reloading keeps that voice selected and reuses the recording. |
| UI → accessibility/layout | Labeled playback controls, keyboard-accessible slider, line-jump buttons, visible captions and a 390 px overflow check. A real browser screenshot of the review panel was inspected. |

The verification and React quality checklists guided resource cleanup, isolated playback-clock state, accessible controls, and explicit tests at each ownership boundary. Audio URLs and animation frames are cleaned up when replaced or unmounted; navigation explicitly stops scene playback.

## Reproduce

Start the production server at port 3101 after building, then:

```sh
npm run lint
npm test
SCENEVOX_TEST_URL=http://localhost:3101 npm run test:e2e -- --grep-invert @live
```

All ordinary provider requests are intercepted by regression fixtures; these tests do not validate current AssemblyAI availability or human-perceived speech quality. Opt-in live tests and the manual listening checklist are described in the README.

## Remaining boundaries

- Complete the [physical-microphone and listening checklist](./demo-checklist.md) before presentation-ready sign-off.
- Combined scene mixes are ephemeral previews/exports. After reload, Render scene reassembles matching saved clips; a new paid session is needed only for a missing or changed clip.
- Recordings remain local. No cloud storage, new AI provider, user accounts or public deployment were added.
- Hackathon eligibility, deadlines and submission state were not rechecked or changed in this build continuation.
