import { TTSEngine } from './TTSEngine';

/**
 * Google Cloud TTS Engine
 * 4M chars/month free tier
 * Requires API key from Google Cloud Console
 */
export class GoogleCloudTTSEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Google Cloud TTS';
        this.voiceList = [];
        this.audio = null;
        this.apiKey = '';
    }

    setApiKey(key) {
        this.apiKey = key;
        localStorage.setItem('googleCloudTTSApiKey', key);
    }

    getApiKey() {
        if (!this.apiKey) {
            this.apiKey = localStorage.getItem('googleCloudTTSApiKey') || '';
        }
        return this.apiKey;
    }

    async init() {
        // Load saved API key
        this.getApiKey();
    }

    async getVoices() {
        const apiKey = this.getApiKey();

        if (!apiKey) {
            return [{
                id: 'setup_required',
                name: 'API Key Required (see Settings)',
                lang: 'en-US',
                source: 'Google Cloud'
            }];
        }

        try {
            const response = await fetch(
                `https://texttospeech.googleapis.com/v1/voices?key=${apiKey}`
            );

            if (!response.ok) {
                throw new Error('Invalid API key or quota exceeded');
            }

            const data = await response.json();

            // Filter for English voices and use original names
            this.voiceList = data.voices
                .filter(v => v.languageCodes.some(l => l.startsWith('en')))
                .map(v => ({
                    id: v.name,
                    name: v.name,
                    lang: v.languageCodes[0],
                    source: 'Google Cloud'
                }));

            return this.voiceList;
        } catch (e) {
            console.error('Failed to fetch Google Cloud voices:', e);
            return [{
                id: 'error',
                name: 'Failed to load voices - check API key',
                lang: 'en-US',
                source: 'Google Cloud'
            }];
        }
    }

    async prefetch(text, options = {}) {
        const apiKey = this.getApiKey();
        if (!apiKey) return null;

        const voiceId = options.voiceId || 'en-US-Neural2-C';
        const rate = options.rate || 1.0;

        try {
            const response = await fetch(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        input: { text: text },
                        voice: {
                            languageCode: voiceId.substring(0, 5),
                            name: voiceId
                        },
                        audioConfig: {
                            audioEncoding: 'MP3',
                            speakingRate: rate,
                            pitch: 12 * Math.log2(options.pitch || 1.0)
                        }
                    })
                }
            );

            if (!response.ok) return null;

            const data = await response.json();
            const audioContent = data.audioContent;

            // Convert base64 to audio
            const audioBlob = await fetch(`data:audio/mp3;base64,${audioContent}`).then(r => r.blob());
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);
            audio.preload = 'auto'; // Important
            // Attach URL to revoke later if needed
            audio._blobUrl = audioUrl;
            return audio;

        } catch (e) {
            console.error('Google Cloud TTS prefetch error:', e);
            return null;
        }
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        const apiKey = this.getApiKey();
        if (!apiKey) {
            if (callbacks.onError) callbacks.onError(new Error('Google Cloud API key not set'));
            return;
        }

        const voiceId = options.voiceId || 'en-US-Neural2-C';
        const rate = options.rate || 1.0;

        try {
            if (callbacks.onStart) callbacks.onStart();

            if (options.audioObject) {
                console.log('Using prefetched Google Cloud audio');
                this.audio = options.audioObject;
            } else {
                const response = await fetch(
                    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            input: { text: text },
                            voice: {
                                languageCode: voiceId.substring(0, 5),
                                name: voiceId
                            },
                            audioConfig: {
                                audioEncoding: 'MP3',
                                speakingRate: rate,
                                pitch: 12 * Math.log2(options.pitch || 1.0)
                            }
                        })
                    }
                );

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'TTS request failed');
                }

                const data = await response.json();
                const audioContent = data.audioContent;

                // Convert base64 to audio
                const audioBlob = await fetch(`data:audio/mp3;base64,${audioContent}`).then(r => r.blob());
                const audioUrl = URL.createObjectURL(audioBlob);

                this.audio = new Audio(audioUrl);
                this.audio._blobUrl = audioUrl;
            }

            this.audio.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
                if (this.audio && this.audio._blobUrl) {
                    URL.revokeObjectURL(this.audio._blobUrl);
                }
            };

            this.audio.onerror = (e) => {
                if (callbacks.onError) callbacks.onError(e);
            };

            await this.audio.play();

        } catch (e) {
            console.error('Google Cloud TTS error:', e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    stop() {
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            if (this.audio._blobUrl) {
                URL.revokeObjectURL(this.audio._blobUrl);
            }
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
