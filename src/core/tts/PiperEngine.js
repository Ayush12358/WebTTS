import { TTSEngine } from './TTSEngine';

/**
 * Curated Piper voices (rhasspy/piper-voices ids). Listing voices must NOT load
 * any model — this list is static. Keep it small: each voice is a separate
 * ~60MB onnx model (verified: 60.3MB each on HF v1.0.0), downloaded on first
 * use.
 */
const PIPER_VOICES = [
    { id: 'en_US-lessac-medium', name: 'Lessac (US Female)', lang: 'en-US', source: 'Piper' },
    { id: 'en_US-amy-medium', name: 'Amy (US Female)', lang: 'en-US', source: 'Piper' },
    { id: 'en_GB-alan-medium', name: 'Alan (UK Male)', lang: 'en-GB', source: 'Piper' }
];

const DEFAULT_VOICE = 'en_US-lessac-medium';

/**
 * Piper neural TTS running fully on-device via piper-tts-web
 * (rhasspy/piper models + onnxruntime-web WASM).
 */
export class PiperEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Piper (On-device Neural)';
        this._enginePromise = null;
        this._voiceProvider = null;
        this._queue = Promise.resolve(); // serializes generate() so length_scale is race-free
        this._genId = 0; // generation counter — invalidates in-flight speak() on stop()
        this._source = null;
        this._audioContext = null;
    }

    async init() {
    }

    async getVoices() {
        return PIPER_VOICES;
    }

    /**
     * Lazy singleton engine load. Dynamic import keeps the heavy piper-tts-web
     * chunk (~44MB: transformers.js + onnxruntime + phonemize glue) out of the
     * main bundle (Vite code-splits it). Cached promise resets on rejection so
     * a later call retries.
     * Model/session caching: the package caches voice models in memory only
     * (FetchProvider keyed by URL — NOT Cache API), and OnnxWebRuntime caches
     * an InferenceSession per model, so each voice downloads once per page
     * session; the browser HTTP cache may serve repeats across loads.
     * @returns {Promise<import('piper-tts-web').PiperWebEngine>}
     */
    _getEngine() {
        if (!this._enginePromise) {
            this._enginePromise = import('piper-tts-web')
                .then(({ PiperWebEngine, HuggingFaceVoiceProvider }) => {
                    // Applies the native piper `length_scale` to the voice config
                    // before synthesis. piper-tts-web exposes rate only through the
                    // config JSON's `inference.length_scale`, which OnnxWebRuntime
                    // feeds to the model as the `scales` tensor (verified in package
                    // source) — true model-level rate control, not time-stretching.
                    const voiceProvider = new (class extends HuggingFaceVoiceProvider {
                        lengthScale = 1;

                        async fetch(voice) {
                            const data = await super.fetch(voice);
                            data[0].inference.length_scale = this.lengthScale;
                            return data;
                        }
                    })();
                    this._voiceProvider = voiceProvider;
                    return new PiperWebEngine({ voiceProvider });
                })
                .catch(error => {
                    this._enginePromise = null; // allow retry on next call
                    throw error;
                });
        }
        return this._enginePromise;
    }

    /**
     * Synthesize a WAV for text. Never throws — returns null on any failure.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch }
     * @returns {Promise<{file: Blob, duration: number}|null>}
     */
    async _synthesize(text, options = {}) {
        try {
            const engine = await this._getEngine();
            const voiceId = options.voiceId || DEFAULT_VOICE;
            // piper length_scale scales output duration linearly (faster = smaller).
            // ponytail: clamp defensively — slider is 0.5–2.0, so 1/rate ∈ [0.5, 2]
            const lengthScale = Math.min(2.0, Math.max(0.5, 1 / (options.rate || 1)));
            // Serialize all generate() calls: length_scale is read from the provider
            // during each generate's internal fetch, so it must be written inside
            // the same queued section to stay race-free when prefetch+speak overlap.
            const run = () => {
                this._voiceProvider.lengthScale = lengthScale;
                return engine.generate(text, voiceId, 0);
            };
            const response = await (this._queue = this._queue.then(run, run));
            return { file: response.file, duration: response.duration };
        } catch (error) {
            console.error('Piper synthesis failed:', error);
            return null;
        }
    }

    /**
     * Prefetch audio for text.
     * MUST never reject — Player stores this promise and may never consume it.
     * @param {string} text
     * @param {object} options
     * @returns {Promise<{file: Blob, duration: number}|null>}
     */
    async prefetch(text, options = {}) {
        try {
            return await this._synthesize(text, options);
        } catch {
            return null;
        }
    }

    /**
     * Speak text: synthesize (unless a matching audioObject is supplied) and
     * play through a shared AudioContext.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch, audioObject }
     * @param {object} callbacks { onStart, onEnd, onError }
     */
    async speak(text, options = {}, callbacks = {}) {
        const gen = ++this._genId;
        this._stopSource();

        const audioObject =
            options.audioObject?.file instanceof Blob
                ? options.audioObject
                : await this._synthesize(text, options);

        if (gen !== this._genId) return; // stale — stop() during synthesis

        if (!audioObject) {
            if (callbacks.onError) callbacks.onError(new Error('Piper synthesis failed'));
            return;
        }

        try {
            if (!this._audioContext) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            await this._audioContext.resume().catch(() => { }); // defensive
            if (gen !== this._genId) return;

            // WAV bytes decoded into OUR context -> buffer is context-safe
            const arrayBuffer = await audioObject.file.arrayBuffer();
            const buffer = await this._audioContext.decodeAudioData(arrayBuffer);
            if (gen !== this._genId) return;

            const source = this._audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this._audioContext.destination);
            this._source = source;

            source.onended = () => {
                if (this._source === source) this._source = null;
                if (gen === this._genId && callbacks.onEnd) callbacks.onEnd();
            };

            source.start();
            if (callbacks.onStart) callbacks.onStart();
        } catch (error) {
            console.error('Piper playback failed:', error);
            if (callbacks.onError) callbacks.onError(error);
        }
    }

    stop() {
        this._genId++; // invalidate in-flight model download / synthesis / playback
        this._stopSource();
    }

    _stopSource() {
        if (this._source) {
            try { this._source.stop(); } catch { /* already stopped */ }
            try { this._source.disconnect(); } catch { /* not connected */ }
            this._source = null;
        }
    }
    // ponytail: no pause()/resume() — no caller uses them; base-class no-ops are fine.
    // ponytail: no onBoundary emitted — no consumer anywhere; Player wires only onEnd/onError.
}
