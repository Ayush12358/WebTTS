import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineKokoroEngine, FREE_ENDPOINTS } from './OnlineKokoroEngine.js';
import { DEFAULT_VOICE, KOKORO_VOICES } from './ttsUtils.js';

/** Minimal AudioContext stand-in: 1ch buffers, recordable sources, fake decode. */
function makeFakeContext() {
    const sources = [];
    const pcmData = new Float32Array(100);
    pcmData.fill(0.1);
    const context = {
        destination: {},
        async resume() { },
        async suspend() { },
        createBuffer(channels, length, sampleRate) {
            return { numberOfChannels: channels, length, sampleRate, copyToChannel() { } };
        },
        createBufferSource() {
            const source = {
                buffer: null,
                onended: null,
                started: false,
                stopped: false,
                connect() { },
                start() { this.started = true; },
                stop() { this.stopped = true; },
                disconnect() { }
            };
            sources.push(source);
            return source;
        },
        decodeAudioData() {
            return Promise.resolve({
                sampleRate: 1000,
                length: 100,
                numberOfChannels: 1,
                copyFromChannel(out) { out.set(pcmData); }
            });
        }
    };
    return { context, sources };
}

test('no key → free endpoint without Authorization; with key → DeepInfra with Bearer', async (t) => {
    const engine = new OnlineKokoroEngine();
    const { context } = makeFakeContext();
    engine._audioContext = context; // decodeAudioData stub — no window in node
    const calls = [];
    global.fetch = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    t.after(() => { delete global.fetch; });

    await engine.prefetch('hello', {});
    assert.equal(calls.length, 1);
    assert.ok(FREE_ENDPOINTS.includes(calls[0].url), 'free path hits a pool endpoint');
    assert.equal(calls[0].init.headers.Authorization, undefined);
    assert.equal(calls[0].init.body.includes('"model"'), false, 'free path must not send a model field');

    engine.setApiKey('k');
    await engine.prefetch('hello', {});
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, 'https://api.deepinfra.com/v1/audio/speech');
    assert.equal(calls[1].init.headers.Authorization, 'Bearer k');
    assert.equal(JSON.parse(calls[1].init.body).model, 'hexgrad/Kokoro-82M');
});

test('free path network failure → onError mentions the free space or the key hint', async (t) => {
    const engine = new OnlineKokoroEngine();
    let callCount = 0;
    global.fetch = async () => { callCount++; throw new Error('network down'); };
    t.after(() => { delete global.fetch; });
    const origError = console.error;
    console.error = () => { };
    try {
        let errorMessage = null;
        await engine.speak('hello', {}, { onError: (e) => { errorMessage = e.message; } });
        assert.match(errorMessage, /Free/);
        assert.match(errorMessage, /DeepInfra key/);
        assert.equal(callCount, FREE_ENDPOINTS.length, 'every pool endpoint was tried before giving up');
    } finally {
        console.error = origError;
    }
});

