/**
 * Pure helper functions shared by TTS engines: word-boundary chunking,
 * estimated word-boundary events, and rate clamping.
 */

/**
 * Split text into chunks of at most `maxChars` characters, never splitting a word.
 * Mirrors the 500-char cap semantics of splitTextIntoSegments (src/core/content.js):
 * internal whitespace is collapsed, chunks are trimmed, and a single word longer
 * than `maxChars` becomes one oversized chunk. Returns [] for empty/whitespace-only
 * input. Never mutates the input.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
export function splitIntoSizedChunks(text, maxChars = 500) {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized || maxChars <= 0) return [];

    const words = normalized.split(' ');
    const chunks = [];
    let chunk = '';
    for (const word of words) {
        const next = chunk ? `${chunk} ${word}` : word;
        if (chunk && next.length > maxChars) {
            chunks.push(chunk);
            chunk = word;
        } else {
            chunk = next;
        }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
}

/**
 * Estimate word-boundary events for `text` spread over `durationMs`.
 * Time is allocated proportionally to each word's character-length share of the
 * total non-space characters, so the last word ends at (or before) `durationMs`.
 * The returned events describe positions in `text` only (first word at charIndex 0);
 * consumers derive timing from the same proportional model. Returns [] for empty
 * text. Never mutates the input.
 * @param {string} text
 * @param {number} durationMs
 * @returns {Array<{ charIndex: number, charLength: number, name: 'word' }>}
 */
export function estimateWordBoundaries(text, durationMs) {
    const words = String(text ?? '').match(/\S+/g) || [];
    if (!words.length || !(durationMs > 0)) return [];

    const totalChars = words.reduce((sum, word) => sum + word.length, 0);
    const msPerChar = durationMs / totalChars;

    const boundaries = [];
    let charIndex = 0;
    let elapsed = 0;
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const charLength = word.length;
        boundaries.push({ charIndex, charLength, name: 'word' });
        // Give the last word the remaining time so the final boundary never
        // overshoots durationMs (within floating-point rounding).
        const wordMs = i === words.length - 1 ? Math.max(0, durationMs - elapsed) : charLength * msPerChar;
        elapsed += wordMs;
        charIndex += charLength + 1;
    }
    return boundaries;
}

/**
 * Clamp a playback rate into [min, max].
 * @param {number} rate
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clampRate(rate, min = 0.7, max = 2.0) {
    return Math.min(max, Math.max(min, rate));
}
