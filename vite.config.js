import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const localOcrAssetsPlugin = () => {
  const assets = new Map([
    ['ocr/worker.min.js', new URL('./node_modules/tesseract.js/dist/worker.min.js', import.meta.url)],
    ['ocr/tesseract-core-lstm.wasm.js', new URL('./node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', import.meta.url)],
    ['ocr/tesseract-core-lstm.wasm', new URL('./node_modules/tesseract.js-core/tesseract-core-lstm.wasm', import.meta.url)],
    ['ocr/eng.traineddata.gz', new URL('./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', import.meta.url)]
  ]);

  const getAssetKey = (url) => {
    const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
    const marker = pathname.indexOf('/ocr/');
    return marker >= 0 ? pathname.slice(marker + 1) : pathname.replace(/^\/+/, '');
  };

  return {
    name: 'local-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const source = assets.get(getAssetKey(req.url || ''));
        if (!source) {
          next();
          return;
        }

        const key = getAssetKey(req.url || '');
        res.setHeader('Content-Type', key.endsWith('.wasm') ? 'application/wasm' : 'application/javascript');
        res.end(fs.readFileSync(fileURLToPath(source)));
      });
    },
    generateBundle() {
      assets.forEach((source, fileName) => {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(fileURLToPath(source)) });
      });
    }
  };
};

/**
 * Serves kokoro-js's onnxruntime runtime assets from node_modules in dev and
 * emits them into dist under /tts/onnx/ (mirrors localOcrAssetsPlugin /
 * piperAssetsPlugin). KokoroEngine pins transformers.js wasmPaths to
 * '/tts/onnx/' so ort fetches the wasm from here instead of the jsdelivr CDN
 * default (offline-first). Single-threaded only — numThreads = 1 is set in
 * initTTSEnv.js (T4), no COOP/COEP headers, no SAB.
 *
 * STATIC DISCOVERY (T3 gate): the onnxruntime-web dev build ships exactly two
 * wasm files — ort-wasm-simd-threaded.wasm and ort-wasm-simd-threaded.jsep.wasm
 * (no plain ort-wasm-simd.wasm / ort-wasm.wasm exist in this version); both are
 * served below. The phonemizer (kokoro-js's espeak-ng dep) is a wasm2js build:
 * its dist/ contains only JS bundles with the espeak-ng data inlined as
 * base64-gzip, and it uses neither `new URL(..., import.meta.url)` nor a
 * configurable path — so there is nothing to serve under /tts/phonemize/ and
 * no CDN reference possible; it rolls into the app JS bundle like any import.
 *
 * T4 RUNTIME TRACE (completion of the discovery gate): onnxruntime-web 1.22-dev
 * resolves EVERY wasm session against wasmPaths as wasmPaths +
 * 'ort-wasm-simd-threaded.jsep.mjs' — a 44KB Emscripten glue module that is
 * dynamically imported (Vite dev must serve it with a JS MIME type, which rules
 * out the /public dir — Vite refuses to transform public files) and then
 * fetches its sibling 'ort-wasm-simd-threaded.jsep.wasm' via locateFile
 * resolved against wasmPaths. Serve the glue here alongside the binaries.
 */
const ttsAssetsPlugin = () => {
  const assets = new Map([
    ['tts/onnx/ort-wasm-simd-threaded.wasm', new URL('./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', import.meta.url)],
    ['tts/onnx/ort-wasm-simd-threaded.jsep.wasm', new URL('./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', import.meta.url)],
    ['tts/onnx/ort-wasm-simd-threaded.jsep.mjs', new URL('./node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', import.meta.url)]
  ]);

  const getAssetKey = (url) => {
    const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
    const marker = pathname.indexOf('/tts/');
    return marker >= 0 ? pathname.slice(marker + 1) : pathname.replace(/^\/+/, '');
  };

  return {
    name: 'tts-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = getAssetKey(req.url || '');
        const source = assets.get(key);
        if (!source) {
          next();
          return;
        }

        res.setHeader('Content-Type', key.endsWith('.wasm') ? 'application/wasm' : (key.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream'));
        res.end(fs.readFileSync(fileURLToPath(source)));
      });
    },
    generateBundle(_, bundle) {
      assets.forEach((source, fileName) => {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(fileURLToPath(source)) });
      });
      // Drop the hashed ort-wasm copies Vite auto-emits via onnxruntime-web's
      // `new URL(..., import.meta.url)`: once wasmPaths points at /tts/onnx/
      // they are never fetched, and keeping them would double the wasm weight
      // in dist and risk precache bloat (prior art: dropOrtWasmPlugin @ 2af5a6d).
      for (const fileName of Object.keys(bundle)) {
        if (fileName.startsWith('assets/') && fileName.includes('ort-wasm')) delete bundle[fileName];
      }
    }
  };
};

export default defineConfig({
  plugins: [
    react(),
    localOcrAssetsPlugin(),
    ttsAssetsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // TTS runtime assets are far over the 5MB precache cap and only fetched
        // at runtime: the /tts/onnx/ ort wasm (21MB/11MB) served by
        // ttsAssetsPlugin. Model weights download from huggingface.co at first
        // use (by design), so offline TTS is out of scope — keep it all out of
        // the precache manifest.
        globIgnores: ['**/tts/**']
      },
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
    })
  ]
});
