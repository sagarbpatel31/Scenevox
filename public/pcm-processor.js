class SceneVoxPcmProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { inputSampleRate, targetSampleRate } = options.processorOptions;
    this.ratio = inputSampleRate / targetSampleRate;
    this.tail = new Float32Array(0);
    this.position = 0;
    this.chunk = new Int16Array(2400);
    this.offset = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;

    const samples = new Float32Array(this.tail.length + input.length);
    samples.set(this.tail);
    samples.set(input, this.tail.length);
    while (this.position + 1 < samples.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      const sample =
        samples[index] * (1 - fraction) + samples[index + 1] * fraction;
      this.chunk[this.offset++] = Math.max(
        -32768,
        Math.min(32767, Math.round(sample * 32767)),
      );
      this.position += this.ratio;
      if (this.offset === this.chunk.length) {
        this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
        this.chunk = new Int16Array(2400);
        this.offset = 0;
      }
    }
    const consumed = Math.min(Math.floor(this.position), samples.length);
    this.tail = samples.slice(consumed);
    this.position -= consumed;
    return true;
  }
}

registerProcessor("scenevox-pcm-processor", SceneVoxPcmProcessor);
