import { TTSEngine } from './TTSEngine';
import { voices, TtsSession } from '@mintplex-labs/piper-tts-web';

export class PiperEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Piper TTS';
        this.voiceList = [];
        this.audio = null;
        this.session = null;
    }

    async init() {
        try {
            const list = await voices();
            this.voiceList = list;
        } catch (e) {
            console.error("Failed to load Piper voices", e);
        }
    }

    async getVoices() {
        if (this.voiceList.length === 0) {
            await this.init();
        }
        return this.voiceList.map(v => ({
            id: v.key,
            name: `${v.name} (${v.language.name_native}) - ${v.quality}`,
            lang: v.language.code,
            source: 'Piper'
        }));
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        const voiceId = options.voiceId || (this.voiceList[0] ? this.voiceList[0].key : 'en_US-amy-medium');

        try {
            if (callbacks.onStart) callbacks.onStart();

            if (!this.session || this.session.voiceId !== voiceId) {
                this.session = await TtsSession.create({
                    voiceId: voiceId,
                    logger: console.log,
                    wasmPaths: {
                        onnxWasm: '/', // Points to public root directory
                    }
                });
            }

            const blob = await this.session.predict(text);

            const url = URL.createObjectURL(blob);
            this.audio = new Audio(url);

            this.audio.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
                URL.revokeObjectURL(url);
            };

            this.audio.onerror = (e) => {
                if (callbacks.onError) callbacks.onError(e);
            };

            await this.audio.play();

        } catch (e) {
            console.error("Piper Speak Error:", e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
        }
    }

    pause() {
        if (this.audio) this.audio.pause();
    }

    resume() {
        if (this.audio) this.audio.play();
    }
}
