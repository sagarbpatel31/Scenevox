export const SAMPLE_RATE = 24_000;
export function encodeWav(pcm: Int16Array): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return new Blob([buffer], { type: "audio/wav" });
}
export async function readWav(wav: Blob): Promise<Int16Array> {
  const buffer = await wav.arrayBuffer();
  const view = new DataView(buffer);
  if (
    buffer.byteLength < 44 ||
    view.getUint32(0) !== 0x52494646 ||
    view.getUint32(8) !== 0x57415645 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== SAMPLE_RATE ||
    view.getUint16(34, true) !== 16 ||
    view.getUint32(36) !== 0x64617461 ||
    view.getUint32(40, true) !== buffer.byteLength - 44
  )
    throw new Error("This recording is not a valid mono 24 kHz PCM16 WAV.");
  return Int16Array.from({ length: (buffer.byteLength - 44) / 2 }, (_, i) =>
    view.getInt16(44 + i * 2, true),
  );
}
export function joinPcm(clips: Int16Array[], gapMs = 300) {
  const gap = Math.round((SAMPLE_RATE * gapMs) / 1000);
  const joined = new Int16Array(
    clips.reduce((n, clip) => n + clip.length, 0) +
      Math.max(0, clips.length - 1) * gap,
  );
  let offset = 0;
  clips.forEach((clip) => {
    joined.set(clip, offset);
    offset += clip.length + gap;
  });
  return joined;
}
export function waveform(pcm: Int16Array, bars = 80) {
  return Array.from({ length: bars }, (_, bar) => {
    const start = Math.floor((bar * pcm.length) / bars),
      end = Math.floor(((bar + 1) * pcm.length) / bars);
    let peak = 0;
    for (let i = start; i < end; i++)
      peak = Math.max(peak, Math.abs(pcm[i]) / 32768);
    return peak;
  });
}
export async function textFingerprint(text: string, voice: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([text, voice, SAMPLE_RATE, 16, 1])),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export function downloadWav(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
