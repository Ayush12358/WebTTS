import { TTSEngine } from './TTSEngine';

/**
 * Amazon Polly TTS Engine
 * 5M chars/month free (first 12 months)
 * Requires AWS credentials (Access Key ID + Secret)
 */
export class AmazonPollyEngine extends TTSEngine {
    constructor() {
        super();
        this.name = 'Amazon Polly';
        this.voiceList = [];
        this.audio = null;
        this.credentials = null;
        this.region = 'us-east-1';
    }

    setCredentials(accessKeyId, secretAccessKey, region = 'us-east-1') {
        this.credentials = { accessKeyId, secretAccessKey };
        this.region = region;
        localStorage.setItem('awsPollyCredentials', JSON.stringify({
            accessKeyId,
            secretAccessKey,
            region
        }));
    }

    getCredentials() {
        if (!this.credentials) {
            const saved = localStorage.getItem('awsPollyCredentials');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.credentials = {
                    accessKeyId: parsed.accessKeyId,
                    secretAccessKey: parsed.secretAccessKey
                };
                this.region = parsed.region || 'us-east-1';
            }
        }
        return this.credentials;
    }

    async init() {
        this.getCredentials();
    }

    async getVoices() {
        // Return static list of popular Polly voices 
        // (API call requires signed request which is complex without AWS SDK)
        return [
            { id: 'Joanna', name: 'Joanna (Female US)', lang: 'en-US', source: 'Polly' },
            { id: 'Matthew', name: 'Matthew (Male US)', lang: 'en-US', source: 'Polly' },
            { id: 'Salli', name: 'Salli (Female US)', lang: 'en-US', source: 'Polly' },
            { id: 'Joey', name: 'Joey (Male US)', lang: 'en-US', source: 'Polly' },
            { id: 'Kendra', name: 'Kendra (Female US)', lang: 'en-US', source: 'Polly' },
            { id: 'Kimberly', name: 'Kimberly (Female US)', lang: 'en-US', source: 'Polly' },
            { id: 'Amy', name: 'Amy (Female UK)', lang: 'en-GB', source: 'Polly' },
            { id: 'Brian', name: 'Brian (Male UK)', lang: 'en-GB', source: 'Polly' },
            { id: 'Emma', name: 'Emma (Female UK)', lang: 'en-GB', source: 'Polly' },
            { id: 'Ruth', name: 'Ruth (Female US Neural)', lang: 'en-US', source: 'Polly' },
            { id: 'Stephen', name: 'Stephen (Male US Neural)', lang: 'en-US', source: 'Polly' },
        ];
    }

    // AWS Signature V4 signing
    async signRequest(method, url, body, headers) {
        const creds = this.getCredentials();
        if (!creds) throw new Error('AWS credentials not set');

        const encoder = new TextEncoder();
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);

        const service = 'polly';
        const host = `polly.${this.region}.amazonaws.com`;
        const canonicalUri = new URL(url).pathname;
        const canonicalQuerystring = '';

        headers['Host'] = host;
        headers['X-Amz-Date'] = amzDate;
        headers['Content-Type'] = 'application/json';

        const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');
        const canonicalHeaders = Object.keys(headers).sort()
            .map(k => `${k.toLowerCase()}:${headers[k].trim()}`).join('\n') + '\n';

        const payloadHash = await this.sha256(body);
        const canonicalRequest = [method, canonicalUri, canonicalQuerystring, canonicalHeaders, signedHeaders, payloadHash].join('\n');

        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
        const stringToSign = [algorithm, amzDate, credentialScope, await this.sha256(canonicalRequest)].join('\n');

        const signingKey = await this.getSignatureKey(creds.secretAccessKey, dateStamp, this.region, service);
        const signature = await this.hmacHex(signingKey, stringToSign);

        headers['Authorization'] = `${algorithm} Credential=${creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return headers;
    }

    async sha256(message) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async hmac(key, message) {
        const encoder = new TextEncoder();
        const keyData = typeof key === 'string' ? encoder.encode(key) : key;
        const messageData = encoder.encode(message);
        const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    }

    async hmacHex(key, message) {
        const sig = await this.hmac(key, message);
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async getSignatureKey(key, dateStamp, region, service) {
        const encoder = new TextEncoder();
        const kDate = await this.hmac(encoder.encode('AWS4' + key), dateStamp);
        const kRegion = await this.hmac(kDate, region);
        const kService = await this.hmac(kRegion, service);
        return await this.hmac(kService, 'aws4_request');
    }

    async speak(text, options = {}, callbacks = {}) {
        this.stop();

        const creds = this.getCredentials();
        if (!creds) {
            if (callbacks.onError) callbacks.onError(new Error('AWS credentials not set'));
            return;
        }

        const voiceId = options.voiceId || 'Joanna';
        const rate = options.rate || 1.0;

        try {
            if (callbacks.onStart) callbacks.onStart();

            const url = `https://polly.${this.region}.amazonaws.com/v1/speech`;
            const body = JSON.stringify({
                OutputFormat: 'mp3',
                Text: text,
                VoiceId: voiceId,
                Engine: voiceId.includes('Neural') ? 'neural' : 'standard'
            });

            const headers = await this.signRequest('POST', url, body, {});

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Polly error: ${errorText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);

            this.audio = new Audio(audioUrl);

            this.audio.onended = () => {
                if (callbacks.onEnd) callbacks.onEnd();
                URL.revokeObjectURL(audioUrl);
            };

            this.audio.onerror = (e) => {
                if (callbacks.onError) callbacks.onError(e);
            };

            await this.audio.play();

        } catch (e) {
            console.error('Amazon Polly error:', e);
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
