import { env, pipeline } from '@xenova/transformers';

let transcriber: unknown = null;

type WorkerRequest =
  | { type: 'load'; modelId: string }
  | { type: 'transcribe'; audio: ArrayBuffer; language?: string };

type ProgressInfo = {
  status?: string;
  file?: string;
  loaded?: number;
  total?: number;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'load') {
    await loadModel(event.data.modelId);
    return;
  }

  if (event.data.type === 'transcribe') {
    await transcribe(event.data.audio, event.data.language);
  }
};

const loadModel = async (modelId: string): Promise<void> => {
  try {
    env.backends.onnx.wasm.numThreads = 1;

    const fileDoneBytes = new Map<string, number>();
    let totalDone = 0;
    let totalEstimate = 0;

    transcriber = await pipeline('automatic-speech-recognition', modelId, {
      progress_callback: (info: ProgressInfo) => {
        if (info.status !== 'progress' || !info.file) return;

        const previousDone = fileDoneBytes.get(info.file) ?? 0;
        const currentDone = info.loaded ?? 0;
        const delta = Math.max(0, currentDone - previousDone);
        fileDoneBytes.set(info.file, currentDone);
        totalDone += delta;

        if (info.total && info.total > totalEstimate) {
          totalEstimate = info.total;
        }

        const effectiveTotal = Math.max(totalEstimate, totalDone);
        const progress = effectiveTotal > 0 ? Math.min(100, Math.round((totalDone / effectiveTotal) * 100)) : 0;
        self.postMessage({ type: 'progress', progress });
      },
    });

    self.postMessage({ type: 'loaded' });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Failed to load model' });
  }
};

const transcribe = async (audio: ArrayBuffer, language?: string): Promise<void> => {
  if (!transcriber) {
    self.postMessage({ type: 'error', error: 'Model not loaded' });
    return;
  }

  try {
    const samples = new Float32Array(audio);
    if (samples.length === 0) {
      self.postMessage({ type: 'error', error: 'Empty audio received' });
      return;
    }

    const pipelineFn = transcriber as (
      input: Float32Array,
      options?: Record<string, unknown>,
    ) => Promise<{ text?: string }>;

    const result = await pipelineFn(samples, {
      task: 'transcribe',
      ...(language ? { language } : {}),
    });

    self.postMessage({ type: 'result', transcript: (result.text ?? '').trim() });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Transcription failed' });
  }
};
