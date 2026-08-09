import { TTSEngine } from './TTSEngine.js';
import { clampRate, estimateWordBoundaries } from './ttsUtils.js';

/**
 * Curated Kokoro-82M voices (model voice IDs). Listing voices must NOT load the
 * ~88MB model — this list is static.
 */
export const KOKORO_VOICES = [
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

export const DEFAULT_VOICE = 'af_heart';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Verified at implementation: onnx/model_quantized.onnx in the q8 ONNX repo is
// 92,361,116 bytes = 88.1 MB (the fp32 model is ~325MB — never use that figure).
const Q8_MODEL_SIZE_MB = 88.1;

/**
 * Kokoro-82M neural TTS running fully on-device via kokoro-js
 * (transformers.js + onnxruntime-web WASM). Synthesis runs in a Web Worker
 * (main-thread fallback); playback goes through a lazily created AudioContext.
 */
export class KokoroEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Kokoro (On-device Neural)';
        this._modelPromise = null; // main-thread fallback model singleton (retry-reset)
        this._queue = Promise.resolve(); // serializes generate() so prefetch+speak never overlap
        this._genId = 0; // generation counter — invalidates in-flight speak() on stop()
        this._source = null;
        this._heldSource = null; // buffer created while paused, started by resume() (no re-synthesis)
        this._audioContext = null;
        this._pauseRequested = false; // pending-pause flag: set by pause(), cleared by speak/stop/resume
        this._statusListeners = new Set();
        this._statusActive = false; // true while a loading/downloading/ready status is being shown
        this._worker = null; // synthesis worker (worker-first, main-thread fallback)
        this._workerFailed = false; // sticky — a broken worker never gets recreated
        this._workerReqId = 0;
        this._workerHandlers = new Map(); // id -> { resolve, reject }
        this._boundaryTimers = new Set();
    }

    /**
     * Subscribe to engine-setup status (model load/download progress).
     * @param {(status: {phase: 'loading'|'downloading'|'ready'|'error'|'idle', progress: number|null, message: string}) => void} callback
     * @returns {() => void} unsubscribe
     */
    onStatus(callback) {
        this._statusListeners.add(callback);
        return () => this._statusListeners.delete(callback);
    }

    _emitStatus(status) {
        // Listeners are UI-only — a throwing listener must never break synthesis.
        for (const listener of this._statusListeners) {
            try {
                listener(status);
            } catch (error) {
                console.error('Kokoro status listener failed:', error);
            }
        }
        this._statusActive = status.phase === 'loading' || status.phase === 'downloading' || status.phase === 'ready';
    }

    async init() {
    }

    async getVoices() {
        return KOKORO_VOICES;
    }

    /**
     * Map a transformers.js progress_callback event to onStatus phases.
     * 'initiate' opens a file (0%), 'download'/'progress' stream per-chunk
     * progress; 'done'/'ready' are handled by the caller so the final 'ready'
     * phase fires exactly once per load.
     */
    _relayModelProgress(p) {
        const { status, file, loaded, total } = p;
        if (status === 'initiate') {
            const mb = ((total ?? 0) / 1048576).toFixed(1);
            this._emitStatus({ phase: 'downloading', progress: 0, message: `Downloading ${file} (${mb} MB) — 0%` });
        } else if (status === 'download' || status === 'progress') {
            const mb = ((total ?? 0) / 1048576).toFixed(1);
            const pct = total ? Math.round((loaded / total) * 100) : null;
            this._emitStatus({
                phase: 'downloading',
                progress: total ? loaded / total : null,
                message: total ? `Downloading ${file} (${mb} MB) — ${pct}%` : `Downloading ${file} (${mb} MB)`
            });
        }
    }

    /**
     * Lazy singleton model load for the MAIN-THREAD fallback path. The dynamic
     * imports keep the heavy transformers.js chunk out of the main bundle (Vite
     * code-splits it). initTTSEnv() is the shared wasmPaths/browser-cache setup
     * used by BOTH synthesis paths. The cached promise resets on rejection so a
     * later call retries the download.
     * @returns {Promise<import('kokoro-js').KokoroTTS>}
     */
    _getModel() {
        if (!this._modelPromise) {
            this._emitStatus({ phase: 'loading', progress: null, message: 'Preparing Kokoro engine…' });
            this._modelPromise = (async () => {
                const [{ initTTSEnv }, { KokoroTTS }] = await Promise.all([
                    import('./initTTSEnv'),
                    import('kokoro-js')
                ]);
                initTTSEnv();
                return KokoroTTS.from_pretrained(MODEL_ID, {
                    dtype: 'q8',
                    device: 'wasm',
                    progress_callback: (p) => this._relayModelProgress(p)
                });
            })()
                .then(tts => {
                    this._emitStatus({ phase: 'ready', progress: null, message: 'Voice ready' });
                    return tts;
                })
                .catch(error => {
                    this._modelPromise = null; // allow retry on next call
                    this._emitStatus({ phase: 'error', progress: null, message: error?.message || 'Kokoro model load failed' });
                    throw error;
                });
        }
        return this._modelPromise;
    }

    /**
     * Lazily create the synthesis worker. Returns null (and never retries) when
     * workers are unavailable or a worker errored at load — the caller falls
     * back to main-thread synthesis.
     */
    _ensureWorker() {
        if (this._workerFailed) return null;
        if (this._worker) return this._worker;
        if (typeof Worker === 'undefined' || typeof window === 'undefined') return null;
        try {
            const worker = new Worker(new URL('./kokoro.worker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (event) => this._handleWorkerMessage(event.data);
            worker.onerror = (event) => {
                console.error('Kokoro worker failed:', event?.message || event);
                this._workerFailed = true;
                this._failWorkerHandlers(new Error('Kokoro worker failed'));
                worker.terminate();
                this._worker = null;
            };
            this._worker = worker;
            return worker;
        } catch (error) {
            console.error('Kokoro worker creation failed:', error);
            this._workerFailed = true;
            return null;
        }
    }

    _handleWorkerMessage(msg) {
        if (!msg || typeof msg.id !== 'number') return;
        if (msg.type === 'progress') {
            this._handleWorkerProgress(msg);
            return;
        }
        const handler = this._workerHandlers.get(msg.id);
        if (!handler) return; // stale — request was cancelled by stop() or superseded
        this._workerHandlers.delete(msg.id);
        if (msg.type === 'result' && msg.audio instanceof Float32Array) {
            handler.resolve({ audio: msg.audio, sampleRate: msg.sampleRate });
        } else if (msg.type === 'error') {
            console.error('Kokoro worker synthesis error:', msg.message);
            handler.reject(new Error(msg.message || 'Kokoro synthesis failed'));
        } else {
            handler.reject(new Error('Unexpected Kokoro worker message: ' + msg.type));
        }
    }

    _handleWorkerProgress(msg) {
        if (msg.status === 'loading') {
            this._emitStatus({ phase: 'loading', progress: null, message: 'Preparing Kokoro engine…' });
        } else if (msg.status === 'ready') {
            this._emitStatus({ phase: 'ready', progress: null, message: 'Voice ready' });
        } else if (msg.status === 'error') {
            this._emitStatus({ phase: 'error', progress: null, message: msg.message || 'Kokoro model load failed' });
        } else {
            this._relayModelProgress(msg);
        }
    }

    _workerRequest(worker, payload) {
        return new Promise((resolve, reject) => {
            const id = ++this._workerReqId;
            const handler = { resolve, reject };
            this._workerHandlers.set(id, handler);
            worker.postMessage({ id, type: 'synthesize', text: payload.text, voice: payload.voice, speed: payload.speed });
        });
    }

    _failWorkerHandlers(error) {
        const handlers = [...this._workerHandlers.values()];
        this._workerHandlers.clear();
        for (const handler of handlers) handler.reject(error);
    }

    _cancelWorkerJobs() {
        const cancelError = new Error('stopped');
        cancelError.cancelled = true;
        this._failWorkerHandlers(cancelError);
    }

    /**
     * Main-thread fallback synthesis (prior-art path). Never throws — returns
     * null on any failure. pitch is accepted and ignored — kokoro-js has no
     * pitch parameter.
     * @param {string} text
     * @param {object} options
     * @param {number} speed
     * @returns {Promise<{audio: Float32Array, sampleRate: number}|null>}
     */
    async _mainThreadSynthesize(text, options, speed) {
        try {
            const tts = await this._getModel();
            const result = await tts.generate(text, {
                voice: options.voiceId || DEFAULT_VOICE,
                speed
            });
            // transformers.js RawAudio: { audio: Float32Array, sampling_rate: number }
            return { audio: result.audio, sampleRate: result.sampling_rate };
        } catch (error) {
            console.error('Kokoro synthesis failed:', error);
            return null;
        }
    }

    /**
     * Worker-first synthesis with main-thread fallback. Never throws — returns
     * {audio, sampleRate} or null.
     * @param {string} text
     * @param {object} options { voiceId, rate }
     * @returns {Promise<{audio: Float32Array, sampleRate: number}|null>}
     */
    async _synthesizeSerialized(text, options) {
        const speed = clampRate(options.rate || 1);
        const worker = this._ensureWorker();
        if (worker) {
            try {
                return await this._workerRequest(worker, { text, voice: options.voiceId || DEFAULT_VOICE, speed });
            } catch (error) {
                // Synthesis failed in the worker (e.g. blocked model URL). If the
                // worker itself is broken, fall back to the main thread; a plain
                // synthesis error emits the 'error' phase and yields null
                // (speak() reports via onError). Intentional stop() cancels are
                // silent.
                if (this._workerFailed) return this._mainThreadSynthesize(text, options, speed);
                if (!error.cancelled) {
                    this._emitStatus({ phase: 'error', progress: null, message: error?.message || 'Kokoro synthesis failed' });
                }
                return null;
            }
        }
        return this._mainThreadSynthesize(text, options, speed);
    }

    /**
     * Serialized synthesis: all generate calls (prefetch + speak) run through a
     * promise queue so two generations never overlap (memory + shared-state
     * races). Never throws — returns null on any failure.
     * @param {string} text
     * @param {object} options
     * @returns {Promise<{audio: Float32Array, sampleRate: number}|null>}
     */
    async _synthesize(text, options = {}) {
        const run = () => this._synthesizeSerialized(text, options);
        try {
            return await (this._queue = this._queue.then(run, run));
        } catch (error) {
            console.error('Kokoro synthesis failed:', error);
            return null;
        }
    }

    /**
     * Prefetch audio for text.
     * MUST never reject — Player stores this promise and may never consume it.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch }
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
     * play through a shared AudioContext, emitting estimated word boundaries.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch, audioObject }
     * @param {object} callbacks { onStart, onEnd, onError, onBoundary }
     */
    async speak(text, options = {}, callbacks = {}) {
        // Entry gen guard: a fresh speak must stop the previous generation's
        // source, clear any pending-pause flag, and stop/clear any held source —
        // a hold belongs to a previous generation and must never outlive a fresh
        // speak, otherwise tap-while-paused leaves the flag set and the next
        // speak holds its buffer forever ("playing" UI with no audio).
        const gen = ++this._genId;
        this._stopSource();
        this._pauseRequested = false;
        this._stopHeldSource();

        const audioObject =
            options.audioObject?.audio instanceof Float32Array && typeof options.audioObject.sampleRate === 'number'
                ? options.audioObject
                : await this._synthesize(text, options);

        if (gen !== this._genId) return; // stale — stop()/new speak during synthesis

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

            const durationMs = (pcm.length / sampleRate) * 1000;
            const boundaries = estimateWordBoundaries(text, durationMs);

            // Pending-pause hold: pause() arrived while synthesis was in flight,
            // so the buffer is created but NOT started; resume() starts it from
            // the beginning (replay-from-start WITHOUT re-synthesis).
            if (this._pauseRequested) {
                this._heldSource = {
                    source,
                    boundaries,
                    durationMs,
                    gen,
                    callbacks
                };
                return;
            }

            this._startPlaybackSource({ source, boundaries, durationMs, gen, callbacks });
        } catch (error) {
            console.error('Kokoro playback failed:', error);
            if (callbacks.onError) callbacks.onError(error);
        }
    }

    /**
     * Start a BufferSource and schedule its word boundaries. Boundary timers are
     * anchored at performance.now() at the moment source.start() runs — never
     * precomputed at speak-time, so a held source resumed after a pause keeps
     * every boundary aligned with the actual audio start.
     */
    _startPlaybackSource({ source, boundaries, durationMs, gen, callbacks }) {
        this._source = source;
        source.onended = () => {
            if (this._source === source) this._source = null;
            if (gen === this._genId && callbacks.onEnd) callbacks.onEnd();
        };
        const anchorTimeMs = performance.now();
        source.start();
        if (callbacks.onStart) callbacks.onStart();
        this._scheduleBoundaries(boundaries, durationMs, gen, callbacks, anchorTimeMs);
    }

    /**
     * Fire-and-forget word-boundary events via setTimeout, using the same
     * proportional timing model as estimateWordBoundaries (char-length share of
     * the total non-space chars × durationMs), anchored at the actual start.
     * Stale generations drop their events. Kept timers are cleared by stop().
     */
    _scheduleBoundaries(boundaries, durationMs, gen, callbacks, anchorTimeMs) {
        if (!callbacks.onBoundary || !boundaries.length) return;
        const totalChars = boundaries.reduce((sum, b) => sum + b.charLength, 0);
        const msPerChar = durationMs / totalChars;
        let elapsed = 0;
        boundaries.forEach((boundary, i) => {
            const atMs = anchorTimeMs + elapsed;
            const timer = setTimeout(() => {
                this._boundaryTimers.delete(timer);
                if (gen === this._genId && callbacks.onBoundary) {
                    callbacks.onBoundary({
                        charIndex: boundary.charIndex,
                        charLength: boundary.charLength,
                        name: 'word'
                    });
                }
            }, Math.max(0, atMs - performance.now()));
            this._boundaryTimers.add(timer);
            // The last word gets the remaining time so events never overshoot.
            const wordMs = i === boundaries.length - 1 ? Math.max(0, durationMs - elapsed) : boundary.charLength * msPerChar;
            elapsed += wordMs;
        });
    }

    stop() {
        this._genId++; // invalidate in-flight model download / synthesis / playback
        this._stopSource();
        this._pauseRequested = false; // a hold must NOT survive stop (see _stopHeldSource)
        this._stopHeldSource();
        this._cancelWorkerJobs();
        this._clearBoundaryTimers();
        if (this._statusActive) {
            this._statusActive = false;
            this._emitStatus({ phase: 'idle', progress: null, message: 'Stopped' });
        }
    }

    _stopSource() {
        if (this._source) {
            try { this._source.stop(); } catch { /* already stopped */ }
            try { this._source.disconnect(); } catch { /* not connected */ }
            this._source = null;
        }
    }

    /**
     * Stop + disconnect a held (paused-before-start) source. The hold belongs to
     * the generation that created it; a fresh speak/stop must clear it.
     */
    _stopHeldSource() {
        if (this._heldSource) {
            try { this._heldSource.source.stop(); } catch { /* already stopped */ }
            try { this._heldSource.source.disconnect(); } catch { /* not connected */ }
            this._heldSource = null;
        }
    }

    pause() {
        // Pending-pause flag: a bare suspend is a no-op while synthesis is in
        // flight — without the flag, audio would start DURING pause and the
        // 'replay from start' behavior would be unachievable.
        this._pauseRequested = true;
        this._audioContext?.suspend().catch(() => { });
    }

    resume() {
        this._audioContext?.resume().catch(() => { });
        this._pauseRequested = false;
        // A held source starts from the beginning (replay-from-start WITHOUT
        // re-synthesis). Its boundary offsets are recomputed against the actual
        // start moment, so a pause-during-synthesis → resume cycle stays aligned.
        if (this._heldSource) {
            const held = this._heldSource;
            this._heldSource = null;
            this._startPlaybackSource(held);
        }
    }

    /**
     * Create + resume the AudioContext synchronously — callable from a user
     * gesture handler (iOS requires the context to be created/resumed inside a
     * gesture before async synthesis completes).
     */
    warmAudio() {
        if (!this._audioContext) {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        this._audioContext.resume().catch(() => { });
    }

    _clearBoundaryTimers() {
        for (const timer of this._boundaryTimers) clearTimeout(timer);
        this._boundaryTimers.clear();
    }

    /**
     * Model management info. downloaded is a Cache Storage check of the
     * transformers cache entries (quota-blocked persistence reports false).
     * @returns {Promise<{sizeMB: number, downloaded: boolean}>}
     */
    async getModelInfo() {
        let downloaded = false;
        try {
            if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                for (const name of keys.filter(key => key.includes('transformers'))) {
                    const cache = await caches.open(name);
                    const requests = await cache.keys();
                    if (requests.some(request => /model.*\.onnx$/i.test(new URL(request.url).pathname))) {
                        downloaded = true;
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Kokoro cache check failed:', error);
        }
        return { sizeMB: Q8_MODEL_SIZE_MB, downloaded };
    }

    /**
     * Remove the downloaded model from the Cache API. The transformers.js cache
     * name is 'transformers-cache' (verified in the installed v3.8.1 source);
     * delete any cache whose name includes 'transformers' as a fallback.
     */
    async deleteCachedModel() {
        if (typeof caches === 'undefined') return;
        const keys = await caches.keys();
        for (const name of keys) {
            if (name.includes('transformers')) {
                await caches.delete(name);
            }
        }
    }
}
