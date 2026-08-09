/**
 * Base class for TTS Engines
 */
export class TTSEngine {
    constructor() {
        this.name = 'BaseEngine';
    }

    async init() {
        // Initialize engine (load models, connect, etc)
    }

    async getVoices() {
        return [];
    }

    /**
     * Speak text
     * @param {string} text 
     * @param {object} options { voiceId, rate, pitch, volume }
     * @param {object} callbacks { onBoundary, onEnd, onError, onStart }
     */
    speak() {
        throw new Error("Method 'speak' must be implemented.");
    }

    /**
     * Prefetch audio for text.
     * Resolves to an opaque engine-defined `audioObject`, or null when the
     * engine does not prefetch (WebSpeechEngine never does). Prior-art engines
     * return `{ audio: Float32Array, sampleRate }` (Kokoro) or `{ file: Blob,
     * duration }` (Piper). Player passes the result back to `speak()` as
     * `options.audioObject`.
     * @param {string} text 
     * @param {object} options 
     * @returns {Promise<Object|null>}
     */
    async prefetch() {
        return null;
    }

    stop() { }
    pause() { }
    resume() { }
}
