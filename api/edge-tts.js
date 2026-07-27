import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import escape from 'xml-escape';
import crypto from 'node:crypto';

export default async function handler(req, res) {
    const { text, voice, rate, pitch } = req.query;

    if (!text) {
        return res.status(400).send('Missing text parameter');
    }

    const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    const connectionId = uuidv4().replace(/-/g, "").toUpperCase();
    const CHROMIUM_FULL_VERSION = "143.0.3650.75";
    const CHROMIUM_MAJOR_VERSION = "143";
    const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

    try {
        // 1. Clock Sync
        let serverTime = Date.now();
        try {
          const timeRes = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + TRUSTED_CLIENT_TOKEN, { method: 'HEAD' });
          const dateHeader = timeRes.headers.get('date');
          if (dateHeader) serverTime = new Date(dateHeader).getTime();
        } catch {
          // Bing time sync is optional; local clock is sufficient as a fallback.
        }

        // 2. Token Generation
        const WIN_EPOCH = 11644473600n;
        let ticks = BigInt(Math.floor(serverTime / 1000)) + WIN_EPOCH;
        ticks -= ticks % 300n;
        ticks *= 10000000n;
        const strToHash = ticks.toString() + TRUSTED_CLIENT_TOKEN;
        const secMsGec = crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();

        // 3. Voice Name Mapping
        let voiceToUse = voice || 'en-US-AvaNeural';
        if (!voiceToUse.includes('Microsoft Server Speech')) {
            const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(voiceToUse);
            if (match) {
                const [, lang, region, name] = match;
                voiceToUse = `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
            }
        }

        const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

        const ws = new WebSocket(url, {
            headers: {
                'Pragma': 'no-cache',
                'Cache-Control': 'no-cache',
                'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
                'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
                'Sec-MS-GEC': secMsGec,
                'Sec-MS-GEC-Version': SEC_MS_GEC_VERSION
            }
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { ws.terminate(); reject(new Error('Timeout')); }, 20000);

            ws.on('open', () => {
                clearTimeout(timeout);
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Transfer-Encoding', 'chunked');

                ws.send(`X-Timestamp:${new Date(serverTime).toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);

                const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voiceToUse}'><prosody pitch='${pitch || '+0Hz'}' rate='${rate || '+0%'}'>${escape(text)}</prosody></voice></speak>`;
                ws.send(`X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date(serverTime).toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
            });

            ws.on('message', (data, isBinary) => {
                if (isBinary) {
                    const headerLength = data.readUInt16BE(0);
                    const audioData = data.slice(headerLength + 2);
                    if (audioData.length > 0) res.write(audioData);
                } else {
                    const msg = data.toString();
                    if (msg.includes('Path:turn.end')) { ws.close(); res.end(); resolve(); }
                    else if (msg.includes('Path:response') && msg.includes('403')) reject(new Error('Edge TTS 403 Forbidden'));
                }
            });

            ws.on('error', (err) => { if (!res.headersSent) res.status(500).send(err.message); reject(err); });
            ws.on('close', () => { if (!res.writableEnded) res.end(); resolve(); });
        });
    } catch (error) {
        if (!res.headersSent) res.status(500).send(error.message);
    }
}
