import {
  characters,
  initialLines,
  type Character,
  type ScriptLine,
} from "./studio-data";
import type { AudioMetadata } from "./audio/types";

export type SceneTake = {
  id: string;
  lineId: string;
  text: string;
  direction: string;
  source: "Original" | "Saved take" | "Director";
  createdAt: string;
  audio?: AudioMetadata;
};

export type SceneDocument = {
  version: 2;
  title: string;
  setting: string;
  premise: string;
  characters: Character[];
  lines: ScriptLine[];
  takes: SceneTake[];
  voiceAssignments: Record<string, string>;
  assemblyVoiceAssignments: Record<string, string>;
};

export const SCENE_STORAGE_KEY = "scenevox.scene.v2";
export const LEGACY_SCENE_STORAGE_KEY = "scenevox.scene.v1";
const colors = [
  "#ff8d6b",
  "#b6ef5b",
  "#b0a6ff",
  "#83cadd",
  "#f3cc71",
  "#e7a4c1",
];

export function makeTake(
  line: ScriptLine,
  source: SceneTake["source"],
): SceneTake {
  return {
    id: crypto.randomUUID(),
    lineId: line.id,
    text: line.text,
    direction: line.direction,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function createDemoScene(): SceneDocument {
  return {
    version: 2,
    title: "The Last Garden",
    setting: "INT. ORBITAL SEED VAULT — ARTIFICIAL DAWN",
    premise: "A failing ship gives its garden one last sunrise.",
    characters: characters.map((character) => ({ ...character })),
    lines: initialLines.map((line) => ({ ...line })),
    takes: initialLines.map((line, index) => ({
      id: `original-${index}`,
      lineId: line.id,
      text: line.text,
      direction: line.direction,
      source: "Original",
      createdAt: "2026-10-17T00:00:00Z",
    })),
    voiceAssignments: {},
    assemblyVoiceAssignments: {},
  };
}

export function parseScript(script: string, title: string): SceneDocument {
  if (script.length > 30_000)
    throw new Error("Keep the script under 30,000 characters.");
  const cast: Character[] = [];
  const lines: ScriptLine[] = [];
  let speaker = "";
  let direction = "natural, conversational";
  for (const raw of script.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const inline = row.match(/^([^:]{1,40}):\s*(.*)$/);
    const screenplay = row.match(/^([A-Z][A-Z .'-]{1,38})$/);
    if (inline || screenplay) {
      speaker = (inline?.[1] ?? screenplay![1]).trim();
      direction = "natural, conversational";
      if (
        !cast.some(
          (character) => character.name.toLowerCase() === speaker.toLowerCase(),
        )
      ) {
        if (cast.length >= 12)
          throw new Error(
            "This studio supports up to 12 characters per scene.",
          );
        cast.push({
          id: `character-${cast.length + 1}`,
          name: speaker,
          role: "Scene character",
          color: colors[cast.length % colors.length],
          voiceHint: cast.length % 2 ? "bright" : "grounded",
        });
      }
      if (!inline?.[2]) continue;
      const dialogue = inline[2].match(/^\(([^)]+)\)\s*(.*)$/);
      if (dialogue) direction = dialogue[1];
      const text = dialogue?.[2] ?? inline[2];
      if (text)
        lines.push({
          id: crypto.randomUUID(),
          characterId: cast.find(
            (character) =>
              character.name.toLowerCase() === speaker.toLowerCase(),
          )!.id,
          text,
          direction,
        });
    } else if (/^\(.+\)$/.test(row) && speaker) {
      direction = row.slice(1, -1);
    } else if (speaker) {
      const previous = lines.at(-1);
      const characterId = cast.find(
        (character) => character.name.toLowerCase() === speaker.toLowerCase(),
      )!.id;
      if (
        previous?.characterId === characterId &&
        previous.direction === direction
      )
        previous.text += ` ${row}`;
      else
        lines.push({
          id: crypto.randomUUID(),
          characterId,
          text: row,
          direction,
        });
    } else {
      throw new Error(
        "Start with a speaker, like MARA: Your dialogue, or an uppercase screenplay character cue.",
      );
    }
  }
  if (!lines.length)
    throw new Error("No dialogue found. Add a speaker and at least one line.");
  if (lines.length > 100 || lines.some((line) => line.text.length > 1_000))
    throw new Error("Use up to 100 lines, with at most 1,000 characters each.");
  return {
    version: 2,
    title: title.trim().slice(0, 80) || "Untitled scene",
    setting: "YOUR SCENE · YOUR VOICES",
    premise: "A new story, ready for its first read.",
    characters: cast,
    lines,
    takes: lines.map((line) => makeTake(line, "Original")),
    voiceAssignments: {},
    assemblyVoiceAssignments: {},
  };
}

export function validateScene(value: unknown): SceneDocument {
  if (!value || typeof value !== "object")
    throw new Error("Invalid scene file.");
  const scene = value as Omit<SceneDocument, "version"> & { version: number };
  if (
    ![1, 2].includes(scene.version) ||
    typeof scene.title !== "string" ||
    scene.title.length > 80 ||
    typeof scene.setting !== "string" ||
    typeof scene.premise !== "string" ||
    !Array.isArray(scene.characters) ||
    !scene.characters.length ||
    scene.characters.length > 12 ||
    !Array.isArray(scene.lines) ||
    !scene.lines.length ||
    scene.lines.length > 100
  )
    throw new Error("This scene file has an unsupported format.");
  const ids = new Set<string>();
  for (const character of scene.characters) {
    if (
      typeof character.id !== "string" ||
      ids.has(character.id) ||
      typeof character.name !== "string" ||
      character.name.length > 80 ||
      typeof character.role !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(character.color) ||
      !["warm", "bright", "grounded"].includes(character.voiceHint)
    )
      throw new Error("Invalid character in scene.");
    ids.add(character.id);
  }
  const lineIds = new Set<string>();
  for (const line of scene.lines) {
    if (
      typeof line.id !== "string" ||
      lineIds.has(line.id) ||
      !ids.has(line.characterId) ||
      typeof line.text !== "string" ||
      line.text.length > 1_000 ||
      typeof line.direction !== "string" ||
      line.direction.length > 100
    )
      throw new Error("Invalid dialogue in scene.");
    lineIds.add(line.id);
  }
  const takes = Array.isArray(scene.takes)
    ? scene.takes
        .filter(
          (take) =>
            take &&
            typeof take.id === "string" &&
            lineIds.has(take.lineId) &&
            typeof take.text === "string" &&
            take.text.length <= 1_000 &&
            typeof take.direction === "string" &&
            take.direction.length <= 100 &&
            ["Original", "Saved take", "Director"].includes(take.source) &&
            typeof take.createdAt === "string",
        )
        .slice(-200)
    : [];
  const assignments: Record<string, string> = {};
  if (scene.voiceAssignments && typeof scene.voiceAssignments === "object") {
    for (const id of ids)
      if (typeof scene.voiceAssignments[id] === "string")
        assignments[id] = scene.voiceAssignments[id];
  }
  const assemblyVoiceAssignments: Record<string, string> = {};
  for (const id of ids) {
    const voice = scene.assemblyVoiceAssignments?.[id];
    if (typeof voice === "string" && /^[a-zA-Z0-9_-]{1,120}$/.test(voice))
      assemblyVoiceAssignments[id] = voice;
  }
  const safeTakes = takes.map(({ audio, ...take }) => ({
    ...take,
    ...(validAudio(audio) ? { audio } : {}),
  }));
  // Return only known fields; imports cannot inject additional persisted data.
  return {
    version: 2,
    title: scene.title,
    setting: scene.setting,
    premise: scene.premise,
    characters: scene.characters,
    lines: scene.lines,
    takes: safeTakes,
    voiceAssignments: assignments,
    assemblyVoiceAssignments,
  };
}

function validAudio(audio: AudioMetadata | undefined): audio is AudioMetadata {
  return (
    !!audio &&
    /^[a-f0-9]{64}$/.test(audio.assetId) &&
    audio.fingerprint === audio.assetId &&
    typeof audio.voice === "string" &&
    audio.voice.length <= 120 &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0 &&
    audio.duration <= 60 &&
    typeof audio.transcript === "string" &&
    audio.transcript.length <= 10_000 &&
    Number.isFinite(audio.firstAudioMs) &&
    Number.isFinite(audio.sessionMs) &&
    typeof audio.sessionId === "string" &&
    typeof audio.endedCleanly === "boolean" &&
    Array.isArray(audio.timings) &&
    audio.timings.length <= 2000 &&
    audio.timings.every(
      (word) =>
        word &&
        typeof word.text === "string" &&
        Number.isFinite(word.startMs) &&
        Number.isFinite(word.endMs) &&
        word.startMs >= 0 &&
        word.endMs >= word.startMs &&
        word.endMs <= audio.duration * 1000 + 1000,
    )
  );
}

export function portableScene(scene: SceneDocument) {
  return {
    ...scene,
    takes: scene.takes.map(({ audio: _audio, ...take }) => {
      void _audio;
      return take;
    }),
    voiceAssignments: {},
  };
}

export function encodeSharedScene(scene: SceneDocument) {
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      ...portableScene(scene),
      takes: [],
      assemblyVoiceAssignments: {},
    }),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (encoded.length > 25_000)
    throw new Error(
      "This scene is too long for a share link. Export the scene file instead.",
    );
  return encoded;
}

export function decodeSharedScene(encoded: string) {
  if (encoded.length > 25_000)
    throw new Error("This shared scene is too large.");
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return validateScene(JSON.parse(new TextDecoder().decode(bytes)));
}

export function screenplayText(scene: SceneDocument) {
  return `${scene.title}\n${scene.setting}\n\n${scene.lines.map((line) => `${scene.characters.find((character) => character.id === line.characterId)?.name.toUpperCase()}\n(${line.direction})\n${line.text}`).join("\n\n")}\n`;
}
