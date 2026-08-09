import createDOMPurify from 'dompurify';
import { splitIntoSizedChunks } from './tts/ttsUtils.js';

const ALLOWED_TAGS = [
    'a', 'article', 'b', 'blockquote', 'br', 'code', 'dd', 'div', 'dl', 'dt',
    'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'i', 'img', 'li', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small',
    'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th',
    'thead', 'tr', 'u', 'ul'
];

const ALLOWED_ATTR = [
    'alt', 'class', 'colspan', 'dir', 'height', 'href', 'id', 'lang', 'rowspan',
    'scope', 'src', 'start', 'target', 'title', 'type', 'width'
];

const LOCAL_URI_REGEXP = /^(?:#|blob:|data:image\/(?:png|gif|jpe?g|webp);)/i;
const SPEAKABLE_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,dt,dd,td,th';

function getSanitizer() {
    if (typeof window === 'undefined') return null;
    return createDOMPurify(window);
}

/**
 * Sanitize imported document HTML. Only in-memory/local resource URLs survive.
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
    const value = String(html ?? '');
    const sanitizer = getSanitizer();
    if (!sanitizer) return escapeHtml(value);

    return sanitizer.sanitize(value, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: LOCAL_URI_REGEXP,
        FORBID_TAGS: ['base', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'script', 'style', 'textarea'],
        RETURN_TRUSTED_TYPE: false
    });
}

/**
 * Escape untrusted text before putting it into generated HTML.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Render plain text as local, escaped paragraph HTML.
 * @param {string} text
 * @returns {string}
 */
export function textToHtml(text) {
    const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) return '';

    return normalized
        .split(/\n{2,}/)
        .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
        .join('');
}

/**
 * Split extracted text into readable TTS segments.
 * @param {string} text
 * @returns {string[]}
 */
export function splitTextIntoSegments(text) {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const sentences = normalized.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g) || [normalized];
    return sentences.flatMap(sentence => {
        const value = sentence.trim();
        if (value.length <= 500) return value ? [value] : [];

        const words = value.split(' ');
        const chunks = [];
        let chunk = '';
        for (const word of words) {
            const next = chunk ? `${chunk} ${word}` : word;
            if (chunk && next.length > 500) {
                chunks.push(chunk);
                chunk = word;
            } else {
                chunk = next;
            }
        }
        if (chunk) chunks.push(chunk);
        return chunks;
    });
}
/**
 * Normalize OCR word geometry for the PDF text overlay.
 * @param {Array<{ text?: string, bbox?: { x0?: number, y0?: number, x1?: number, y1?: number } }>} words
 * @returns {Array<{ text: string, x0: number, y0: number, x1: number, y1: number }>}
 */
export function normalizeOcrWords(words) {
    return (words || [])
        .map(word => ({
            text: String(word?.text || '').trim(),
            x0: Number(word?.bbox?.x0),
            y0: Number(word?.bbox?.y0),
            x1: Number(word?.bbox?.x1),
            y1: Number(word?.bbox?.y1)
        }))
        .filter(word => word.text && [word.x0, word.y0, word.x1, word.y1].every(Number.isFinite))
        .filter(word => word.x1 > word.x0 && word.y1 > word.y0);
}

/**
 * Flow-chunk an element whose trimmed text exceeds `maxChars` but whose every
 * direct text node is <= `maxChars` (heavily inline-marked content, e.g.
 * `<p>word <em>a</em> word <em>b</em> ...</p>` totaling >500 chars). The
 * element stays an unmarked container; its content is tokenized in document
 * order into atomic WORD tokens (from text nodes) and INLINE ELEMENT tokens
 * (elements with <= `maxChars` text, appended whole so markup survives), packed
 * greedily into chunks of at most `maxChars` plain-text chars (a single token
 * longer than the cap — an unbroken word — becomes its own oversized single-
 * word chunk, the documented exception), and rebuilt as sequential
 * `.tts-speakable` spans with trimmed single-space `data-tts-text`. An inline
 * element itself longer than `maxChars` is never absorbed: it is flow-chunked
 * recursively in place as its own unmarked container. The element's original
 * leading/trailing whitespace survives as literal text nodes around the spans;
 * trimming applies only to `data-tts-text`.
 * @param {Element} element
 * @param {Array<{ id: number, text: string }>} segments
 * @param {number} maxChars
 */
