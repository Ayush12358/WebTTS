import { env } from '@huggingface/transformers';

/**
 * Shared transformers.js environment setup for the Kokoro engine.
 *
 * SINGLE SOURCE OF TRUTH: both synthesis paths MUST call this before any model
 * load — kokoro.worker.js at module top, and KokoroEngine's main-thread
 * fallback (via dynamic import) inside _getModel(). Without it, transformers.js
 * falls back to its version-matched jsdelivr CDN for the ort-wasm files,
 * violating the no-CDN constraint and breaking offline-first use.
 *
 * WASM RUNTIME FILES (verified at implementation): onnxruntime-web 1.22-dev
 * resolves EVERY wasm session against wasmPaths as
 * wasmPaths + 'ort-wasm-simd-threaded.jsep.mjs' — a 44KB Emscripten glue module
 * that is dynamically imported (a JS MIME type is required, so /public would be
 * refused by Vite's transform pipeline) and then fetches its sibling
 * 'ort-wasm-simd-threaded.jsep.wasm' via locateFile resolved against wasmPaths.
 * All three files are served under /tts/onnx/ by the ttsAssetsPlugin
 * (vite.config.js, asset map completed by the T4 runtime trace) — no CDN.
 *
 * @huggingface/transformers is a transitive dependency of kokoro-js (installed
 * at the top level of node_modules) — no direct dependency is added. In
 * transformers.js v3, env.backends.onnx IS the onnxruntime-web env object, so
 * `wasm.wasmPaths` / `wasm.numThreads` are the ort-native knobs.
 */
let configured = false;

export function initTTSEnv() {
    if (configured) return;
    configured = true;

    // Serve ort-wasm locally via the vite ttsAssetsPlugin (/tts/onnx/ in dev
    // and dist) instead of the jsdelivr CDN default.
    env.backends.onnx.wasm.wasmPaths = '/tts/onnx/';

    // Persist the downloaded model + tokenizer in the Cache API where quota
    // allows (Cache name: 'transformers-cache'), so subsequent sessions skip
    // the ~83MB re-download.
    env.useBrowserCache = true;

    // Single-threaded WASM: no COOP/COEP headers on static hosting, no SAB,
    // and onnxruntime#11679 (iOS) — keep numThreads at 1.
    env.backends.onnx.wasm.numThreads = 1;
}
