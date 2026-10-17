import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Generates synthetic speech only. No real microphone recording or credentials.
const directory = mkdtempSync(join(tmpdir(), "scenevox-voice-test-"));
const aiff = join(directory, "request.aiff");
const wav = join(directory, "request.wav");
execFileSync("/usr/bin/say", [
  "-v",
  "Samantha",
  "-o",
  aiff,
  "Change the selected dialogue to: We still have tomorrow. Set the direction to quiet urgency. Apply the revision now.",
]);
execFileSync("/usr/bin/afconvert", [
  "-f",
  "WAVE",
  "-d",
  "LEI16@48000",
  "-c",
  "1",
  aiff,
  wav,
]);
const input = readFileSync(wav);
let offset = 12;
let speech;
while (offset + 8 <= input.length) {
  const length = input.readUInt32LE(offset + 4);
  if (input.toString("ascii", offset, offset + 4) === "data") {
    speech = input.subarray(offset + 8, offset + 8 + length);
    break;
  }
  offset += 8 + length + (length % 2);
}
if (!speech?.length)
  throw new Error("System speech synthesis returned no audio.");
const data = Buffer.concat([
  Buffer.alloc(48_000 * 2 * 6),
  speech,
  Buffer.alloc(48_000 * 2 * 3),
]);
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(48_000, 24);
header.writeUInt32LE(96_000, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const result = join(directory, "request-with-silence.wav");
writeFileSync(result, Buffer.concat([header, data]));
console.log(result);
