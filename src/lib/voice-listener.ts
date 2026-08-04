/**
 * Browser microphone capture that emits a complete 16 kHz mono WAV per turn,
 * with simple RMS voice-activity detection so the user never taps to stop.
 */

const TARGET_RATE = 16000;

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const samples = downsample(merged, sampleRate, TARGET_RATE);

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(pos + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let pos = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    pos += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export type ListenerHandlers = {
  onLevel: (level: number) => void;
  /** Fired once speech has been detected and then followed by silence. */
  onUtterance: (wav: Blob) => void;
};

export type Listener = {
  stop: () => void;
  /** Pause capture (e.g. while FRIDAY is speaking) without dropping the mic. */
  setPaused: (paused: boolean) => void;
  /** Resume the audio graph after playback/backgrounding suspended it. */
  resume: () => Promise<void>;
  /** True while the mic graph is still alive and receiving audio. */
  isAlive: () => boolean;
};

const SPEECH_THRESHOLD = 0.018;
const SILENCE_THRESHOLD = 0.012;
const SILENCE_MS = 1100;
const MAX_UTTERANCE_MS = 30000;
const MIN_SPEECH_MS = 300;

export async function startListening(handlers: ListenerHandlers): Promise<Listener> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });

  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  let paused = false;
  let stopped = false;
  let chunks: Float32Array[] = [];
  let speechMs = 0;
  let silenceMs = 0;
  let capturedMs = 0;
  let lastFrameAt = Date.now();

  const reset = () => {
    chunks = [];
    speechMs = 0;
    silenceMs = 0;
    capturedMs = 0;
  };

  const flush = () => {
    const wav = encodeWav(chunks, ctx.sampleRate);
    reset();
    if (wav.size > 4096) handlers.onUtterance(wav);
  };

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    lastFrameAt = Date.now();
    const input = event.inputBuffer.getChannelData(0);
    const frameMs = (input.length / ctx.sampleRate) * 1000;

    let sumSquares = 0;
    for (let i = 0; i < input.length; i++) sumSquares += (input[i] ?? 0) ** 2;
    const rms = Math.sqrt(sumSquares / input.length);

    if (paused) {
      handlers.onLevel(0);
      reset();
      return;
    }

    handlers.onLevel(Math.min(1, rms * 12));

    const speaking = rms > (speechMs > 0 ? SILENCE_THRESHOLD : SPEECH_THRESHOLD);
    if (speaking) {
      chunks.push(new Float32Array(input));
      capturedMs += frameMs;
      speechMs += frameMs;
      silenceMs = 0;
      if (capturedMs >= MAX_UTTERANCE_MS) flush();
      return;
    }

    if (speechMs > 0) {
      // Keep trailing silence so words are not clipped.
      chunks.push(new Float32Array(input));
      capturedMs += frameMs;
      silenceMs += frameMs;
      if (silenceMs >= SILENCE_MS) {
        if (speechMs >= MIN_SPEECH_MS) flush();
        else reset();
      }
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: () => {
      stopped = true;
      processor.onaudioprocess = null;
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
    setPaused: (value: boolean) => {
      paused = value;
      if (value) reset();
      else lastFrameAt = Date.now();
    },
    resume: async () => {
      if (stopped) return;
      if (ctx.state !== "running") await ctx.resume().catch(() => {});
      lastFrameAt = Date.now();
    },
    isAlive: () =>
      !stopped && ctx.state !== "closed" && stream.getAudioTracks().some((t) => t.readyState === "live"),
  };
}
