import { TTSEngine } from './TTSEngine';

/**
 * Speakit-JS TTS Engine
 * A wrapper library for the Web Speech API (as requested)
 * Ref: https://github.com/mobilepadawan/Speakit-JS
 */
export class SpeakitEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Speakit-JS';
        this.utteranceRate = 1.0;
        this.utterancePitch = 1.0;
        this.isSpeaking = false;
    }

    async init() {
        // No heavy init needed as it uses Web Speech API
        return Promise.resolve();
    }

    async getVoices() {
        return new Promise((resolve) => {
            let voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                resolve(this._mapVoices(voices));
            } else {
                window.speechSynthesis.onvoiceschanged = () => {
                    voices = window.speechSynthesis.getVoices();
                    resolve(this._mapVoices(voices));
                };
            }
        });
    }

    _mapVoices(voices) {
        return voices.map(v => ({
            id: v.name,
            name: v.name,
            lang: v.lang,
            source: 'Speakit-JS'
        }));
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang || "en-US";
        utterance.rate = options.rate || this.utteranceRate;
        utterance.pitch = options.pitch || this.utterancePitch;

        if (options.voiceId) {
            const voice = window.speechSynthesis.getVoices().find(v => v.name === options.voiceId);
            if (voice) {
                utterance.voice = voice;
            }
        }

        utterance.onstart = () => {
            this.isSpeaking = true;
            if (callbacks.onStart) callbacks.onStart();
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            if (callbacks.onEnd) callbacks.onEnd();
        };

        utterance.onerror = (event) => {
            this.isSpeaking = false;
            if (callbacks.onError) callbacks.onError(event);
        };

        window.speechSynthesis.speak(utterance);
    }

    stop() {
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
    }

    pause() {
        window.speechSynthesis.pause();
    }

    resume() {
        window.speechSynthesis.resume();
    }
}
