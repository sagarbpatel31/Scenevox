import type { AudioAsset, WordTiming } from "./types";
import { encodeWav, joinPcm, SAMPLE_RATE, textFingerprint } from "./wav";

export type RenderRequest = {
  text: string;
  voice: string;
  signal: AbortSignal;
  onProgress?: (message: string) => void;
};
export async function renderTake({
  text,
  voice,
  signal,
  onProgress,
}: RenderRequest): Promise<AudioAsset> {
  if (!text.trim() || Array.from(text).length > 500)
    throw new Error(
      "Exact-read takes need 1–500 characters. Split longer dialogue into lines.",
    );
  if (!voice || voice.length > 120)
    throw new Error("Choose an AssemblyAI voice first.");
  signal.throwIfAborted();
  const fingerprint = await textFingerprint(text, voice);
  signal.throwIfAborted();
  const started = performance.now();
  const controller = new AbortController();
  const abortFetch = () => controller.abort();
  signal.addEventListener("abort", abortFetch, { once: true });
  const fetchTimeout = setTimeout(abortFetch, 15_000);
  let token: string;
  try {
    onProgress?.("Opening a microphone-free render session…");
    const response = await fetch("/api/voice-agent/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purpose: "render" }),
      signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok || typeof body.token !== "string")
      throw new Error(
        body.error || "Could not open a render session. Try again.",
      );
    token = body.token;
  } catch (error) {
    if (signal.aborted)
      throw new DOMException("Render cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error("Opening the render session timed out. Try again.");
    throw error;
  } finally {
    clearTimeout(fetchTimeout);
    signal.removeEventListener("abort", abortFetch);
  }
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token)}`,
    );
    const chunks: Int16Array[] = [],
      timings: WordTiming[] = [];
    let firstAudioMs = -1,
      transcript = "",
      sessionId = "",
      completed = false,
      settled = false,
      endSent = false;
    let failure: Error | null = null,
      providerSessionMs: number | undefined;
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    const clean = () => {
      clearTimeout(timeout);
      clearTimeout(endTimer);
      signal.removeEventListener("abort", cancel);
      window.removeEventListener("pagehide", cancel);
      ws.close();
    };
    const finish = (cleanEnd: boolean) => {
      if (settled) return;
      settled = true;
      clean();
      if (failure) return reject(failure);
      if (!completed || !chunks.length || !transcript)
        return reject(
          new Error(
            "AssemblyAI returned an incomplete recording. Please regenerate.",
          ),
        );
      if (transcript.normalize("NFC").trim() !== text.normalize("NFC").trim())
        return reject(
          new Error(
            "The provider transcript did not match the exact script. Please regenerate this take.",
          ),
        );
      if (!cleanEnd)
        return reject(
          new Error(
            "The render session did not close cleanly. Please regenerate.",
          ),
        );
      const pcm = joinPcm(chunks, 0);
      if (!pcm.some((sample) => sample !== 0))
        return reject(
          new Error("AssemblyAI returned silent audio. Please regenerate."),
        );
      resolve({
        id: fingerprint,
        wav: encodeWav(pcm),
        metadata: {
          assetId: fingerprint,
          fingerprint,
          voice,
          transcript,
          timings,
          duration: pcm.length / SAMPLE_RATE,
          firstAudioMs,
          sessionMs: performance.now() - started,
          providerSessionMs,
          sessionId,
          endedCleanly: true,
        },
      });
    };
    const end = () => {
      if (settled || endSent) return;
      endSent = true;
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "session.end" }));
      endTimer = setTimeout(() => finish(false), 2_000);
    };
    const cancel = () => {
      failure = new DOMException("Render cancelled", "AbortError");
      end();
    };
    const timeout = setTimeout(() => {
      failure = new Error(
        "Rendering timed out after 60 seconds. Split this line or try again.",
      );
      end();
    }, 60_000);
    signal.addEventListener("abort", cancel, { once: true });
    window.addEventListener("pagehide", cancel, { once: true });
    ws.onopen = () => {
      if (endSent || signal.aborted) {
        ws.send(JSON.stringify({ type: "session.end" }));
        return;
      }
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            greeting: text,
            system_prompt:
              "Read only the provided greeting. Do not start a conversation.",
            output: { voice, format: { encoding: "audio/pcm" } },
            tools: [],
          },
        }),
      );
    };
    ws.onmessage = ({ data }) => {
      if (settled) return;
      try {
        const event = JSON.parse(data);
        switch (event.type) {
          case "session.ready":
            sessionId = event.session_id;
            onProgress?.("Recording exact script audio…");
            break;
          case "reply.audio": {
            if (failure) break;
            if (firstAudioMs < 0) firstAudioMs = performance.now() - started;
            const bytes = Uint8Array.from(atob(event.data), (c) =>
              c.charCodeAt(0),
            );
            if (bytes.length % 2) throw new Error("Invalid PCM chunk.");
            const view = new DataView(bytes.buffer);
            chunks.push(
              Int16Array.from({ length: bytes.length / 2 }, (_, i) =>
                view.getInt16(i * 2, true),
              ),
            );
            if (chunks.reduce((n, c) => n + c.length, 0) > SAMPLE_RATE * 60)
              throw new Error("Recording exceeded 60 seconds.");
            break;
          }
          case "transcript.agent.delta":
            if (
              typeof event.delta === "string" &&
              Number.isFinite(event.start_ms) &&
              Number.isFinite(event.end_ms) &&
              event.start_ms >= 0 &&
              event.end_ms >= event.start_ms
            )
              timings.push({
                text: event.delta,
                startMs: event.start_ms,
                endMs: event.end_ms,
              });
            break;
          case "transcript.agent":
            transcript = event.text;
            if (event.interrupted)
              failure = new Error(
                "The recording was interrupted. Regenerate this take.",
              );
            break;
          case "reply.done":
            completed = event.status === "completed";
            if (!completed)
              failure = new Error("The recording was interrupted. Try again.");
            onProgress?.("Closing the render session…");
            end();
            break;
          case "session.error":
            failure = new Error(
              "AssemblyAI could not render this take. Check the voice and try again.",
            );
            end();
            break;
          case "session.ended":
            if (Number.isFinite(event.session_duration_seconds))
              providerSessionMs = event.session_duration_seconds * 1000;
            finish(true);
            break;
        }
      } catch {
        failure = new Error("Invalid audio response. Please regenerate.");
        end();
      }
    };
    ws.onerror = () => {
      failure = new Error("Recording connection failed. Please try again.");
      end();
    };
    ws.onclose = () => {
      if (!settled) finish(false);
    };
  });
}
