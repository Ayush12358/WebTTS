import { TTSEngine } from './TTSEngine';

export class EdgeEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Edge TTS';
        this.voiceList = [];
        this.audio = null;
        this.currentUrl = null;
        this.ws = null;
    }

    async init() {
        console.log("EdgeEngine initialized - Native WebSocket Version");
        // Prepare voices list (static list or fetch if needed, but fetch might be blocked too)
        // We will fetch widely used voices first if list fails.
    }

    async getVoices() {
        // If we can't fetch, return a default list
        if (this.voiceList.length > 0) return this.voiceList;

        const defaults = [
            { id: 'en-US-AriaNeural', name: 'Aria (English US)', lang: 'en-US', source: 'Edge' },
            { id: 'en-US-GuyNeural', name: 'Guy (English US)', lang: 'en-US', source: 'Edge' },
            { id: 'en-GB-SoniaNeural', name: 'Sonia (English GB)', lang: 'en-GB', source: 'Edge' },
            { id: 'en-GB-RyanNeural', name: 'Ryan (English GB)', lang: 'en-GB', source: 'Edge' }
        ];
        this.voiceList = defaults;
        return defaults;
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop(); // Stop previous

        const voiceId = options.voiceId || 'en-US-AriaNeural';
        const rate = options.rate ? this.formatRate(options.rate) : '+0%';
        const volume = '+0%';
        const pitch = '+0Hz';

        const requestId = crypto.randomUUID().replace(/-/g, '');

        try {
            if (callbacks.onStart) callbacks.onStart();

            // Create SSML
            const ssml = `
            <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
                <voice name='${voiceId}'>
                    <prosody rate='${rate}' pitch='${pitch}' volume='${volume}'>
                        ${this.escapeXml(text)}
                    </prosody>
                </voice>
            </speak>`;

            // Connect
            const connectionId = crypto.randomUUID().replace(/-/g, '');
            const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;

            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';

            const chunks = [];

            this.ws.onopen = () => {
                // Send Config
                const configMsg = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
                    JSON.stringify({
                        context: {
                            synthesis: {
                                audio: {
                                    metadataoptions: {
                                        sentenceBoundaryEnabled: "false",
                                        wordBoundaryEnabled: "false"
                                    },
                                    outputFormat: "webm-24khz-16bit-mono-opus"
                                }
                            }
                        }
                    });
                this.ws.send(configMsg);

                // Send SSML
                const ssmlMsg = `X-RequestId:${requestId}\r\nX-Timestamp:${new Date().toString()}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n` + ssml;
                this.ws.send(ssmlMsg);
            };

            this.ws.onmessage = (event) => {
                const data = event.data;
                if (typeof data === 'string') {
                    if (data.includes('Path:turn.end')) {
                        // End of stream
                        this.ws.close();
                    }
                } else if (data instanceof ArrayBuffer) {
                    // Binary data: Header Length (2 bytes) + Header + Audio
                    const view = new DataView(data);
                    const headLen = view.getUint16(0);
                    const textDecoder = new TextDecoder();
                    const headerText = textDecoder.decode(data.slice(2, 2 + headLen));

                    if (headerText.includes('Path:audio')) {
                        const audioData = data.slice(2 + headLen);
                        chunks.push(audioData);
                    }
                }
            };

            this.ws.onerror = (e) => {
                console.error("Edge WebSocket Error", e);
                // Try to inform user
                alert("Edge TTS connection failed (likely blocked by browser). Please switch to 'Piper TTS' or 'Web Speech' in settings.");
                if (callbacks.onError) callbacks.onError(e);
            };

            this.ws.onclose = () => {
                if (chunks.length > 0) {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const audioUrl = URL.createObjectURL(blob);
                    this.currentUrl = audioUrl;
                    this.audio = new Audio(audioUrl);

                    this.audio.onended = () => {
                        if (callbacks.onEnd) callbacks.onEnd();
                        URL.revokeObjectURL(audioUrl);
                        this.currentUrl = null;
                    };

                    this.audio.play().catch(e => {
                        console.error("Audio play failed", e);
                        if (callbacks.onError) callbacks.onError(e);
                    });
                } else {
                    // If closed without chunks, maybe error
                    // But usually turn.end happens.
                }
            };

        } catch (e) {
            console.error(e);
            if (callbacks.onError) callbacks.onError(e);
        }
    }

    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.audio) {
            this.audio.pause();
            this.audio.currentTime = 0;
            this.audio = null;
        }
        if (this.currentUrl) {
            URL.revokeObjectURL(this.currentUrl);
            this.currentUrl = null;
        }
    }

    pause() {
        if (this.audio) this.audio.pause();
    }

    resume() {
        if (this.audio) this.audio.play();
    }

    formatRate(rate) {
        // Rate is 0.1 to 10?
        // Edge accepts percentage string: +10%, -50%
        // Input 1.0 = +0%. 1.5 = +50%. 0.5 = -50%
        const val = (rate - 1) * 100;
        if (val >= 0) return `+${Math.round(val)}%`;
        return `${Math.round(val)}%`;
    }

    escapeXml(unsafe) {
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }
}
