class VoiceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = [];
    this._readOffset = 0;
    this._muted = false;
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "audio") {
        this._queue.push(msg.buffer);
        let total = -this._readOffset;
        for (const chunk of this._queue) total += chunk.length;
        while (total > 3200 && this._queue.length > 1) {
          total -= this._queue.shift().length;
          this._readOffset = 0;
        }
      } else if (msg.type === "mute") {
        this._muted = msg.value;
        if (this._muted) {
          this._queue = [];
          this._readOffset = 0;
        }
      } else if (msg.type === "clear") {
        this._queue = [];
        this._readOffset = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      this.port.postMessage({ type: "input", buffer: input[0].slice() });
    }

    const output = outputs[0];
    if (output && output.length > 0) {
      const out = output[0];
      out.fill(0);
      if (!this._muted) {
        let writeIndex = 0;
        while (writeIndex < out.length && this._queue.length > 0) {
          const head = this._queue[0];
          const remaining = head.length - this._readOffset;
          if (remaining <= 0) {
            this._queue.shift();
            this._readOffset = 0;
            continue;
          }
          const take = Math.min(out.length - writeIndex, remaining);
          out.set(head.subarray(this._readOffset, this._readOffset + take), writeIndex);
          writeIndex += take;
          this._readOffset += take;
          if (this._readOffset >= head.length) {
            this._queue.shift();
            this._readOffset = 0;
          }
        }
      }
    }

    return true;
  }
}

registerProcessor("voice-processor", VoiceProcessor);
