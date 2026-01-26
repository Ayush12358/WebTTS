import { TTSEngine } from './TTSEngine';

/**
 * Microsoft Edge TTS Engine (Neural)
 * Restore Edge TTS support for all browsers using backend-mediation.
 */
export class EdgeTTSEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Microsoft Edge TTS (Neural)';
        this.audio = null;
    }

    async init() {
    }

    async getVoices() {
        try {
            const response = await fetch('/edge-tts-voices');
            const voices = await response.json();
            return voices.map(v => ({
                id: v.ShortName,
                name: v.FriendlyName || v.ShortName,
                lang: v.Locale,
                source: 'Edge TTS'
            }));
        } catch (e) {
            console.error('Failed to fetch Edge TTS voices:', e);
            return [{
                id: 'en-US-AvaNeural',
                name: 'Ava (Neural)',
                lang: 'en-US',
                source: 'Edge TTS'
            }];
        }
    }

    async prefetch(text, options = {}) {
        try {
            const voiceId = options.voiceId || 'en-US-AvaNeural';
            const rate = options.rate || 1.0;
            const pitch = options.pitch || 1.0;

            const rateFormatted = rate >= 1
                ? `+${Math.round((rate - 1) * 100)}%`
                : `${Math.round((rate - 1) * 100)}%`;

            const pitchFormatted = pitch >= 1
                ? `+${Math.round((pitch - 1) * 100)}Hz`
                : `${Math.round((pitch - 1) * 100)}Hz`;

            const params = new URLSearchParams({
                text: text,
                voice: voiceId,
                rate: rateFormatted,
                pitch: pitchFormatted
            });

            // Use direct URL for faster streaming playback
            const audioUrl = `/api/edge-tts?${params.toString()}`;

            // Generate Audio Object
            const audio = new Audio(audioUrl);
            audio.preload = 'auto'; // Important for prefetching
            return audio;
        } catch (e) {
            console.error('Edge TTS prefetch error:', e);
            return null;
        }
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        try {
            if (callbacks.onStart) callbacks.onStart();

            // Check if we have preloaded audio
            if (options.audioObject) {
                console.log('Using prefetched Edge TTS audio');
                this.audio = options.audioObject;
            } else {
                const voiceId = options.voiceId || 'en-US-AvaNeural';
                const rate = options.rate || 1.0;
                const pitch = options.pitch || 1.0;

                const rateFormatted = rate >= 1
                    ? `+${Math.round((rate - 1) * 100)}%`
                    : `${Math.round((rate - 1) * 100)}%`;

                const pitchFormatted = pitch >= 1
                    ? `+${Math.round((pitch - 1) * 100)}Hz`
                    : `${Math.round((pitch - 1) * 100)}Hz`;

                const params = new URLSearchParams({
                    text: text,
                    voice: voiceId,
                    rate: rateFormatted,
                    pitch: pitchFormatted
                });

                // Use direct URL for faster streaming playback
                const audioUrl = `/api/edge-tts?${params.toString()}`;
                console.log('Streaming Edge TTS audio from:', audioUrl);

                this.audio = new Audio(audioUrl);
            }

            this.audio.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
            };

            this.audio.onerror = (e) => {
                const error = this.audio.error;
                console.error('Audio playback error:', error?.message || 'Unknown error', error?.code);
                if (callbacks.onError) callbacks.onError(e);
            };

            this.audio.play().catch(e => {
                console.error('Playback failed:', e);
                if (callbacks.onError) callbacks.onError(e);
            });

        } catch (e) {
            console.error('Edge TTS error:', e);
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
        if (this.audio) this.audio.play().catch(e => console.error('Resume failed:', e));
    }
}
