"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { segmentAtTime, type SceneSegment } from "@/lib/audio/scene-timeline";

type Props = {
  wav: Blob;
  segments: SceneSegment[];
  stale: boolean;
  busy: boolean;
  onStart: () => void;
  onPlayback: (active: boolean, lineId: string | null) => void;
  registerStop: (stop: () => void) => void;
};

export function SceneMixPlayer({
  wav,
  segments,
  stale,
  busy,
  onStart,
  onPlayback,
  registerStop,
}: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const frame = useRef(0);
  const playEpoch = useRef(0);
  const ownsPlayback = useRef(false);
  const invalidatePlay = useCallback(() => {
    playEpoch.current++;
  }, []);
  const duration = segments.at(-1)?.end ?? 0;
  const active = segmentAtTime(segments, position);
  const disabled = stale || busy || !ready;
  const stop = useCallback(() => {
    playEpoch.current++;
    cancelAnimationFrame(frame.current);
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    if (ownsPlayback.current) onPlayback(false, null);
    ownsPlayback.current = false;
  }, [onPlayback]);

  useEffect(() => {
    const element = audio.current!;
    const url = URL.createObjectURL(wav);
    element.src = url;
    element.load();
    return () => {
      invalidatePlay();
      cancelAnimationFrame(frame.current);
      element.pause();
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
      if (ownsPlayback.current) onPlayback(false, null);
      ownsPlayback.current = false;
    };
  }, [wav, onPlayback, invalidatePlay]);
  useEffect(() => {
    registerStop(stop);
    window.addEventListener("pagehide", stop);
    return () => {
      registerStop(() => {});
      window.removeEventListener("pagehide", stop);
    };
  }, [registerStop, stop]);
  useEffect(() => {
    if (stale || busy) {
      playEpoch.current++;
      audio.current?.pause();
      if (audio.current) audio.current.currentTime = 0;
      if (ownsPlayback.current) onPlayback(false, null);
      ownsPlayback.current = false;
    }
  }, [stale, busy, onPlayback]);

  const syncClock = () => {
    const element = audio.current;
    if (!element) return;
    setPosition(element.currentTime);
    if (ownsPlayback.current)
      onPlayback(
        !element.paused && !element.ended,
        !element.paused
          ? (segmentAtTime(segments, element.currentTime)?.lineId ?? null)
          : null,
      );
  };
  const play = async () => {
    if (disabled || !audio.current) return;
    const element = audio.current;
    onStart();
    const epoch = ++playEpoch.current;
    ownsPlayback.current = true;
    setError("");
    if (element.ended || element.currentTime >= duration)
      element.currentTime = 0;
    try {
      await element.play();
      if (epoch !== playEpoch.current) return;
    } catch {
      if (epoch === playEpoch.current) {
        setError(
          "Could not play the assembled scene. Try again or download its WAV.",
        );
        onPlayback(false, null);
        ownsPlayback.current = false;
      }
    }
  };
  const seek = (seconds: number) => {
    if (!audio.current || disabled) return;
    audio.current.currentTime = Math.min(duration, Math.max(0, seconds));
    syncClock();
  };

  return (
    <section className="scene-mix-player" aria-label="Assembled scene player">
      <audio
        ref={audio}
        data-testid="scene-audio"
        preload="metadata"
        onLoadedMetadata={() => {
          setReady(true);
          setPosition(0);
          setPlaying(false);
        }}
        onEmptied={() => {
          setReady(false);
          setPlaying(false);
          setPosition(0);
        }}
        onPlay={() => {
          setPlaying(true);
          cancelAnimationFrame(frame.current);
          const tick = () => {
            syncClock();
            if (audio.current && !audio.current.paused && !audio.current.ended)
              frame.current = requestAnimationFrame(tick);
          };
          tick();
        }}
        onPause={() => {
          setPlaying(false);
          cancelAnimationFrame(frame.current);
          syncClock();
          ownsPlayback.current = false;
        }}
        onTimeUpdate={syncClock}
        onSeeked={syncClock}
        onEnded={() => {
          setPlaying(false);
          cancelAnimationFrame(frame.current);
          if (ownsPlayback.current) onPlayback(false, null);
          ownsPlayback.current = false;
          setPosition(duration);
        }}
        onError={() => {
          setReady(false);
          setPlaying(false);
          if (ownsPlayback.current) onPlayback(false, null);
          ownsPlayback.current = false;
          setError(
            "The scene WAV could not be decoded. Render again or download your recordings.",
          );
        }}
      />
      <div className="scene-player-heading">
        <div>
          <p className="kicker">Full scene · recorded voices</p>
          <h3>Listen before you export.</h3>
        </div>
        <output aria-label="Scene playback position">
          {position.toFixed(2)} / {duration.toFixed(2)}s
        </output>
      </div>
      <div className="scene-transport">
        <button
          disabled={disabled}
          onClick={() => {
            if (playing) {
              invalidatePlay();
              audio.current?.pause();
            } else void play();
          }}
        >
          {playing ? "Pause recorded scene" : "Play recorded scene"}
        </button>
        <button disabled={!ready} onClick={stop}>
          Stop scene playback
        </button>
        <label className="scene-seek">
          Scene position
          <input
            aria-label="Seek recorded scene"
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={Math.min(position, duration)}
            disabled={disabled}
            onChange={(event) => seek(Number(event.target.value))}
          />
        </label>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {stale ? (
        <p role="status">
          This mix is out of date. Render the changed scene before playing or
          exporting it.
        </p>
      ) : (
        <p role="status">
          {active
            ? `${active.speaker} · line ${segments.indexOf(active) + 1}`
            : position >= duration
              ? "Scene complete"
              : playing
                ? "Between lines · 300 ms gap"
                : "Ready to review"}
        </p>
      )}
      {active ? (
        <p className="scene-caption">
          {active.timings.length
            ? active.timings.map((word, index) => (
                <span
                  key={index}
                  className={
                    playing &&
                    (position - active.start) * 1000 >= word.startMs &&
                    (position - active.start) * 1000 < word.endMs
                      ? "spoken-word"
                      : ""
                  }
                >
                  {word.text}{" "}
                </span>
              ))
            : active.text}
        </p>
      ) : null}
      <div className="scene-timeline" aria-label="Recorded scene lines">
        {segments.map((segment, index) => (
          <button
            key={segment.lineId}
            disabled={disabled}
            aria-label={`Jump to recorded line ${index + 1}: ${segment.speaker}`}
            aria-current={
              playing && active?.lineId === segment.lineId ? "true" : undefined
            }
            onClick={() => seek(segment.start)}
          >
            <strong>
              {String(index + 1).padStart(2, "0")} · {segment.speaker}
            </strong>
            <span>{segment.text}</span>
            <small>
              {segment.start.toFixed(2)}–{segment.end.toFixed(2)}s
            </small>
          </button>
        ))}
      </div>
    </section>
  );
}
