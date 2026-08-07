import { TTSEngine } from './TTSEngine';

/**
 * Curated Kokoro-82M voices (model voice IDs). Listing voices must NOT load the
 * ~80MB model — this list is static.
 */
const KOKORO_VOICES = [
    { id: 'af_heart', name: 'Heart (US Female)', lang: 'en-US', source: 'Kokoro' },
    { id: 'af_bella', name: 'Bella (US Female)', lang: 'en-US', source: 'Kokoro' },
    { id: 'af_nicole', name: 'Nicole (US Female)', lang: 'en-US', source: 'Kokoro' },
    { id: 'af_sarah', name: 'Sarah (US Female)', lang: 'en-US', source: 'Kokoro' },
    { id: 'am_michael', name: 'Michael (US Male)', lang: 'en-US', source: 'Kokoro' },
    { id: 'am_puck', name: 'Puck (US Male)', lang: 'en-US', source: 'Kokoro' },
    { id: 'bf_emma', name: 'Emma (UK Female)', lang: 'en-GB', source: 'Kokoro' },
    { id: 'bf_isabella', name: 'Isabella (UK Female)', lang: 'en-GB', source: 'Kokoro' },
    { id: 'bm_george', name: 'George (UK Male)', lang: 'en-GB', source: 'Kokoro' },
    { id: 'bm_lewis', name: 'Lewis (UK Male)', lang: 'en-GB', source: 'Kokoro' }
];

const DEFAULT_VOICE = 'af_heart';

/**
 * Kokoro-82M neural TTS running fully on-device via kokoro-js
 * (transformers.js + onnxruntime-web WASM).
 */
export class KokoroEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Kokoro (On-device Neural)';
        this._modelPromise = null;
        this._genId = 0; // generation counter — invalidates in-flight speak() on stop()
        this._source = null;
        this._audioContext = null;
    }

    async init() {
    }

    async getVoices() {
        return KOKORO_VOICES;
    }

    /**
     * Lazy singleton model load. Dynamic import keeps the heavy transformers.js
     * chunk out of the main bundle (Vite code-splits it). Cached promise resets
     * on rejection so a later call retries.
     * @returns {Promise<import('kokoro-js').KokoroTTS>}
     */
    _getModel() {
        if (!this._modelPromise) {
            this._modelPromise = import('kokoro-js')
                .then(({ KokoroTTS }) => {
                    // transformers.js v3 defaults wasmPaths to the version-matched
                    // jsdelivr CDN; the local ort-wasm copy is dropped from the build
                    // (vite.config.js) since it is never fetched.
                    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                        dtype: 'q8',
                        device: 'wasm',
                        progress_callback: p => console.log('[Kokoro]', p.status, p.file, p.progress)
                    });
                })
                .catch(error => {
                    this._modelPromise = null; // allow retry on next call
                    throw error;
                });
        }
        return this._modelPromise;
    }

    /**
     * Synthesize PCM for text. Never throws — returns null on any failure.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch }
     * @returns {Promise<{audio: Float32Array, sampleRate: number}|null>}
     */
    async _synthesize(text, options = {}) {
        try {
            const tts = await this._getModel();
            const result = await tts.generate(text, {
                voice: options.voiceId || DEFAULT_VOICE,
                // ponytail: heuristic clamp; model is trained near speed 1.0
                speed: Math.min(2.0, Math.max(0.7, options.rate || 1.0))
                // pitch accepted and ignored — kokoro-js has no pitch parameter
            });
            // transformers.js RawAudio: { audio: Float32Array, sampling_rate: number }
            return { audio: result.audio, sampleRate: result.sampling_rate };
        } catch (error) {
            console.error('Kokoro synthesis failed:', error);
            return null;
        }
    }

    /**
     * Prefetch audio for text.
     * MUST never reject — Player stores this promise and may never consume it.
     * @param {string} text
     * @param {object} options
     * @returns {Promise<{audio: Float32Array, sampleRate: number}|null>}
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
            options.audioObject?.audio instanceof Float32Array && typeof options.audioObject.sampleRate === 'number'
                ? options.audioObject
                : await this._synthesize(text, options);

        if (gen !== this._genId) return; // stale — stop() during synthesis

        if (!audioObject) {
            if (callbacks.onError) callbacks.onError(new Error('Kokoro synthesis failed'));
            return;
        }

        try {
            if (!this._audioContext) {
                this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            await this._audioContext.resume().catch(() => { }); // defensive
            if (gen !== this._genId) return;

            const { audio: pcm, sampleRate } = audioObject;
            // Never play a buffer created by another context
            const buffer = this._audioContext.createBuffer(1, pcm.length, sampleRate);
            buffer.copyToChannel(pcm, 0);
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
            console.error('Kokoro playback failed:', error);
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
