import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

for (const inputRate of [24_000, 44_100, 48_000]) {
  test(`audio capture preserves one second at ${inputRate} Hz without drift`, () => {
    let Processor;
    const chunks = [];
    runInNewContext(
      readFileSync(
        new URL("../public/pcm-processor.js", import.meta.url),
        "utf8",
      ),
      {
        AudioWorkletProcessor: class {
          port = {
            postMessage: (buffer) => chunks.push(new Int16Array(buffer)),
          };
        },
        registerProcessor: (_name, implementation) => {
          Processor = implementation;
        },
        Float32Array,
        Int16Array,
      },
    );
    const processor = new Processor({
      processorOptions: {
        inputSampleRate: inputRate,
        targetSampleRate: 24_000,
      },
    });
    for (let offset = 0; offset < inputRate; offset += 128) {
      const block = new Float32Array(Math.min(128, inputRate - offset)).fill(
        0.5,
      );
      assert.equal(processor.process([[block]]), true);
    }
    const count =
      chunks.reduce((sum, chunk) => sum + chunk.length, 0) + processor.offset;
    assert.ok(
      Math.abs(count - 24_000) <= 2,
      `Expected about 24,000 samples, received ${count}`,
    );
    assert.equal(
      chunks[0].length,
      2_400,
      "Frames are batched into 100 ms chunks",
    );
    assert.ok(chunks[0].every((sample) => Math.abs(sample - 16_384) <= 1));
  });
}
