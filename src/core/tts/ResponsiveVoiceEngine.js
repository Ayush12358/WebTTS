import { TTSEngine } from './TTSEngine';

/**
 * ResponsiveVoice TTS Engine
 * Free with attribution, unlimited usage
 * Uses ResponsiveVoice.js SDK
 */
export class ResponsiveVoiceEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'ResponsiveVoice';
        this.voiceList = [];
        this.isLoaded = false;
        this.loadPromise = null;
    }

    async init() {
        if (this.isLoaded) return;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = new Promise((resolve) => {
            // Check if already loaded
            if (window.responsiveVoice) {
                this.isLoaded = true;
                resolve();
                return;
            }

            // Load ResponsiveVoice script
            const script = document.createElement('script');
            script.src = 'https://code.responsivevoice.org/responsivevoice.js?key=y9dOESmS';
            script.onload = () => {
                // Wait for ResponsiveVoice to initialize
                const checkReady = setInterval(() => {
                    if (window.responsiveVoice && window.responsiveVoice.voiceSupport()) {
                        clearInterval(checkReady);
                        this.isLoaded = true;
                        console.log('ResponsiveVoice loaded');
                        resolve();
                    }
                }, 100);

                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkReady);
                    resolve();
                }, 10000);
            };
            script.onerror = () => {
                console.error('Failed to load ResponsiveVoice');
                resolve();
            };
            document.head.appendChild(script);
        });

        return this.loadPromise;
    }

    async getVoices() {
        await this.init();

        if (!window.responsiveVoice) {
            return [{ id: 'unavailable', name: 'ResponsiveVoice not loaded', lang: 'en', source: 'ResponsiveVoice' }];
        }

        const voices = window.responsiveVoice.getVoices();
        return voices.map(v => ({
            id: v.name,
            name: v.name,
            lang: 'en',
            source: 'ResponsiveVoice'
        }));
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();
        await this.init();

        if (!window.responsiveVoice) {
            if (callbacks.onError) callbacks.onError(new Error('ResponsiveVoice not available'));
            return;
        }

        const voiceId = options.voiceId || 'UK English Female';
        const rate = options.rate || 1.0;

        try {
            window.responsiveVoice.speak(text, voiceId, {
                rate: rate,
                onstart: () => {
                    if (callbacks.onStart) callbacks.onStart();
                },
                onend: () => {
                    if (callbacks.onEnd) callbacks.onEnd();
                },
                onerror: (e) => {
                    if (callbacks.onError) callbacks.onError(e);
                }
            });
        } catch (e) {
            console.error('ResponsiveVoice error:', e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    stop() {
        if (window.responsiveVoice) {
            window.responsiveVoice.cancel();
        }
    }

    pause() {
        if (window.responsiveVoice) {
            window.responsiveVoice.pause();
        }
    }

    resume() {
        if (window.responsiveVoice) {
            window.responsiveVoice.resume();
        }
    }
}
