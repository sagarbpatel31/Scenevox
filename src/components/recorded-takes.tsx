"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneDocument, SceneTake } from "@/lib/scene-document";
import type { ScriptLine } from "@/lib/studio-data";
import type { AudioAsset } from "@/lib/audio/types";
import {
  AUDIO_LIMIT_BYTES,
  deleteAsset,
  listAssets,
  saveAsset,
} from "@/lib/audio/store";
import {
  downloadWav,
  encodeWav,
  joinPcm,
  readWav,
  SAMPLE_RATE,
  textFingerprint,
  waveform,
} from "@/lib/audio/wav";
import { renderTake } from "@/lib/audio/render-take";

type Props = {
  scene: SceneDocument;
  line: ScriptLine;
  voiceAssignments: Record<string, string>;
  enabled: boolean;
  onTake: (line: ScriptLine, asset: AudioAsset) => void;
  onRestore: (take: SceneTake) => void;
  onBusy: (busy: boolean) => void;
  onStart: () => void;
  onPlayback: (active: boolean, lineId: string | null) => void;
  registerStop: (stop: () => void) => void;
};
export function RecordedTakes({
  scene,
  line,
  voiceAssignments,
  enabled,
  onTake,
  onRestore,
  onBusy,
  onStart,
  onPlayback,
  registerStop,
}: Props) {
  const [assets, setAssets] = useState<Map<string, AudioAsset>>(new Map());
  const cache = useRef(new Map<string, AudioAsset>());
  const persisted = useRef(new Set<string>());
  const [persistedIds, setPersistedIds] = useState(new Set<string>());
  const [used, setUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Generate an original, revise it, then compare the recordings.",
  );
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [sceneWav, setSceneWav] = useState<Blob | null>(null);
  const [sceneSignature, setSceneSignature] = useState("");
  const [playingId, setPlayingId] = useState("");
  const [clock, setClock] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [ab, setAb] = useState<[string, string]>(["", ""]);
  const controller = useRef<AbortController | null>(null);
  const playback = useRef<{
    context: AudioContext;
    source?: AudioBufferSourceNode;
  } | null>(null);
  const playbackEpoch = useRef(0);
  const frame = useRef(0);
  const mounted = useRef(true);
  const signature = JSON.stringify(
    scene.lines.map((item) => [
      item.id,
      item.text,
      voiceAssignments[item.characterId],
    ]),
  );
  const takes = scene.takes.filter((take) => take.lineId === line.id);
  const recorded = takes.filter(
    (take) => take.audio && assets.has(take.audio.assetId),
  );
  const chosen = assets.get(playingId);
  const voice = voiceAssignments[line.characterId] ?? "";
  const tooLong = Array.from(line.text).length > 500;

  // Refs hold playback resources; all playback paths call this same stop function.
  const stop = useCallback(() => {
    playbackEpoch.current++;
    cancelAnimationFrame(frame.current);
    if (playback.current) {
      playback.current.source?.stop();
      void playback.current.context.close();
      playback.current = null;
    }
    setPlayingId("");
    setClock(0);
    onPlayback(false, null);
  }, [onPlayback]);
  useEffect(() => {
    mounted.current = true;
    registerStop(stop);
    let active = true;
    listAssets()
      .then((items) => {
        if (!active) return;
        items.forEach((asset) => {
          cache.current.set(asset.id, asset);
          persisted.current.add(asset.id);
        });
        setPersistedIds(new Set(persisted.current));
        setAssets(new Map(cache.current));
        setUsed(items.reduce((n, item) => n + item.wav.size, 0));
      })
      .catch((err) => {
        if (active) setStorageWarning(err.message);
      });
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
      stop();
      registerStop(() => {});
    };
  }, [registerStop, stop]);

  const remember = async (asset: AudioAsset) => {
    cache.current.set(asset.id, asset);
    if (mounted.current) setAssets(new Map(cache.current));
    try {
      await saveAsset(asset);
      persisted.current.add(asset.id);
      if (
        mounted.current &&
        [...cache.current.keys()].every((id) => persisted.current.has(id))
      )
        setStorageWarning("");
      if (mounted.current) setPersistedIds(new Set(persisted.current));
      if (mounted.current)
        setUsed(
          [...cache.current.values()]
            .filter((item) => persisted.current.has(item.id))
            .reduce((n, item) => n + item.wav.size, 0),
        );
    } catch (err) {
      if (mounted.current)
        setStorageWarning(
          err instanceof Error
            ? err.message
            : "Download this WAV now; browser storage failed.",
        );
    }
  };
  const getAudio = async (snapshot: ScriptLine, signal: AbortSignal) => {
    signal.throwIfAborted();
    const selectedVoice = voiceAssignments[snapshot.characterId];
    if (!selectedVoice)
      throw new Error("Choose an AssemblyAI voice for every character first.");
    const key = await textFingerprint(snapshot.text, selectedVoice);
    signal.throwIfAborted();
    let asset = cache.current.get(key);
    if (!asset) {
      asset = await renderTake({
        text: snapshot.text,
        voice: selectedVoice,
        signal,
        onProgress: setMessage,
      });
      // Keep a completed take even when a scene batch is cancelled during disk I/O.
      await remember(asset);
    } else if (!persisted.current.has(asset.id)) {
      // Retrying after a quota/storage failure must retry persistence, not just audio.
      await remember(asset);
    }
    if (mounted.current) onTake(snapshot, asset);
    return asset;
  };
  const run = async (snapshot?: ScriptLine) => {
    if (controller.current) return; // Synchronous lock also covers duplicate clicks.
    const next = new AbortController();
    controller.current = next;
    onStart();
    stop();
    onBusy(true);
    setBusy(true);
    setError("");
    try {
      if (snapshot) {
        const asset = await getAudio({ ...snapshot }, next.signal);
        setMessage(
          `Take ready · ${asset.metadata.duration.toFixed(2)}s · ${(asset.metadata.firstAudioMs / 1000).toFixed(2)}s to first audio`,
        );
      } else {
        const clips: Int16Array[] = [];
        // Preflight before spending credits; never truncate long dialogue.
        if (
          scene.lines.some(
            (item) =>
              !item.text.trim() ||
              Array.from(item.text).length > 500 ||
              !voiceAssignments[item.characterId],
          )
        )
          throw new Error(
            "Each line needs text of 1–500 characters and an AssemblyAI voice. Split longer dialogue first.",
          );
        for (let i = 0; i < scene.lines.length; i++) {
          setMessage(`Rendering line ${i + 1} of ${scene.lines.length}…`);
          const asset = await getAudio({ ...scene.lines[i] }, next.signal);
          next.signal.throwIfAborted();
          clips.push(await readWav(asset.wav));
        }
        next.signal.throwIfAborted();
        const pcm = joinPcm(clips);
        setSceneWav(encodeWav(pcm));
        setSceneSignature(signature);
        setMessage(
          `Scene ready · ${(pcm.length / SAMPLE_RATE).toFixed(2)}s · 300 ms between lines`,
        );
      }
    } catch (err) {
      if (mounted.current) {
        if (next.signal.aborted)
          setMessage(
            "Render cancelled. Completed recordings are still available.",
          );
        else
          setError(
            err instanceof Error
              ? err.message
              : "Could not generate audio. Try again.",
          );
      }
    } finally {
      controller.current = null;
      if (mounted.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  const play = async (take: SceneTake) => {
    if (!take.audio || busy) return;
    const asset = cache.current.get(take.audio.assetId);
    if (!asset) {
      setError("Recording missing on this device. Regenerate this take.");
      return;
    }
    onStart();
    stop();
    setError("");
    const epoch = playbackEpoch.current;
    const context = new AudioContext();
    playback.current = { context };
    try {
      await context.resume();
      const pcm = await readWav(asset.wav);
      if (epoch !== playbackEpoch.current) return;
      const buffer = context.createBuffer(1, pcm.length, SAMPLE_RATE);
      buffer
        .getChannelData(0)
        .set(Float32Array.from(pcm, (sample) => sample / 32768));
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      playback.current = { context, source };
      setPlayingId(asset.id);
      setPeaks(waveform(pcm));
      onPlayback(true, take.lineId);
      const start = context.currentTime;
      source.onended = () => {
        if (epoch === playbackEpoch.current) stop();
      };
      source.start();
      const tick = () => {
        if (epoch !== playbackEpoch.current) return;
        setClock(context.currentTime - start);
        frame.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      stop();
      setError("Could not play this WAV. Download or regenerate it.");
    }
  };
  const remove = async (id: string) => {
    stop();
    try {
      if (persisted.current.has(id)) await deleteAsset(id);
      cache.current.delete(id);
      persisted.current.delete(id);
      setAssets(new Map(cache.current));
      setPersistedIds(new Set(persisted.current));
      setUsed(
        [...cache.current.values()]
          .filter((item) => persisted.current.has(item.id))
          .reduce((n, item) => n + item.wav.size, 0),
      );
      setMessage(
        "Recording deleted from this device. Text takes are unchanged; regenerate anytime.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete recording.",
      );
    }
  };
  return (
    <section
      id="recordings"
      className="recording-panel panel"
      aria-label="Recorded performances"
    >
      <div className="recording-heading">
        <div>
          <p className="kicker">AssemblyAI · exact-read recordings</p>
          <h2>Hear the before. Keep the after.</h2>
        </div>
        <span>
          {(used / 1024 / 1024).toFixed(1)} / {AUDIO_LIMIT_BYTES / 1024 / 1024}{" "}
          MB on device
        </span>
      </div>
      <p>
        Line {scene.lines.indexOf(line) + 1} ·{" "}
        {scene.characters.find((item) => item.id === line.characterId)?.name} ·{" "}
        {voice || "Choose a voice in Cast"}. Direction is a creative note, not
        an emotional-delivery control.
      </p>
      <div className="recording-actions">
        <button
          className="primary-button"
          disabled={!enabled || !voice || busy || tooLong || !line.text.trim()}
          onClick={() => void run(line)}
        >
          Generate take
        </button>
        <button disabled={!enabled || busy} onClick={() => void run()}>
          Render scene
        </button>
        {busy ? (
          <button
            onClick={() => {
              controller.current?.abort();
              setMessage("Cancelling and closing the session…");
            }}
          >
            Cancel render
          </button>
        ) : null}
        {playingId ? <button onClick={stop}>Stop recording</button> : null}
        {sceneWav ? (
          <button
            disabled={signature !== sceneSignature}
            onClick={() => downloadWav(sceneWav, "scenevox-scene.wav")}
          >
            Download scene WAV
          </button>
        ) : null}
      </div>
      {sceneWav && signature !== sceneSignature ? (
        <p>
          Scene changed. Render again to export the current script; unchanged
          clips will be reused.
        </p>
      ) : null}
      {tooLong ? (
        <p role="alert">
          This line has more than 500 characters. It stays editable; split it to
          generate audio.
        </p>
      ) : null}
      <p role="status" data-testid="render-status">
        {busy ? "◌ " : ""}
        {message}
      </p>
      {busy ? <progress aria-label="Audio rendering in progress" /> : null}
      {error ? (
        <p role="alert" className="director-error">
          {error}
        </p>
      ) : null}
      {storageWarning ? (
        <p role="alert">
          {storageWarning} Unsaved clips remain downloadable until this tab
          closes. No recordings are automatically deleted.
        </p>
      ) : null}
      <div className="ab-controls" aria-label="A/B comparison">
        {([0, 1] as const).map((slot) => {
          const selected =
            recorded.find((take) => take.id === ab[slot]) ?? recorded[slot];
          return (
            <div key={slot}>
              <label>
                {slot === 0 ? "A · before" : "B · after"}
                <select
                  aria-label={`${slot === 0 ? "A" : "B"} recording`}
                  value={selected?.id ?? ""}
                  onChange={(event) =>
                    setAb((current) =>
                      slot === 0
                        ? [event.target.value, current[1]]
                        : [current[0], event.target.value],
                    )
                  }
                >
                  <option value="">Choose recording</option>
                  {recorded.map((take, i) => (
                    <option key={take.id} value={take.id}>
                      {take.source} {i + 1} · {take.audio?.voice} ·{" "}
                      {take.text.slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={!selected || busy}
                onClick={() => selected && void play(selected)}
              >
                Play {slot === 0 ? "A" : "B"}
              </button>
            </div>
          );
        })}
      </div>
      {chosen ? (
        <div className="recorded-wave" aria-label="Recording playback">
          <div className="sample-wave" aria-hidden="true">
            {peaks.map((peak, i) => (
              <i
                key={i}
                style={{
                  height: `${Math.max(3, peak * 100)}%`,
                  opacity:
                    i / peaks.length < clock / chosen.metadata.duration
                      ? 1
                      : 0.3,
                }}
              />
            ))}
          </div>
          <span>
            {clock.toFixed(2)} / {chosen.metadata.duration.toFixed(2)}s
          </span>
          <p className="timed-transcript">
            {chosen.metadata.timings.length
              ? chosen.metadata.timings.map((word, i) => (
                  <span
                    key={i}
                    className={
                      clock * 1000 >= word.startMs && clock * 1000 < word.endMs
                        ? "spoken-word"
                        : ""
                    }
                  >
                    {word.text}{" "}
                  </span>
                ))
              : chosen.metadata.transcript}
          </p>
          {!chosen.metadata.timings.length ? (
            <small>
              Word timings unavailable · active line highlighted during
              playback.
            </small>
          ) : null}
        </div>
      ) : null}
      <div className="recording-cards">
        {takes
          .slice(-8)
          .reverse()
          .map((take) => {
            const asset = take.audio
              ? assets.get(take.audio.assetId)
              : undefined;
            const stale =
              !!take.audio &&
              (take.text !== line.text || take.audio.voice !== voice);
            return (
              <article
                className="take-card"
                key={take.id}
                aria-label={`${take.source} recording`}
              >
                <div className="take-heading">
                  <strong>{take.source}</strong>
                  <span>
                    {stale
                      ? "Different text / voice"
                      : take.text === line.text
                        ? "Current text"
                        : "Earlier text"}
                  </span>
                </div>
                <p>{take.text}</p>
                {asset ? (
                  <>
                    <small>
                      {asset.metadata.voice} ·{" "}
                      {asset.metadata.duration.toFixed(2)}s ·{" "}
                      {(asset.metadata.firstAudioMs / 1000).toFixed(2)}s first
                      audio ·{" "}
                      {(
                        (asset.metadata.providerSessionMs ??
                          asset.metadata.sessionMs) / 1000
                      ).toFixed(2)}
                      s
                      {asset.metadata.providerSessionMs !== undefined
                        ? " provider session"
                        : " request total"}
                      {!persistedIds.has(asset.id)
                        ? " · NOT SAVED — download now"
                        : ""}
                    </small>
                    <div className="take-actions">
                      <button disabled={busy} onClick={() => void play(take)}>
                        Replay
                      </button>
                      <button
                        onClick={() =>
                          downloadWav(asset.wav, `scenevox-${take.id}.wav`)
                        }
                      >
                        Download WAV
                      </button>
                      <button onClick={() => onRestore(take)}>
                        Use recorded take
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void remove(asset.id)}
                      >
                        Delete audio
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <small>
                      {take.audio
                        ? "Audio unavailable on this device. "
                        : "Text take only. "}
                      Regenerate to record it.
                    </small>
                    <button
                      disabled={
                        busy ||
                        !enabled ||
                        !voice ||
                        Array.from(take.text).length > 500
                      }
                      onClick={() =>
                        void run({
                          ...line,
                          text: take.text,
                          direction: take.direction,
                        })
                      }
                    >
                      Regenerate take
                    </button>
                  </>
                )}
              </article>
            );
          })}
      </div>
      <details>
        <summary>Manage all device recordings ({assets.size})</summary>
        <p>
          Shared links and JSON exports contain text, not recordings. Keep WAV
          downloads as your backup.
        </p>
        {[...assets.values()].map((asset) => (
          <div className="storage-row" key={asset.id}>
            <span>
              {asset.metadata.voice} · {asset.metadata.transcript.slice(0, 55)}{" "}
              · {(asset.wav.size / 1024).toFixed(0)} KB
            </span>
            <button
              onClick={() =>
                downloadWav(asset.wav, `scenevox-${asset.id.slice(0, 8)}.wav`)
              }
            >
              Download
            </button>
            <button disabled={busy} onClick={() => void remove(asset.id)}>
              Delete recording
            </button>
          </div>
        ))}
      </details>
    </section>
  );
}
