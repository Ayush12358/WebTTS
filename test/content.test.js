import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, normalizeOcrWords, splitTextIntoSegments, textToHtml } from '../src/core/content.js';

test('text rendering escapes markup and preserves hard line breaks', () => {
    const html = textToHtml('<script>alert(1)</script>\nnext line');
    assert.match(html, /^<p>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /<br>/);
    assert.doesNotMatch(html, /<script>/);
});

test('sentence extraction keeps punctuation boundaries', () => {
    assert.deepEqual(
        splitTextIntoSegments('First sentence. Second sentence! Third sentence?'),
        ['First sentence.', 'Second sentence!', 'Third sentence?']
    );
});

test('long sentences split at word boundaries', () => {
    const value = `${'word '.repeat(130)}finish.`;
    const segments = splitTextIntoSegments(value);
    assert.ok(segments.length > 1);
    assert.ok(segments.every(segment => segment.length <= 500));
    assert.equal(segments.join(' ').replace(/\s+/g, ' ').trim(), value.replace(/\s+/g, ' ').trim());
});

test('HTML escaping covers attribute delimiters', () => {
    assert.equal(escapeHtml('"&<>\''), '&quot;&amp;&lt;&gt;&#39;');
});

test('OCR word geometry keeps valid local overlay boxes', () => {
    assert.deepEqual(
        normalizeOcrWords([
            { text: 'Hello', bbox: { x0: 4, y0: 8, x1: 40, y1: 20 } },
            { text: ' ', bbox: { x0: 0, y0: 0, x1: 0, y1: 0 } },
            { text: 'invalid', bbox: { x0: 5, y0: 5, x1: 4, y1: 10 } }
        ]),
        [{ text: 'Hello', x0: 4, y0: 8, x1: 40, y1: 20 }]
    );
});
