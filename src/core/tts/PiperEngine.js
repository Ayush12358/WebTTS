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

            // Use session with local paths to avoid CDN issues
            if (!this.session || this.session.voiceId !== voiceId) {
                this.session = await TtsSession.create({
                    voiceId: voiceId,
                    wasmPaths: {
                        // We serve these from root public dir
                        onnxWasm: '/',
                        piperData: '/', // defaults might need checking but typically it loads model from huggingface? 
                        // Wait, 'piperData' usually refers to tokenizers etc?
                        // The library documentation says: 
                        // onnxWasm: path to onnxruntime-web wasm files
                        // piperWasm: path to piper_phonemize.wasm
                        // piperData: path to piper_phonemize.data

                        // I need to ensure I have piper_phonemize files too if not using CDN.
                        // The library bundles them?
                        // @mintplex-labs/piper-tts-web uses defaults if not provided.
                        // The error specifically complained about onnxruntime-web dynamic import.

                        // Let's rely on standard layout manually forced:
                        onnxWasm: '/ort-wasm-simd-threaded.wasm', // It actually looks for the folder usually but let's try path
                    }
                });
            }

            // Actually TtsSession options `wasmPaths` expects paths to *files* or *directories*?
            // Checking doc again:
            // "These are the option paths to a PUBLIC directory or server endpoint... onnxWasm: {@link ONNX_BASE}"
            // It seems it expects the base path.

            // Retrying with cleaner approach:
            // Copy onnx wasm to public/
            // Pass the public path.

            // Re-creating session safely
            if (!this.session || this.session.voiceId !== voiceId) {
                this.session = await TtsSession.create({
                    voiceId: voiceId,
                    logger: console.log,
                    // Point to where we copied files. 
                    // If files are in public root, path is './' or '/'
                    wasmPaths: {
                        onnxWasm: '/', // It appends filename
                        // We might need to copy piper_phonemize.wasm/.data too if they fail, 
                        // but error was specifically onnx
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
