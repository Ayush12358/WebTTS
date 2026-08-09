import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRate, estimateWordBoundaries, splitIntoSizedChunks } from '../src/core/tts/ttsUtils.js';

test('chunking keeps words intact and trims whitespace', () => {
    const chunks = splitIntoSizedChunks('  one   two  three ', 500);
    assert.deepEqual(chunks, ['one two three']);
});

test('chunking splits at word boundaries under the cap', () => {
    const chunks = splitIntoSizedChunks('aaaaaa bbbbbb ccc', 10);
    assert.deepEqual(chunks, ['aaaaaa', 'bbbbbb ccc']);
    assert.ok(chunks.every(chunk => chunk === chunk.trim()));
});

test('chunking caps chunks at 500 chars', () => {
    const value = `${'word '.repeat(130)}finish.`;
    const chunks = splitIntoSizedChunks(value);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(chunk => chunk.length <= 500));
    assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), value.replace(/\s+/g, ' ').trim());
});

test('chunking returns [] for empty or whitespace-only input', () => {
    assert.deepEqual(splitIntoSizedChunks(''), []);
    assert.deepEqual(splitIntoSizedChunks('   \n\t '), []);
    assert.deepEqual(splitIntoSizedChunks(null), []);
});

test('chunking handles a single word longer than the cap without crashing', () => {
    const longWord = 'x'.repeat(600);
    assert.deepEqual(splitIntoSizedChunks(longWord), [longWord]);
});

test('chunking does not mutate the input', () => {
    const value = '  spaced   out  ';
    splitIntoSizedChunks(value);
    assert.equal(value, '  spaced   out  ');
});

test('boundary estimation returns proportional word events', () => {
    const boundaries = estimateWordBoundaries('hello world', 1000);
    assert.equal(boundaries.length, 2);
    assert.equal(boundaries[0].charIndex, 0);
    assert.equal(boundaries[0].charLength, 5);
    assert.equal(boundaries[1].charIndex, 6);
    assert.equal(boundaries[1].charLength, 5);
    assert.ok(boundaries[1].charIndex > boundaries[0].charIndex);
    for (const boundary of boundaries) {
        assert.equal(boundary.name, 'word');
        assert.ok(boundary.charLength > 0);
    }
});

test('boundary estimation total time matches durationMs', () => {
    const text = 'the quick brown fox jumps over the lazy dog';
    const durationMs = 4500;
    const boundaries = estimateWordBoundaries(text, durationMs);
    const totalChars = text.match(/\S+/g).reduce((sum, word) => sum + word.length, 0);
    const msPerChar = durationMs / totalChars;
    const lastEnd = boundaries.reduce((sum, boundary) => sum + boundary.charLength, 0) * msPerChar;
    assert.ok(Math.abs(lastEnd - durationMs) < 1);
    assert.ok(lastEnd <= durationMs + 1);
});

test('boundary estimation returns [] for empty text', () => {
    assert.deepEqual(estimateWordBoundaries('', 1000), []);
    assert.deepEqual(estimateWordBoundaries('   ', 1000), []);
    assert.deepEqual(estimateWordBoundaries('hello', 0), []);
});

test('boundary estimation does not mutate the input', () => {
    const value = 'one two three';
    estimateWordBoundaries(value, 3000);
    assert.equal(value, 'one two three');
});

test('clampRate clamps below min, above max, and passes through inside', () => {
    assert.equal(clampRate(0.5), 0.7);
    assert.equal(clampRate(2.5), 2.0);
    assert.equal(clampRate(1.0), 1.0);
    assert.equal(clampRate(0.1, 0.5, 4.0), 0.5);
    assert.equal(clampRate(3.0, 0.5, 4.0), 3.0);
});
