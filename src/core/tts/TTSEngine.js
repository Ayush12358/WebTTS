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
     * Prefetch audio for text
     * @param {string} text 
     * @param {object} options 
     * @returns {Promise<HTMLAudioElement|null>}
     */
    async prefetch() {
        return null;
    }

    stop() { }
    pause() { }
    resume() { }
}
