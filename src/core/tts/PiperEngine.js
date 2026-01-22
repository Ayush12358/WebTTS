import { TTSEngine } from './TTSEngine';
import { voices, predict } from '@mintplex-labs/piper-tts-web';

export class PiperEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Piper TTS';
        this.voiceList = [];
        this.audio = null;
    }

    async init() {
        // Pre-fetch voices or just be ready
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

            // This downloads the model and synthesizes audio
            const blob = await predict({
                text: text,
                voiceId: voiceId,
            }, (progress) => {
                console.log("Piper download check:", progress);
            });

            const url = URL.createObjectURL(blob);
            this.audio = new Audio(url);

            this.audio.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
                URL.revokeObjectURL(url);
            };

            this.audio.onerror = (e) => {
                if (callbacks.onError) callbacks.onError(e);
            };

            // Piper web does not support word boundaries easily without analyzing the audio/model internals
            // So we skip onBoundary

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
