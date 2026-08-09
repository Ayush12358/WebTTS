import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_VOICE, KOKORO_VOICES, KokoroEngine } from '../src/core/tts/KokoroEngine.js';

const PRIOR_ART_IDS = [
    'af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_michael',
    'am_puck', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'
];

test('voice list is static with exactly the 10 curated Kokoro voices', () => {
    assert.equal(KOKORO_VOICES.length, 10);
    assert.deepEqual(KOKORO_VOICES.map(v => v.id), PRIOR_ART_IDS);
    for (const voice of KOKORO_VOICES) {
        assert.equal(typeof voice.id, 'string');
        assert.equal(typeof voice.name, 'string');
        assert.equal(typeof voice.lang, 'string');
        assert.equal(voice.source, 'Kokoro');
        assert.ok(voice.name.length > 0);
    }
});

test('DEFAULT_VOICE is af_heart and present in the static list', () => {
    assert.equal(DEFAULT_VOICE, 'af_heart');
    assert.ok(KOKORO_VOICES.some(v => v.id === DEFAULT_VOICE));
});

test('voice ids are unique', () => {
    const ids = KOKORO_VOICES.map(v => v.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('getVoices() returns the static list without loading the model', async () => {
    const engine = new KokoroEngine();
    assert.equal(engine.name, 'Kokoro (On-device Neural)');
    const voices = await engine.getVoices();
    assert.deepEqual(voices, KOKORO_VOICES);
    // The static list is returned by reference — no model state is touched.
    assert.equal(engine._modelPromise, null);
});
