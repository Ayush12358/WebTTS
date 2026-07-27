import { createWorker } from 'tesseract.js';
import { normalizeOcrWords } from './content';

const OCR_WORKER_URL = `${import.meta.env.BASE_URL}ocr/worker.min.js`;
const OCR_CORE_URL = `${import.meta.env.BASE_URL}ocr/tesseract-core-lstm.wasm.js`;
const OCR_LANG_PATH = `${import.meta.env.BASE_URL}ocr`;

let workerPromise = null;
let progressListener = null;


function createOcrWorker(onProgress) {
    if (!workerPromise) {
        workerPromise = createWorker('eng', 1, {
            workerPath: OCR_WORKER_URL,
            workerBlobURL: false,
            corePath: OCR_CORE_URL,
            langPath: OCR_LANG_PATH,
            gzip: true,
            logger: message => {
                progressListener?.(message);
                onProgress?.(message);
            }
        }).catch(error => {
            workerPromise = null;
            throw error;
        });
    }
    return workerPromise;
}

function flattenWords(blocks) {
    return (blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => (
        (paragraph.lines || []).flatMap(line => line.words || [])
    )));
}

/**
 * OCR one already-rendered PDF canvas. The canvas never leaves the browser.
 * @param {HTMLCanvasElement} canvas
 * @param {(message: { status?: string, progress?: number }) => void} onProgress
 * @returns {Promise<{ text: string, words: Array<{ text: string, x0: number, y0: number, x1: number, y1: number }>, confidence: number|null }>}
 */
export async function recognizePdfCanvas(canvas, onProgress) {
    if (!canvas) throw new Error('OCR requires a rendered PDF canvas');

    progressListener = onProgress || null;
    try {
        const worker = await createOcrWorker(onProgress);
        const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
        const text = String(result.data?.text || '').trim();
        let words = normalizeOcrWords(flattenWords(result.data?.blocks));
        if (!words.length && text) {
            // Keep OCR text speakable even when Tesseract returns no word boxes.
            words = normalizeOcrWords([{
                text,
                bbox: { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height }
            }]);
        }
        return {
            text: text || words.map(word => word.text).join(' '),
            words,
            confidence: Number.isFinite(result.data?.confidence) ? result.data.confidence : null
        };
    } finally {
        progressListener = null;
    }
}

/**
 * End the shared OCR worker. Primarily useful when the app is shutting down.
 */
export async function terminateOcrWorker() {
    if (!workerPromise) return;
    const worker = await workerPromise;
    workerPromise = null;
    await worker.terminate();
}
