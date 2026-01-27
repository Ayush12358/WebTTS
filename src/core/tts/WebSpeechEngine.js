import { TTSEngine } from './TTSEngine';

export class WebSpeechEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'System TTS (Browser Voices)';
        this.utterance = null;
    }

    async init() {
        // Some browsers need a moment to load voices
        return new Promise((resolve) => {
            if (window.speechSynthesis.getVoices().length > 0) {
                resolve();
            } else {
                window.speechSynthesis.onvoiceschanged = () => resolve();
            }
        });
    }

    async getVoices() {
        const voices = window.speechSynthesis.getVoices();
        return voices
            .filter(v => v.lang.startsWith('en'))
            .map(v => ({
                id: v.name,
                name: v.name,
                lang: v.lang,
                source: 'WebSpeech'
            }));
    }

    speak(text, options = {}, callbacks = {}) {
        this.stop();

        const utterance = new SpeechSynthesisUtterance(text);
        this.utterance = utterance;

        if (options.voiceId) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === options.voiceId);
            if (voice) utterance.voice = voice;
        }

        if (options.rate) utterance.rate = options.rate;
        if (options.pitch) utterance.pitch = options.pitch;
        if (options.volume) utterance.volume = options.volume;

        utterance.onstart = () => {
            if (callbacks.onStart) callbacks.onStart();
        };

        utterance.onboundary = (event) => {
            if (callbacks.onBoundary) {
                // WebSpeech boundary event: event.charIndex, event.name ('word' or 'sentence')
                // event.charLength (sometimes undefined on some browsers)
                // match text to find length if undefined
                callbacks.onBoundary({
                    charIndex: event.charIndex,
                    charLength: event.charLength, // might be undefined
                    name: event.name
                });
            }
        };

        utterance.onend = () => {
            if (callbacks.onEnd) callbacks.onEnd();
        };

        utterance.onerror = (e) => {
            if (e.error === 'interrupted' || e.error === 'canceled') {
                return; // Ignore intentional stops
            }
            if (callbacks.onError) callbacks.onError(e);
        };

        window.speechSynthesis.speak(utterance);
    }

    stop() {
        window.speechSynthesis.cancel();
    }

    pause() {
        window.speechSynthesis.pause();
    }

    resume() {
        window.speechSynthesis.resume();
    }
}
