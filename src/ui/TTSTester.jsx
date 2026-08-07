import React, { useState, useEffect, useCallback } from 'react';
import { engines, getAvailableEngines } from '../core/tts';
import { Play, Square, RefreshCcw } from 'lucide-react';

export function TTSTester() {
    const [text, setText] = useState("This is a simple test of the text-to-speech system.");
    const [selectedEngine, setSelectedEngine] = useState('kokoro');
    const [selectedVoice, setSelectedVoice] = useState('');
    const [voices, setVoices] = useState([]);
    const [status, setStatus] = useState('Idle');
    const [logs, setLogs] = useState([]);
    const [controls, setControls] = useState({ rate: 1.0, pitch: 1.0 });

    const log = useCallback((msg) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
    }, []);

    const loadVoices = useCallback(async () => {
        setStatus('Initializing...');
        try {
            const engine = engines[selectedEngine];
            await engine.init();
            const list = await engine.getVoices();
            setVoices(list);
            if (list.length > 0) {
                setSelectedVoice(list[0].id);
                log(`Loaded ${list.length} voices for ${selectedEngine}`);
            }
            setStatus('Ready');
        } catch (e) {
            setStatus('Error');
            log(`Error: ${e.message}`);
        }
    }, [selectedEngine, log]);

    useEffect(() => {
        const timer = setTimeout(loadVoices, 0);
        return () => clearTimeout(timer);
    }, [loadVoices]);

    const handleSpeak = async () => {
        if (!selectedVoice) return;
        setStatus('Speaking...');
        try {
            const engine = engines[selectedEngine];
            await engine.speak(text, {
                voiceId: selectedVoice,
                rate: controls.rate,
                pitch: controls.pitch
            }, {
                onStart: () => setStatus('Playing'),
                onEnd: () => setStatus('Finished'),
                onError: (e) => {
                    setStatus('Error');
                    log(`Speech Error: ${e}`);
                }
            });
        } catch (e) {
            setStatus('Exception');
            log(`Exception: ${e.message}`);
        }
    };

    const handleStop = () => {
        engines[selectedEngine].stop();
        setStatus('Stopped');
    };

    return (
        <div style={{
            maxWidth: '600px',
            margin: '0 auto',
            padding: '2rem 1rem',
            color: 'var(--text-primary)',
            fontFamily: 'inherit'
        }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Status Indicator */}
                <div
                    role="status"
                    aria-live="polite"
                    style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '8px',
                        background: 'var(--bg-secondary)',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: status === 'Playing' ? '#22c55e' : '#94a3b8'
                    }} />
                    <span>Status: <strong style={{ color: 'var(--text-primary)' }}>{status}</strong></span>
                </div>

                {/* Main Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label htmlFor="tts-test-engine" style={{ fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.7 }}>ENGINE</label>
                        <select
                            id="tts-test-engine"
                            value={selectedEngine}
                            onChange={e => setSelectedEngine(e.target.value)}
                            style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)', background: 'transparent', color: 'inherit' }}
                        >
                            {getAvailableEngines().map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label htmlFor="tts-test-voice" style={{ fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.7 }}>VOICE</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select
                                id="tts-test-voice"
                                value={selectedVoice}
                                onChange={e => setSelectedVoice(e.target.value)}
                                disabled={!voices.length}
                                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)', background: 'transparent', color: 'inherit' }}
                            >
                                {voices.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <button onClick={loadVoices} aria-label="Refresh voices" title="Refresh voices" style={{ padding: '0.5rem', background: 'transparent', border: '1px solid var(--border-color, #ccc)', borderRadius: '4px', color: 'inherit' }}><RefreshCcw size={16} /></button>
                    </div>
                </div>

                </div>
                {/* Sliders */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                        <label htmlFor="tts-test-rate" style={{ fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.7 }}>SPEED ({controls.rate}x)</label>
                        <input id="tts-test-rate" type="range" min="0.5" max="2.0" step="0.1" value={controls.rate} onChange={e => setControls({ ...controls, rate: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                    <div>
                        <label htmlFor="tts-test-pitch" style={{ fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.7 }}>PITCH ({controls.pitch}x)</label>
                        <input id="tts-test-pitch" type="range" min="0.5" max="2.0" step="0.1" value={controls.pitch} onChange={e => setControls({ ...controls, pitch: parseFloat(e.target.value) })} style={{ width: '100%' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label htmlFor="tts-test-text" style={{ fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.7 }}>TEST TEXT</label>
                    <textarea
                        id="tts-test-text"
                        value={text}
                        onChange={e => setText(e.target.value)}
                        style={{ padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color, #ccc)', background: 'transparent', color: 'inherit', minHeight: '80px', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={handleSpeak}
                        disabled={!selectedVoice || status === 'Speaking...'}
                        style={{ flex: 1, padding: '0.75rem', background: 'var(--accent-color, #3b82f6)', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                    >
                        <Play size={18} fill="currentColor" /> SPEAK
                    </button>
                    <button
                        onClick={handleStop}
                        aria-label="Stop playback"
                        title="Stop playback"
                        style={{ padding: '0.75rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        <Square size={18} fill="currentColor" />
                    </button>
                </div>

                {/* Simple Log */}
                <div style={{ marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>History</h3>
                    <div style={{
                        height: '150px',
                        overflowY: 'auto',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        background: 'var(--bg-secondary)',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)'
                    }}>
                        {logs.map((l, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{l}</div>)}
                        {logs.length === 0 && <div style={{ opacity: 0.5 }}>No events logged yet.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
