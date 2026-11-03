import type { WordTiming } from "./types";
import { SAMPLE_RATE } from "./wav";

export type SceneSegment = {
  lineId: string;
  text: string;
  speaker: string;
  start: number;
  end: number;
  timings: WordTiming[];
};

// Frame counts, not rounded display durations, are the source of truth.
export function sceneTimeline(
  clips: Array<Omit<SceneSegment, "start" | "end"> & { samples: number }>,
  gapMs = 300,
): SceneSegment[] {
  let frame = 0;
  const gap = Math.round((SAMPLE_RATE * gapMs) / 1000);
  return clips.map(({ samples, ...clip }) => {
    if (!Number.isSafeInteger(samples) || samples <= 0)
      throw new Error("Cannot build a timeline from empty recording audio.");
    const start = frame / SAMPLE_RATE;
    frame += samples;
    const end = frame / SAMPLE_RATE;
    frame += gap;
    return { ...clip, start, end };
  });
}

export function segmentAtTime(segments: SceneSegment[], seconds: number) {
  return segments.find(
    (segment) => seconds >= segment.start && seconds < segment.end,
  );
}
