import React, { useState, useEffect } from 'react';
import { engines, getAvailableEngines } from '../core/tts';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TTSTester() {
    const [text, setText] = useState("Hello world. This is a test of the text to speech system.");
    const [selectedEngine, setSelectedEngine] = useState('piper');
    const [selectedVoice, setSelectedVoice] = useState('');
    const [voices, setVoices] = useState([]);
    const [status, setStatus] = useState('Idle');
    const [logs, setLogs] = useState([]);

    const log = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const loadVoices = async () => {
        setStatus('Loading voices...');
        log(`Loading voices for ${selectedEngine}...`);
        try {
            const engine = engines[selectedEngine];
            await engine.init();
            const list = await engine.getVoices();
            setVoices(list);
            if (list.length > 0) {
                setSelectedVoice(list[0].id);
                log(`Loaded ${list.length} voices.`);
            } else {
                log('No voices found or empty list.');
            }
            setStatus('Ready');
        } catch (e) {
            setStatus('Error loading voices');
            log(`Error: ${e.message}`);
            console.error(e);
        }
    };

    useEffect(() => {
        loadVoices();
    }, [selectedEngine]);

    const handleSpeak = async () => {
        if (!selectedVoice) return;
        setStatus('Speaking...');
        log(`Requesting speak on ${selectedEngine} with voice ${selectedVoice}`);

        try {
            const engine = engines[selectedEngine];
            await engine.speak(text, {
                voiceId: selectedVoice,
                rate: 1.0,
                pitch: 1.0
            }, {
                onStart: () => {
                    setStatus('Playing');
                    log('Event: onStart received');
                },
                onEnd: () => {
                    setStatus('Finished');
                    log('Event: onEnd received');
                },
                onError: (e) => {
                    setStatus('Error');
                    log(`Event: onError received - ${e}`);
                    console.error(e);
                }
            });
        } catch (e) {
            setStatus('Exception');
            log(`Exception: ${e.message}`);
            console.error(e);
        }
    };

    const handleStop = () => {
        const engine = engines[selectedEngine];
        engine.stop();
        setStatus('Stopped');
        log('Stopped manually');
    };

    return (
        <div className="p-4 max-w-2xl mx-auto h-screen flex flex-col">
            <div className="flex items-center gap-4 mb-6">
                <Link to="/" className="text-blue-500 hover:underline"><ArrowLeft /></Link>
                <h1 className="text-2xl font-bold">TTS Diagnostics</h1>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border">
                    <label className="block text-sm font-medium mb-1">Engine</label>
                    <select
                        value={selectedEngine}
                        onChange={e => setSelectedEngine(e.target.value)}
                        className="w-full p-2 border rounded dark:bg-gray-700"
                    >
                        {getAvailableEngines().map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                    </select>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border">
                    <label className="block text-sm font-medium mb-1">Voice</label>
                    <div className="flex gap-2">
                        <select
                            value={selectedVoice}
                            onChange={e => setSelectedVoice(e.target.value)}
                            className="w-full p-2 border rounded dark:bg-gray-700"
                        >
                            {voices.map(v => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                        <button onClick={loadVoices} className="px-3 py-1 bg-gray-200 rounded">Reload</button>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded border">
                    <label className="block text-sm font-medium mb-1">Test Phrase</label>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        className="w-full p-2 border rounded dark:bg-gray-700 h-24"
                    />
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={handleSpeak}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
                    >
                        Speak
                    </button>
                    <button
                        onClick={handleStop}
                        className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-bold"
                    >
                        Stop
                    </button>
                </div>

                <div className="mt-6">
                    <h3 className="font-bold mb-2">Status: <span className="font-mono">{status}</span></h3>
                    <div className="bg-black text-green-400 p-4 rounded h-64 overflow-y-auto font-mono text-xs">
                        {logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>
            </div>
        </div>
    );
}
