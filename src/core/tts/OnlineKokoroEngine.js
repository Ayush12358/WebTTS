import { TTSEngine } from './TTSEngine.js';
import { clampRate, estimateWordBoundaries, KOKORO_VOICES, DEFAULT_VOICE } from './ttsUtils.js';

const DEEPINFRA_ENDPOINT = 'https://api.deepinfra.com/v1/audio/speech';
// Free pool: keyless community HF Spaces, all OpenAI-compatible
// /v1/audio/speech (mp3 out). Warm 3–8s, cold starts up to ~100s; any may
// sleep or rate-limit at any time — requests round-robin and fail over.
// If one dies, delete its line (or add a DeepInfra key for the reliable path).
export const FREE_ENDPOINTS = [
    'https://Remsky-FastKoko.hf.space/v1/audio/speech',
    'https://willhuo-kokoro-fastapi-test.hf.space/v1/audio/speech',
    'https://or3o-kokoro-fastapi.hf.space/v1/audio/speech'
];
const MODEL = 'hexgrad/Kokoro-82M';
const FREE_ERROR_MESSAGE = 'Free Kokoro space is unreachable or asleep — retry in a moment, or add a DeepInfra key in Settings for reliable playback';

/**
 * Kokoro-82M TTS via a hosted API (same curated voice set as the on-device
 * engine, no ~88MB model download). Free by default: without a key, synthesis goes
 * to a keyless community HF Space pool (round-robin with failover) — slow,
 * with occasional cold starts. Optional: a per-user DeepInfra API key, set at
 * runtime via setApiKey() from Settings and stored only in IndexedDB (it never
 * ships in the bundle), switches to DeepInfra for fast, reliable playback.
 * Playback goes through a lazily created AudioContext (same model as
 * KokoroEngine); synthesis is a POST to /v1/audio/speech returning raw mp3.
 */
