import { TTSEngine } from './TTSEngine';
import ESpeakNG from 'espeak-ng';

/**
 * eSpeak-NG TTS Engine (WASM)
 * High compatibility, offline, low footprint.
 * Uses espeak-ng compiled to WASM.
 */
export class ESpeakEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'eSpeak-NG';
        this.instance = null;
        this.isLoading = false;
        this.audioContext = null;
        this.currentSource = null;
    }

    async init() {
        if (this.instance) return;
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            // In Vite, we need to help Emscripten find the WASM file
            const wasmUrl = new URL(
                '../../../node_modules/espeak-ng/dist/espeak-ng.wasm',
                import.meta.url
            ).href;

            this.instance = await ESpeakNG({
                locateFile: (path) => {
                    if (path.endsWith('.wasm')) return wasmUrl;
                    return path;
                },
                print: (text) => console.log('eSpeak:', text),
                printErr: (text) => console.error('eSpeak Error:', text),
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('eSpeak-NG initialized');
        } catch (err) {
            console.error('eSpeak-NG Init Error:', err);
            throw err;
        } finally {
            this.isLoading = false;
        }
    }

    async getVoices() {
        await this.init();
        // eSpeak-NG has hundreds of voices, but for now we'll return the core ones
        // or a generic one. Real voice list extraction from WASM is complex.
        return [
            { id: 'en-us', name: 'eSpeak English (US)', lang: 'en-US', source: 'eSpeak' },
            { id: 'en-gb', name: 'eSpeak English (UK)', lang: 'en-GB', source: 'eSpeak' },
            { id: 'es', name: 'eSpeak Spanish', lang: 'es-ES', source: 'eSpeak' },
            { id: 'fr', name: 'eSpeak French', lang: 'fr-FR', source: 'eSpeak' },
            { id: 'de', name: 'eSpeak German', lang: 'de-DE', source: 'eSpeak' },
            { id: 'hi', name: 'eSpeak Hindi', lang: 'hi-IN', source: 'eSpeak' }
        ];
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();
        await this.init();

        const voice = options.voiceId || 'en-us';
        const rate = Math.floor((options.rate || 1.0) * 175); // eSpeak default is 175 wpm

        try {
            if (callbacks.onStart) callbacks.onStart();

            // Use the instance to generate WAV
            // Note: Since the npm package runs main on init, we might need 
            // a fresh instance or access exports if available.
            // According to README, ESpeakNG factory runs main.

            const wasmUrl = new URL(
                '../../../node_modules/espeak-ng/dist/espeak-ng.wasm',
                import.meta.url
            ).href;

            const espeakInstance = await ESpeakNG({
                locateFile: (path) => path.endsWith('.wasm') ? wasmUrl : path,
                arguments: [
                    '-v', voice,
                    '-s', rate.toString(),
                    '-w', 'output.wav',
                    text
                ]
            });

            const wavData = espeakInstance.FS.readFile('output.wav');
            const audioBuffer = await this.audioContext.decodeAudioData(wavData.buffer);

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);

            source.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
            };

            this.currentSource = source;
            source.start(0);

        } catch (err) {
            console.error('eSpeak-NG Speak Error:', err);
            if (callbacks.onError) callbacks.onError(err);
        }
    }

    stop() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) { }
            this.currentSource = null;
        }
    }

    pause() {
        if (this.audioContext) this.audioContext.suspend();
    }

    resume() {
        if (this.audioContext) this.audioContext.resume();
    }
}
