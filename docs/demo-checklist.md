# SceneVox demo acceptance

Automated tests do not replace these human checks. Do not call the demo presentation-ready until the physical-microphone and listening checks are complete.

## Human listening and physical microphone — pending

1. Open the local production app, ideally in Chrome, and use headphones.
2. Choose Alba for Mara and George for Orion. Generate line 3, then play A. Confirm intelligibility, natural pronunciation, and no clipped beginning or ending.
3. Click Talk to Director and speak a short revision request into the physical microphone. Confirm the request transcript and correct selected-line revision. Interrupt the Director once and check that old speech stops.
4. Generate the revised line. Switch A/B repeatedly: only one clip should play. Confirm both original and revised words are correct and the character voices sound distinct.
5. Use the preferred recorded take. Render scene, download the WAV, and play it in a separate audio application. Listen for all lines in order, 300 ms gaps, and no clipping or clicks at joins.
6. Refresh the app. Replay a saved recording. Delete one audio asset, confirm its text remains, then regenerate it.
7. Export a scene JSON or share link into a fresh browser profile. Confirm text imports and audio regeneration is offered; recordings are not hosted or transferred.

Record the browser, output device, microphone, date, observations, and any failures here before marking this checklist complete.

## Judge path

Select line 3 → Record & compare → Generate original → Play A → ask Director for a shorter line → Generate revision → Play B → Use recorded take → Render scene → Download scene WAV.

Say what is measured: the app shows observed time to first audio, clip length, and provider session duration when available. These are measurements from that take, not latency guarantees. Direction is a note, not an expressive TTS control.

## Before a public deployment (outside this milestone)

- Complete human audio acceptance above.
- Decide admission/rate limits and a credit budget before exposing token minting publicly.
- Check hackathon submission requirements and current provider availability.
- Keep the API key server-only; never include it in screenshots or a submission video.
- Keep downloaded WAV backups: browser storage is local, quota-limited, and can be cleared.
