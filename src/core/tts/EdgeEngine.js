import { TTSEngine } from './TTSEngine';

export class EdgeEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Edge TTS';
    }

    async init() {
        // Interface stub
    }

    async getVoices() {
        return [
            { id: 'edge-placeholder', name: 'Edge TTS (Not Implemented)', lang: 'en', source: 'Edge' }
        ];
    }

    async speak(text, options = {}, callbacks = {}) {
        console.warn("Edge TTS client-side integration is currently unavailable directly. Please use Piper or WebSpeech.");
        if (callbacks.onError) {
            callbacks.onError(new Error("Edge TTS not implemented."));
        }
    }
}
