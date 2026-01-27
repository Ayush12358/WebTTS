import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import escape from 'xml-escape';
import crypto from 'crypto';

/**
 * Robust Edge TTS Synthesis Logic (Definitive Jan 2026 Bypass)
 * This logic matches the latest working Python/Go implementations.
 */
async function synthesize(text, voice, rate, pitch, onChunk) {
  const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const connectionId = uuidv4().replace(/-/g, "").toUpperCase();
  const CHROMIUM_FULL_VERSION = "143.0.3650.75";
  const CHROMIUM_MAJOR_VERSION = "143";
  const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

  // 1. Clock Sync (CRITICAL)
  let serverTime = Date.now();
  try {
    const timeRes = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=' + TRUSTED_CLIENT_TOKEN, { method: 'HEAD' });
    const dateHeader = timeRes.headers.get('date');
    if (dateHeader) serverTime = new Date(dateHeader).getTime();
  } catch (e) { }

  // 2. Sec-MS-GEC Token Generation
  const WIN_EPOCH = 11644473600n;
  let ticks = BigInt(Math.floor(serverTime / 1000)) + WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const strToHash = ticks.toString() + TRUSTED_CLIENT_TOKEN;
  const secMsGec = crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();

  // 3. Official Voice Name Mapping
  let fullVoiceName = voice;
  if (!voice.includes('Microsoft Server Speech')) {
    const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(voice);
    if (match) {
      const [, lang, region, name] = match;
      fullVoiceName = `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
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
      ws.send(`X-Timestamp:${new Date(serverTime).toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${fullVoiceName}'><prosody pitch='${pitch}' rate='${rate}'>${escape(text)}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date(serverTime).toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const headerLength = data.readUInt16BE(0);
        const audioData = data.slice(headerLength + 2);
        if (audioData.length > 0) onChunk(audioData);
      } else {
        const msg = data.toString();
        if (msg.includes('Path:turn.end')) { ws.close(); resolve(); }
        else if (msg.includes('Path:response') && msg.includes('403')) reject(new Error('Edge TTS 403 Forbidden'));
      }
    });

    ws.on('error', (err) => { reject(err); });
    ws.on('close', () => { resolve(); });
  });
}

const edgeTtsApiPlugin = () => ({
  name: 'edge-tts-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/edge-tts') {
        const text = url.searchParams.get('text');
        const voice = url.searchParams.get('voice') || 'en-US-AvaNeural';
        const rate = url.searchParams.get('rate') || '+0%';
        const pitch = url.searchParams.get('pitch') || '+0Hz';

        if (!text) { res.writeHead(400); res.end('Missing text'); return; }

        try {
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Transfer-Encoding': 'chunked' });
          await synthesize(text, voice, rate, pitch, (chunk) => res.write(chunk));
          res.end();
          return;
        } catch (error) {
          console.error('[API] Error:', error);
          if (!res.headersSent) res.writeHead(500);
          res.end(error.message);
          return;
        }
      } else if (url.pathname === '/api/voices') {
        try {
          const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
          const voicesUrl = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
          const response = await fetch(voicesUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
              'Origin': 'https://edge.microsoft.com',
              'Referer': 'https://edge.microsoft.com'
            }
          });
          const data = await response.json();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
          return;
        } catch (error) {
          console.error('[API] Voices Error:', error);
          if (!res.headersSent) res.writeHead(500);
          res.end(error.message);
          return;
        }
      }
      next();
    });
  }
});

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'WebTTS - EPUB to Audiobook',
        short_name: 'WebTTS',
        description: 'Read EPUBs with text-to-speech. Offline-capable audiobook reader.',
        theme_color: '#1E3A8A',
        background_color: '#1E3A8A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }, { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }]
      }
    }),
    edgeTtsApiPlugin()
  ],
  server: {
    proxy: {}
  }
});
