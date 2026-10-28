// Browser-only: record the mic straight to WAV (mono, 16 kHz, 16-bit PCM) — the format Muse Voice
// Transcribe accepts — so the server never needs ffmpeg (not available on Vercel).
// Uses ScriptProcessorNode: deprecated but supported everywhere (incl. iOS Safari) and needs no worklet file.

const TARGET_RATE = 16_000;
export const MAX_SECONDS = 60;

export interface WavRecording {
  blob: Blob;
  seconds: number;
}

export interface Recorder {
  stop: () => Promise<WavRecording | null>;
  cancel: () => void;
}

export async function startRecording(onLevel?: (level: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let samples = 0;
  const maxSamples = MAX_SECONDS * ctx.sampleRate;

  proc.onaudioprocess = (e) => {
    if (samples >= maxSamples) return;
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    samples += data.length;
    if (onLevel) {
      let peak = 0;
      for (let i = 0; i < data.length; i += 16) peak = Math.max(peak, Math.abs(data[i]!));
      onLevel(Math.min(1, peak * 2));
    }
  };
  source.connect(proc);
  proc.connect(ctx.destination); // required for onaudioprocess to fire in some browsers (output is silent)

  const teardown = () => {
    proc.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    cancel: teardown,
    stop: async () => {
      const rate = ctx.sampleRate;
      teardown();
      if (samples < rate * 0.5) return null; // under half a second: an accidental tap
      const pcm = downsample(concat(chunks, samples), rate, TARGET_RATE);
      return { blob: encodeWav(pcm, TARGET_RATE), seconds: Math.round(samples / rate) };
    },
  };
}

function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, Math.min(c.length, total - o)), o);
    o += c.length;
    if (o >= total) break;
  }
  return out;
}

/** Box-filter downsampling (average each output window) — enough for speech. */
function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function encodeWav(pcm: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]!));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
