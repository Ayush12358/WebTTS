/**
 * Kokoro-82M synthesis worker. Runs the heavy transformers.js + onnxruntime
 * workload off the main thread so the UI never janks during synthesis.
 *
 * Protocol (engine -> worker):  { id, type: 'synthesize', text, voice, speed }
 * Protocol (worker -> engine):  { id, type: 'result',   audio: Float32Array, sampleRate }
 *                               { id, type: 'error',    message }
 *                               { id, type: 'progress', status, file, progress, loaded, total }
 *
 * The worker drives the engine's onStatus phases: 'loading' before model load,
 * per-file 'download'/'progress' events while fetching, 'ready' when the model
 * is loaded, and 'error' when a load attempt fails (the engine resets its own
 * retry state — this worker resets its model promise so a follow-up request
 * retries from scratch).
 */
import { KokoroTTS } from 'kokoro-js';
import { initTTSEnv } from './initTTSEnv.js';

initTTSEnv();

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Single in-flight request at a time (the engine serializes all generate calls
// through a promise queue), so a single active id is sufficient for progress
// attribution.
let activeRequestId = null;

let modelPromise = null;

/**
 * Lazy singleton model load inside the worker. The cached promise resets on
 * rejection so a later request retries the download/load.
 * @returns {Promise<import('kokoro-js').KokoroTTS>}
 */
function getModel() {
    if (!modelPromise) {
        modelPromise = KokoroTTS.from_pretrained(MODEL_ID, {
            dtype: 'q8',
            device: 'wasm',
            progress_callback: (p) => {
                if (activeRequestId !== null) {
                    self.postMessage({
                        id: activeRequestId,
                        type: 'progress',
                        status: p.status,
                        file: p.file ?? null,
                        progress: p.progress ?? null,
                        loaded: p.loaded ?? null,
                        total: p.total ?? null
                    });
                }
            }
        }).catch((error) => {
            modelPromise = null; // allow retry on the next request
            throw error;
        });
    }
    return modelPromise;
}

self.onmessage = async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'synthesize') return;

    const id = msg.id;
    activeRequestId = id;
    try {
        if (!modelPromise) {
            self.postMessage({ id, type: 'progress', status: 'loading', file: null, progress: null });
        }
        const tts = await getModel();
        self.postMessage({ id, type: 'progress', status: 'ready', file: null, progress: null });
        const { audio, sampling_rate: sampleRate } = await tts.generate(msg.text, {
            voice: msg.voice,
            speed: msg.speed
        });
        // Float32Array audio is transferred (zero-copy) — the engine owns it.
        self.postMessage({ id, type: 'result', audio, sampleRate }, [audio.buffer]);
    } catch (error) {
        self.postMessage({ id, type: 'error', message: error?.message || String(error) });
    } finally {
        activeRequestId = null;
    }
};