export class OnlineKokoroEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Kokoro (Online)';
        this._apiKey = '';
        this._rrIndex = 0; // round-robin pointer into FREE_ENDPOINTS
        this._cooldowns = new Map(); // url -> cooldown expiry (ms)
        this._genId = 0; // generation counter — invalidates in-flight speak() on stop()
        this._abortController = null; // per-request, so stop() aborts in-flight fetches
        this._source = null;
        this._audioContext = null;
        this._pauseRequested = false;
        this._heldAudio = null; // buffer synthesized while paused; started by resume() (no re-synthesis)
        this._boundaryTimers = new Set();
        this._boundaryState = null; // { boundaries, durationMs, anchorTimeMs, gen, callbacks, wordStartTimes } for pause/resume re-anchoring
    }

    /**
     * Set the DeepInfra API key (Settings persists it to IndexedDB).
     * @param {string} key
     */
    setApiKey(key) {
        this._apiKey = String(key ?? '').trim();
    }

    async getVoices() {
        return KOKORO_VOICES;
    }

    /**
     * Lazily create the shared AudioContext (never callable without a window —
     * tests inject `_audioContext` directly).
     * @returns {AudioContext}
     */
    _getAudioContext() {
        if (!this._audioContext) {
            this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._audioContext;
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

    /**
     * Next pool endpoint not in cooldown, wrapping once; advances the
     * round-robin pointer past it. Returns null when every endpoint is cooling.
     * @returns {string|null}
     */
    _pickEndpoint() {
        const now = Date.now();
        for (let i = 0; i < FREE_ENDPOINTS.length; i++) {
            const index = (this._rrIndex + i) % FREE_ENDPOINTS.length;
            const url = FREE_ENDPOINTS[index];
            const cooldown = this._cooldowns.get(url);
            if (cooldown === undefined || cooldown <= now) {
                this._rrIndex = (index + 1) % FREE_ENDPOINTS.length;
                return url;
            }
        }
        return null;
    }

    /**
     * Rest a failed endpoint before the next request tries it again.
     * @param {string} url
     */
    _markCooldown(url) {
        // ponytail: uniform 60s cooldown; bump if a space rate-limits harder
        this._cooldowns.set(url, Date.now() + 60_000);
    }

    /**
     * Synthesize text through the hosted speech API (DeepInfra with a key, the
     * free HF Space pool without) and decode the returned mp3 into a mono
     * Float32Array. Throws on any failure; a stop() during the request — or a
     * 120s timeout on a hung space — surfaces as an Error with
     * `.cancelled === true` (AbortError).
     * pitch is accepted and ignored — the Kokoro API has no pitch parameter
     * (parity with the on-device engine).
     * @param {string} text
     * @param {object} options { voiceId, rate }
     * @returns {Promise<{audio: Float32Array, sampleRate: number}>}
     */
    async _synthesize(text, options = {}) {
        const body = {
            input: text,
            voice: options.voiceId || DEFAULT_VOICE,
            response_format: 'mp3',
            speed: clampRate(options.rate || 1) // clampRate gives [0.7, 2.0], inside DeepInfra's 0.25–4 range
        };
        if (this._apiKey) {
            // DeepInfra routes by model name; the free pool rejects any
            // model value (400 invalid_model) — send it only on the keyed path.
            body.model = MODEL;
            return this._request(DEEPINFRA_ENDPOINT, body, this._apiKey);
        }
        // Free pool: try endpoints round-robin, cooling each one that fails
        // (network error, non-ok status, decode failure) and moving on.
        const attempted = new Set();
        while (true) {
            const endpoint = this._pickEndpoint();
            if (!endpoint || attempted.has(endpoint)) break; // all tried or all cooling
            attempted.add(endpoint);
            try {
                return await this._request(endpoint, body, null);
            } catch (error) {
                if (error?.cancelled) throw error; // user stopped — never rotate on stop
                this._markCooldown(endpoint); // failed once: rest it, try the next
            }
        }
        throw new Error(FREE_ERROR_MESSAGE);
    }

    /**
     * One POST to a speech endpoint, decode to mono Float32Array. Throws on
     * any failure; stop()/timeout abort surfaces with `.cancelled === true`.
     * @param {string} endpoint
     * @param {object} body — JSON body (model field added by the caller when keyed)
     * @param {string|null} apiKey — null for the free pool
     * @returns {Promise<{audio: Float32Array, sampleRate: number}>}
     */
    async _request(endpoint, body, apiKey) {
        const controller = new AbortController();
        this._abortController = controller;
        // Guard against a hung space stalling the player: 120s covers the
        // ~98s cold start. A timeout abort is just a silent .cancelled failure
        // (same path stop() uses — both abort the same controller).
        const timeout = setTimeout(() => controller.abort(), 120_000);
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal
            });
            if (!response.ok) {
                if (apiKey && (response.status === 401 || response.status === 403)) {
                    throw new Error(`DeepInfra rejected your API key (HTTP ${response.status}) — check the key in Settings`);
                }
                throw new Error(apiKey
                    ? `DeepInfra request failed (HTTP ${response.status})`
                    : `HTTP ${response.status}`); // pool loop decides what to do
            }
            const arrayBuffer = await response.arrayBuffer();
            const context = this._getAudioContext();
            const audioBuffer = await context.decodeAudioData(arrayBuffer);
            const sampleRate = audioBuffer.sampleRate;
            const length = audioBuffer.length;
            const channels = audioBuffer.numberOfChannels;
            const audio = new Float32Array(length);
            if (channels === 1) {
                audioBuffer.copyFromChannel(audio, 0);
            } else {
                // Mono downmix: average all channels.
                const channel = new Float32Array(length);
                for (let ch = 0; ch < channels; ch++) {
                    audioBuffer.copyFromChannel(channel, ch);
                    for (let i = 0; i < length; i++) audio[i] += channel[i];
                }
                for (let i = 0; i < length; i++) audio[i] /= channels;
            }
            return { audio, sampleRate };
        } catch (error) {
            if (error && error.name === 'AbortError') error.cancelled = true;
            throw error;
        } finally {
            clearTimeout(timeout);
            if (this._abortController === controller) this._abortController = null;
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
        } catch (error) {
            // Intentional stop() cancels are silent; genuine failures log.
            if (!error?.cancelled) console.error('Online Kokoro prefetch failed:', error);
            return null;
        }
    }

    /**
     * Speak text: synthesize via the hosted API (unless a matching audioObject is
     * supplied) and play through a shared AudioContext, emitting estimated
     * word boundaries.
     * @param {string} text
     * @param {object} options { voiceId, rate, pitch, audioObject }
     * @param {object} callbacks { onStart, onEnd, onError, onBoundary }
     */
    async speak(text, options = {}, callbacks = {}) {
        // Entry gen guard: a fresh speak stops the previous generation's
        // source and drops its boundaries. _pauseRequested is intentionally
        // NOT cleared here — a pause that lands while synthesis is in flight
        // must hold the result (see _heldAudio below) instead of playing
        // under a paused UI. stop()/resume() clear the flag on their paths.
        const gen = ++this._genId;
        this._stopSource();
        this._clearBoundaryState();

        let audioObject;
        if (options.audioObject?.audio instanceof Float32Array && typeof options.audioObject.sampleRate === 'number') {
            audioObject = options.audioObject;
        } else {
            try {
                audioObject = await this._synthesize(text, options);
            } catch (error) {
                // Intentional stop() cancels are silent; genuine failures reach onError.
                if (!error?.cancelled && callbacks.onError) callbacks.onError(error);
                return;
            }
        }

        if (gen !== this._genId) return; // stale — stop()/new speak during synthesis

        // Pause landed while the request was in flight: hold the buffer and
        // keep the context suspended. resume() starts it from the beginning
        // (replay-from-start WITHOUT re-synthesis).
        if (this._pauseRequested) {
            this._heldAudio = { audioObject, text, callbacks, gen };
            return;
        }

        await this._playBuffer(audioObject, text, callbacks, gen);
    }

    /**
     * Play a synthesized buffer through the shared AudioContext and schedule
     * its word boundaries. Self-contained (stops any previous source, drops
     * stale boundary state) so it is safe to call from speak() and from
     * resume() for held-audio replay. Playback failures surface via onError.
     */
    async _playBuffer(audioObject, text, callbacks, gen) {
        this._stopSource();
        this._clearBoundaryState();
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

            this._source = source;
            source.onended = () => {
                if (this._source === source) this._source = null;
                this._clearBoundaryTimers();
                this._clearBoundaryState();
                // stop() bumps gen before stopping the source, so intentional
                // stops never fire onEnd.
                if (gen === this._genId && callbacks.onEnd) callbacks.onEnd();
            };
            // Boundary timers are anchored at the moment source.start() runs —
            // never precomputed at speak-time, so a pause/resume cycle keeps
            // every boundary aligned with the actual audio start.
            const anchorTimeMs = performance.now();
            source.start();
            if (callbacks.onStart) callbacks.onStart();
            this._scheduleBoundaries(boundaries, durationMs, anchorTimeMs, gen, callbacks);
        } catch (error) {
            console.error('Online Kokoro playback failed:', error);
            if (callbacks.onError) callbacks.onError(error);
        }
    }

    /**
     * Fire-and-forget word-boundary events via setTimeout, using the same
     * proportional timing model as estimateWordBoundaries (char-length share of
     * the total non-space chars × durationMs), anchored at the actual start.
     * Stale generations drop their events. The scheduling state is kept so
     * resume() can re-anchor the not-yet-fired boundaries after a suspend.
     */
    _scheduleBoundaries(boundaries, durationMs, anchorTimeMs, gen, callbacks) {
        const totalChars = boundaries.reduce((sum, b) => sum + b.charLength, 0);
        const msPerChar = durationMs / totalChars;
        const wordStartTimes = [];
        let elapsed = 0;
        boundaries.forEach((boundary, i) => {
            wordStartTimes.push(anchorTimeMs + elapsed);
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
        this._boundaryState = { boundaries, durationMs, anchorTimeMs, gen, callbacks, wordStartTimes };
    }

    _clearBoundaryTimers() {
        for (const timer of this._boundaryTimers) clearTimeout(timer);
        this._boundaryTimers.clear();
    }

    _clearBoundaryState() {
        this._boundaryState = null;
    }

    /**
     * Stop playback and cancel any in-flight synthesis. Intentional stops are
     * silent: the gen bump invalidates speak() callbacks and the abort makes
     * pending fetches fail with `.cancelled` errors that never reach onError.
     */
    stop() {
        this._genId++; // invalidate in-flight fetch / decode / playback
        this._abortController?.abort();
        this._stopSource();
        this._pauseRequested = false;
        this._heldAudio = null; // a hold must NOT survive stop
        this._clearBoundaryTimers();
        this._clearBoundaryState();
    }

    _stopSource() {
        if (this._source) {
            try { this._source.stop(); } catch { /* already stopped */ }
            try { this._source.disconnect(); } catch { /* not connected */ }
            this._source = null;
        }
    }

    pause() {
        this._pauseRequested = true;
        this._audioContext?.suspend().catch(() => { });
        // Boundaries are diagnostics — while suspended they must stop firing.
        this._clearBoundaryTimers();
    }

    resume() {
        this._pauseRequested = false;
        this._audioContext?.resume().catch(() => { });
        // A buffer held while paused starts from the beginning (replay-from-
        // start WITHOUT re-synthesis); _playBuffer re-anchors its boundaries
        // against the actual start.
        if (this._heldAudio) {
            const held = this._heldAudio;
            this._heldAudio = null;
            this._playBuffer(held.audioObject, held.text, held.callbacks, this._genId);
            return;
        }
        // Re-anchor the word boundaries whose time has not yet passed, against
        // the original playback start. suspend() freezes the AudioContext clock,
        // so the same source continues and only the timers need rescheduling.
        const state = this._boundaryState;
        if (!state || !this._source) return;
        const elapsed = performance.now() - state.anchorTimeMs;
        state.boundaries.forEach((boundary, i) => {
            const atMs = state.wordStartTimes[i];
            if (atMs <= state.anchorTimeMs + elapsed) return; // already fired
            const timer = setTimeout(() => {
                this._boundaryTimers.delete(timer);
                if (state.gen === this._genId && state.callbacks.onBoundary) {
                    state.callbacks.onBoundary({
                        charIndex: boundary.charIndex,
                        charLength: boundary.charLength,
                        name: 'word'
                    });
                }
            }, Math.max(0, atMs - performance.now()));
            this._boundaryTimers.add(timer);
        });
    }
}
