import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (id) =>
    id.startsWith(".")
      ? load(new URL(`${id}.ts`, new URL(path, import.meta.url)).href)
      : require(id);
  new Function("module", "exports", "require", output)(
    loaded,
    loaded.exports,
    localRequire,
  );
  return loaded.exports;
}
const { encodeWav, readWav, joinPcm, waveform, textFingerprint } = load(
  "../src/lib/audio/wav.ts",
);
const {
  validateScene,
  createDemoScene,
  portableScene,
  encodeSharedScene,
  decodeSharedScene,
} = load("../src/lib/scene-document.ts");
const { sceneTimeline, segmentAtTime } = load(
  "../src/lib/audio/scene-timeline.ts",
);
const { splitDialogue } = load("../src/lib/split-dialogue.ts");
test("PCM16 WAV headers and lossless little-endian samples", async () => {
  const pcm = new Int16Array([-32768, -100, 0, 100, 32767]);
  const wav = encodeWav(pcm),
    bytes = await wav.arrayBuffer(),
    view = new DataView(bytes);
  assert.equal(wav.type, "audio/wav");
  assert.equal(bytes.byteLength, 54);
  assert.equal(view.getUint32(24, true), 24000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);
  assert.deepEqual(await readWav(wav), pcm);
  await assert.rejects(readWav(new Blob(["invalid"])));
});
test("scene assembly duration includes exactly 300 ms gaps without edge silence", () => {
  const a = new Int16Array(24000).fill(100),
    b = new Int16Array(48000).fill(-100);
  const joined = joinPcm([a, b]);
  assert.equal(joined.length / 24000, 3.3);
  assert.equal(joined[23999], 100);
  assert.equal(joined[24000], 0);
  assert.equal(joined[31199], 0);
  assert.equal(joined[31200], -100);
  assert.equal(joinPcm([]).length, 0);
  assert.equal(joinPcm([a]).length, a.length);
  assert.equal(waveform(a, 24).length, 24);
});
test("fingerprint binds exact Unicode wording and voice, not direction", async () => {
  const text = "Mara—meet Zoë at 9:42. Café déjà vu?";
  const hash = await textFingerprint(text, "alba");
  assert.equal(hash, await textFingerprint(text, "alba"));
  assert.notEqual(hash, await textFingerprint(text + "!", "alba"));
  assert.notEqual(hash, await textFingerprint(text, "george"));
});
test("v1 migrates without losing draft; v2 audio stays out of portable documents", () => {
  const legacy = { ...createDemoScene(), version: 1 };
  delete legacy.assemblyVoiceAssignments;
  const migrated = validateScene(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.lines, legacy.lines);
  assert.deepEqual(migrated.takes, legacy.takes);
  migrated.takes[0].audio = { assetId: "a".repeat(64) };
  assert.equal(portableScene(migrated).takes[0].audio, undefined);
  assert.deepEqual(decodeSharedScene(encodeSharedScene(migrated)).takes, []);
  assert.equal(validateScene(migrated).takes[0].audio, undefined);
});

test("scene timeline uses exact sample counts, with no active line during gaps", () => {
  const segments = sceneTimeline([
    {
      lineId: "a",
      speaker: "Mara",
      text: "Before.",
      samples: 24001,
      timings: [],
    },
    {
      lineId: "b",
      speaker: "Orion",
      text: "After.",
      samples: 48001,
      timings: [],
    },
  ]);
  assert.equal(segments[0].end, 24001 / 24000);
  assert.equal(segments[1].start, 31201 / 24000);
  assert.equal(segments[1].end, 79202 / 24000);
  assert.equal(segmentAtTime(segments, 0).lineId, "a");
  assert.equal(segmentAtTime(segments, segments[0].end), undefined);
  assert.equal(segmentAtTime(segments, segments[1].start).lineId, "b");
  assert.equal(segmentAtTime(segments, segments[1].end), undefined);
  assert.throws(() =>
    sceneTimeline([
      { lineId: "bad", speaker: "", text: "", samples: 0, timings: [] },
    ]),
  );
});

test("dialogue splitting preserves all Unicode, whitespace and punctuation", () => {
  for (const text of [
    "Mara—meet Zoë at 9:42. Café déjà vu? ".repeat(25),
    "Hello!\n\tDon’t leave, Élodie. 👩🏽‍🚀  ".repeat(25),
    `${"a".repeat(500)} b`,
    "Hello world.",
  ]) {
    const parts = splitDialogue(text);
    assert.equal(parts.join(""), text);
    assert.ok(
      parts.every((part) => Array.from(part).length <= 500 && part.trim()),
    );
    assert.ok(
      parts.every(
        (part, i) =>
          i === 0 || /\s/u.test(part[0]) || /\s/u.test(parts[i - 1].at(-1)),
      ),
    );
  }
  assert.throws(() => splitDialogue("x".repeat(501)), /without cutting a word/);
  assert.throws(() => splitDialogue("word", 0));
});
