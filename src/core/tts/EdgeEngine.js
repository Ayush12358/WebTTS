import { TTSEngine } from './TTSEngine';
import { EdgeTTSClient, OUTPUT_FORMAT } from 'edge-tts-client';

export class EdgeEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Edge TTS';
        this.client = new EdgeTTSClient();
        this.voiceList = [];
        this.audio = null;
        this.currentUrl = null;
    }

    async init() {
        // nothing specific
    }

    async getVoices() {
        try {
            if (this.voiceList.length === 0) {
                const voices = await this.client.getVoices();
                this.voiceList = voices.map(v => ({
                    id: v.ShortName,
                    name: `${v.FriendlyName} (${v.Locale})`,
                    lang: v.Locale,
                    source: 'Edge'
                }));
            }
            return this.voiceList;
        } catch (e) {
            console.error("Failed to get Edge voices", e);
            return [];
        }
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        const voiceId = options.voiceId || 'en-US-AriaNeural'; // Default

        try {
            if (callbacks.onStart) callbacks.onStart();

            // EdgeTTSClient flow
            await this.client.setMetadata(voiceId, OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);

            const stream = this.client.toStream(text, {
                rate: options.rate ? `${(options.rate - 1) * 100}%` : '0%', // Format: +0% 
                volume: '0%', // 0% means default volume
                pitch: '0Hz'
            });

            const chunks = [];

            stream.on('data', (data) => {
                // Data is likely ArrayBuffer or Uint8Array
                chunks.push(data);
            });

            stream.on('close', () => {
                // Combine chunks
                const blob = new Blob(chunks, { type: 'audio/webm' }); // Opus webm
                const url = URL.createObjectURL(blob);
                this.currentUrl = url;

                this.audio = new Audio(url);
                this.audio.onended = () => {
                    if (callbacks.onEnd) callbacks.onEnd();
                    URL.revokeObjectURL(url);
                    this.currentUrl = null;
                };
                this.audio.onerror = (e) => {
                    if (callbacks.onError) callbacks.onError(e);
                };

                this.audio.play();
            });

        } catch (e) {
            console.error("Edge TTS Error", e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
            if (this.currentUrl) {
                URL.revokeObjectURL(this.currentUrl);
                this.currentUrl = null;
            }
        }
        // Client close?
        // this.client.close(); // might kill connection for future?
    }

    pause() {
        if (this.audio) this.audio.pause();
    }

    resume() {
        if (this.audio) this.audio.play();
    }
}
