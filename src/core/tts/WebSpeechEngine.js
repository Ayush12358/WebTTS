import { TTSEngine } from './TTSEngine';

export class WebSpeechEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'System TTS (Browser Voices)';
        this.utterance = null;
    }

    async init() {
        if (typeof window === 'undefined' || !window.speechSynthesis) return;
        if (window.speechSynthesis.getVoices().length > 0) return;

        await new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
                resolve();
            };
            const timeout = setTimeout(finish, 1500);
            window.speechSynthesis.addEventListener?.('voiceschanged', finish);
        });
    }

    async getVoices() {
        if (typeof window === 'undefined' || !window.speechSynthesis) return [];
        const voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(voice => voice.lang?.toLowerCase().startsWith('en'));
        return (englishVoices.length ? englishVoices : voices).map(voice => ({
            id: voice.name,
            name: voice.name,
            lang: voice.lang,
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
        if (options.volume !== undefined) utterance.volume = options.volume;

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