function flowChunkElement(element, segments, maxChars) {
    const tokens = [];
    for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            for (const word of (child.nodeValue || '').split(/\s+/)) {
                if (word) tokens.push({ kind: 'word', text: word, len: word.length });
            }
        } else if (child.nodeType === Node.ELEMENT_NODE) {
            const len = (child.textContent || '').trim().length;
            tokens.push({ kind: len > maxChars ? 'oversized' : 'inline', node: child, len });
        }
    }

    // Preserve the element's original leading/trailing whitespace (from its
    // edge text nodes) as literal text nodes around the rebuilt spans.
    const firstChild = element.firstChild;
    const lastChild = element.lastChild;
    const leading = firstChild?.nodeType === Node.TEXT_NODE ? (firstChild.nodeValue || '').match(/^\s+/)?.[0] || '' : '';
    const trailing = lastChild?.nodeType === Node.TEXT_NODE ? (lastChild.nodeValue || '').match(/\s+$/)?.[0] || '' : '';

    const fragment = document.createDocumentFragment();
    if (leading) fragment.appendChild(document.createTextNode(leading));

    let pack = [];
    let packLen = 0;
    // Separates consecutive content items (chunk spans / recursed containers)
    // with a literal ' ' text node so rendered words never merge at boundaries.
    let hasContentItem = false;
    const flushChunk = () => {
        if (!pack.length) return;
        const span = document.createElement('span');
        span.className = 'tts-speakable';
        const id = segments.length;
        const text = pack
            .map(token => (token.kind === 'word' ? token.text : token.node.textContent || ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        span.setAttribute('data-tts-index', String(id));
        span.setAttribute('data-tts-text', text);
        segments.push({ id, text });
        pack.forEach((token, i) => {
            if (i > 0) span.appendChild(document.createTextNode(' '));
            if (token.kind === 'word') span.appendChild(document.createTextNode(token.text));
            else span.appendChild(token.node);
        });
        if (hasContentItem) fragment.appendChild(document.createTextNode(' '));
        fragment.appendChild(span);
        hasContentItem = true;
        pack = [];
        packLen = 0;
    };

    for (const token of tokens) {
        if (token.kind === 'oversized') {
            flushChunk();
            flowChunkElement(token.node, segments, maxChars);
            if (hasContentItem) fragment.appendChild(document.createTextNode(' '));
            fragment.appendChild(token.node);
            hasContentItem = true;
        } else if (packLen && packLen + 1 + token.len > maxChars) {
            flushChunk();
            pack.push(token);
            packLen += packLen ? 1 + token.len : token.len;
        } else {
            pack.push(token);
            packLen += packLen ? 1 + token.len : token.len;
        }
    }
    flushChunk();
    if (trailing) fragment.appendChild(document.createTextNode(trailing));

    while (element.firstChild) element.removeChild(element.firstChild);
    element.appendChild(fragment);
}

/**
 * Add reader segment markers to sanitized HTML.
 *
 * Speakable elements whose trimmed text is <= 500 chars keep the single-element
 * marking (with `data-tts-text`). Longer elements are kept as unmarked
 * containers; every direct text node longer than 500 chars is split into
 * sequential `.tts-speakable` chunk spans (inline markup is preserved — text is
 * NEVER flattened via textContent). Chunk-boundary whitespace is retained as
 * literal `' '` text nodes between adjacent spans, and each chunked text node's
 * original leading/trailing whitespace survives as literal text nodes around
 * its spans — trimming applies only to `data-tts-text` and chunk-internal
 * boundaries, never to rendered whitespace.
 * @param {string} html
 * @returns {{ html: string, segments: Array<{ id: number, text: string }> }}
 */
export function prepareHtmlContent(html) {
    if (typeof document === 'undefined') {
        return { html: sanitizeHtml(html), segments: [] };
    }

    const container = document.createElement('div');
    container.innerHTML = sanitizeHtml(html);
    const segments = [];

    container.querySelectorAll(SPEAKABLE_SELECTOR).forEach(element => {
        if (element.closest('.tts-speakable')) return;
        const text = (element.innerText || element.textContent || '').trim();
        if (!text) return;

        if (text.length <= 500) {
            const id = segments.length;
            element.classList.add('tts-speakable');
            element.setAttribute('data-tts-index', String(id));
            element.setAttribute('data-tts-text', text);
            segments.push({ id, text });
            return;
        }

        // Long element: keep it as an unmarked container and chunk every direct
        // text node longer than 500 chars independently, preserving inline tags.
        Array.from(element.childNodes).forEach(child => {
            if (child.nodeType !== Node.TEXT_NODE) return;
            const raw = child.nodeValue || '';
            if (raw.length <= 500) return;

            const chunks = splitIntoSizedChunks(raw, 500);
            if (!chunks.length) return;

            // Preserve the text node's original leading/trailing whitespace as
            // literal text nodes around the chunk spans (trimming applies only
            // to data-tts-text and chunk-internal boundaries).
            const leading = raw.match(/^\s+/)?.[0] || '';
            const trailing = raw.match(/\s+$/)?.[0] || '';

            const replacement = [];
            if (leading) replacement.push(document.createTextNode(leading));
            chunks.forEach((chunk, i) => {
                if (i > 0) replacement.push(document.createTextNode(' '));
                const span = document.createElement('span');
                span.className = 'tts-speakable';
                const id = segments.length;
                span.setAttribute('data-tts-index', String(id));
                span.setAttribute('data-tts-text', chunk);
                span.textContent = chunk;
                segments.push({ id, text: chunk });
                replacement.push(span);
            });
            if (trailing) replacement.push(document.createTextNode(trailing));

            const parent = child.parentNode;
            replacement.forEach(node => parent.insertBefore(node, child));
            parent.removeChild(child);
        });

        // Fallback for the heavily-inline-marked case: total trimmed text
        // >500 chars but no direct text node >500 chars, so the pass above
        // created no chunk spans. Flow-chunk the whole content into <=500-char
        // spans so no oversized segment is ever produced (single-word chunks
        // >500 chars remain the only documented exception).
        if (!element.querySelector('.tts-speakable')) {
            flowChunkElement(element, segments, 500);
        }
    });

    return { html: container.innerHTML, segments };
}

/**
 * Read the stable text/index pair from a marked reader element.
 * @param {Element} element
 * @returns {{ index: number, text: string }|null}
 */
export function getElementSegment(element) {
    if (!element?.getAttribute) return null;
    const rawIndex = element.getAttribute('data-tts-index');
    if (rawIndex === null) return null;
    const index = Number.parseInt(rawIndex, 10);
    if (!Number.isInteger(index)) return null;
    return {
        index,
        text: (element.getAttribute('data-tts-text') || element.innerText || element.textContent || '').trim()
    };
}

export { SPEAKABLE_SELECTOR };