test('free pool failover: failed endpoint is skipped, next one serves', async (t) => {
    const engine = new OnlineKokoroEngine();
    const { context } = makeFakeContext();
    engine._audioContext = context;
    let callCount = 0;
    const calls = [];
    global.fetch = async (url, init) => {
        calls.push(url);
        callCount++;
        if (callCount === 1) throw new Error('first endpoint down');
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    t.after(() => { delete global.fetch; });

    const result = await engine.prefetch('hello', {});
    assert.notEqual(result, null, 'failover should still produce audio');
    assert.equal(calls.length, 2, 'one failure + one success');
    assert.notEqual(calls[0], calls[1], 'failover must use a different endpoint');
    assert.ok(calls.every(url => FREE_ENDPOINTS.includes(url)), 'both calls hit pool endpoints');
});

test('cooldown: a cooled endpoint is skipped by the next request', async (t) => {
    const engine = new OnlineKokoroEngine();
    const { context } = makeFakeContext();
    engine._audioContext = context;
    engine._markCooldown(FREE_ENDPOINTS[0]);
    const calls = [];
    global.fetch = async (url) => {
        calls.push(url);
        return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    t.after(() => { delete global.fetch; });

    await engine.prefetch('hello', {});
    await engine.prefetch('hello', {});
    assert.equal(calls.length, 2);
    assert.ok(calls.every(url => url !== FREE_ENDPOINTS[0]), 'cooled endpoint never called');
    assert.notEqual(calls[0], calls[1], 'round-robin advanced past the cooled endpoint');
});

test('all endpoints failing → prefetch returns null', async (t) => {
    const engine = new OnlineKokoroEngine();
    let callCount = 0;
    global.fetch = async () => { callCount++; throw new Error('network down'); };
    t.after(() => { delete global.fetch; });
    const origError = console.error;
    console.error = () => { };
    try {
        assert.equal(await engine.prefetch('hello', {}), null);
        assert.equal(callCount, FREE_ENDPOINTS.length, 'every pool endpoint was tried exactly once');
    } finally {
        console.error = origError;
    }
});

test('speak with a 401 response calls onError mentioning the key', async (t) => {
    const engine = new OnlineKokoroEngine();
    engine.setApiKey('bad-key');
    global.fetch = async () => ({ ok: false, status: 401 });
    t.after(() => { delete global.fetch; });
    let errorMessage = null;
    await engine.speak('hello', {}, { onError: (e) => { errorMessage = e.message; } });
    assert.match(errorMessage, /401/);
    assert.match(errorMessage, /key/i);
});

test('happy path: onStart, increasing word boundaries, onEnd; fetch never called', async () => {
    const engine = new OnlineKokoroEngine();
    engine.setApiKey('test-key');
    const { context, sources } = makeFakeContext();
    engine._audioContext = context;
    const events = [];
    const callbacks = {
        onStart: () => events.push({ type: 'start' }),
        onBoundary: (b) => events.push({ type: 'boundary', ...b }),
        onEnd: () => events.push({ type: 'end' }),
        onError: (e) => events.push({ type: 'error', message: e.message })
    };
    // 100 samples @ 1000Hz = 100ms of audio; 'hello world' = 10 chars → one
    // boundary at ~0ms (charIndex 0), one at ~50ms (charIndex 6).
    const pcm = new Float32Array(100);
    await engine.speak('hello world', {
        voiceId: 'af_heart',
        rate: 1,
        audioObject: { audio: pcm, sampleRate: 1000 }
    }, callbacks);

    assert.ok(events.some(e => e.type === 'start'), 'onStart should fire');
    await new Promise(r => setTimeout(r, 150));
    const boundaries = events.filter(e => e.type === 'boundary');
    assert.ok(boundaries.length >= 2, `expected both boundaries, got ${boundaries.length}`);
    assert.equal(boundaries[0].charIndex, 0);
    assert.equal(boundaries[0].charLength, 5);
    assert.equal(boundaries[1].charIndex, 6);
    assert.equal(boundaries[1].charLength, 5);
    assert.equal(boundaries[0].charIndex < boundaries[1].charIndex, true, 'charIndex increasing');

    sources[0].onended();
    assert.ok(events.some(e => e.type === 'end'), 'onEnd should fire');
    assert.ok(!events.some(e => e.type === 'error'), 'no onError on happy path');
});

test('stop() during synthesis is silent: no onEnd, no onError', async () => {
    const engine = new OnlineKokoroEngine();
    engine.setApiKey('test-key');
    global.fetch = (url, init) => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
            const error = new Error('The operation was aborted.');
            error.name = 'AbortError';
            reject(error);
        });
    });
    let onEndCalls = 0;
    let onErrorCalls = 0;
    const speakPromise = engine.speak('hello', {}, {
        onEnd: () => onEndCalls++,
        onError: () => onErrorCalls++
    });
    engine.stop(); // aborts the in-flight fetch
    await speakPromise;
    assert.equal(onEndCalls, 0);
    assert.equal(onErrorCalls, 0);
});

test('prefetch never rejects: fetch failure yields null with and without a key', async (t) => {
    const engine = new OnlineKokoroEngine();
    engine.setApiKey('test-key');
    global.fetch = async () => { throw new Error('network down'); };
    t.after(() => { delete global.fetch; });
    const origError = console.error;
    console.error = () => { };
    try {
        assert.equal(await engine.prefetch('hello', {}), null);
        assert.equal(await new OnlineKokoroEngine().prefetch('hello', {}), null);
    } finally {
        console.error = origError;
    }
});

test('pause during synthesis holds audio; resume replays without re-synthesis', async (t) => {
    const engine = new OnlineKokoroEngine();
    engine.setApiKey('test-key');
    const { context, sources } = makeFakeContext();
    engine._audioContext = context;
    let fetchCalls = 0;
    let resolveFetch;
    global.fetch = () => {
        fetchCalls++;
        return new Promise(resolve => { resolveFetch = resolve; });
    };
    t.after(() => { delete global.fetch; });

    const events = [];
    const callbacks = {
        onStart: () => events.push('start'),
        onEnd: () => events.push('end'),
        onError: (e) => events.push(`error:${e.message}`)
    };

    const speakPromise = engine.speak('hello world', {}, callbacks);
    engine.pause(); // pause lands while the fetch is in flight
    resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await speakPromise;

    // Held: nothing started, no callbacks fired, fetch not repeated.
    assert.equal(fetchCalls, 1);
    assert.deepEqual(events, []);
    assert.equal(sources.length, 0);

    engine.resume(); // replays the held buffer from the start
    await new Promise(r => setTimeout(r, 0)); // let _playBuffer's awaits run
    assert.deepEqual(events, ['start']);
    assert.equal(sources.length, 1);
    assert.equal(sources[0].started, true);

    sources[0].onended();
    assert.deepEqual(events, ['start', 'end']);
});

test('voices come from the shared static Kokoro list', async () => {
    const engine = new OnlineKokoroEngine();
    assert.equal(engine.name, 'Kokoro (Online)');
    assert.deepEqual(await engine.getVoices(), KOKORO_VOICES);
    assert.equal(DEFAULT_VOICE, 'af_heart');
});
