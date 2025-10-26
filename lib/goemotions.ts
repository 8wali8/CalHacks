let _pipePromise: Promise<any> | null = null;
let _pipeReady = false;

export type Emotion = { label: string; score: number };

export const isGoEmotionsReady = () => _pipeReady;

export async function initGoEmotions() {
  if (_pipePromise) return _pipePromise;

  if (typeof window === 'undefined') {
    throw new Error('GoEmotions pipeline is browser-only');
  }

  _pipePromise = (async () => {
    const { pipeline, env } = await import('@xenova/transformers');

    // Browser/WASM tuning
    env.useBrowserCache = true;
    env.allowLocalModels = false;
    env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.14.0/dist/';
    env.backends.onnx.wasm.simd = true;
    env.backends.onnx.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);

    const token = process.env.NEXT_PUBLIC_HUGGINGFACE_TOKEN;
    if (token) {
      // @ts-ignore - runtime property used by transformers.js
      env.HF_TOKEN = token;
    }

    const pipe = await pipeline('text-classification', 'MicahB/roberta-base-go_emotions', {
      topk: null,
      quantized: true,
    });

    await pipe('ok'); // warm-up
    _pipeReady = true;
    return pipe;
  })();

  try {
    return await _pipePromise;
  } catch (error) {
    _pipePromise = null;
    _pipeReady = false;
    throw error;
  }
}

export async function classifyGoEmotions(
  text: string,
  threshold = 0.35,
  topK = 3
): Promise<Emotion[]> {
  if (!text?.trim()) return [];

  const pipe = await initGoEmotions();
  const raw = (await pipe(text)) as Emotion[];

  const sorted = [...raw].sort((a, b) => b.score - a.score);
  const picked: Emotion[] = [];

  for (const emotion of sorted) {
    if (emotion.score >= threshold) {
      picked.push(emotion);
    }
  }

  for (let i = 0; i < Math.min(topK, sorted.length); i++) {
    const emotion = sorted[i];
    if (!picked.find((p) => p.label === emotion.label)) {
      picked.push(emotion);
    }
  }

  return picked;
}
