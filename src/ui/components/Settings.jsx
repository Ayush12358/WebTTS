import { useEffect, useState } from 'react';
import { getAvailableEngines, engines } from '../../core/tts';
import { Settings as SettingsIcon, X } from 'lucide-react';

export function Settings({ config, onConfigChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceList, setVoiceList] = useState([]);
    const availableEngines = getAvailableEngines();

    useEffect(() => {
        const loadVoices = async () => {
            const engine = engines[config.engineId];
            if (engine) {
                const voices = await engine.getVoices();
                // Filter for English only as requested
                const englishVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
                setVoiceList(englishVoices);
            }
        };
        loadVoices();
    }, [config.engineId]);

    const handleEngineChange = (e) => {
        onConfigChange({ ...config, engineId: e.target.value, voiceId: '' }); // Reset voice on engine change
    };

    const handleVoiceChange = (e) => {
        onConfigChange({ ...config, voiceId: e.target.value });
    };

    const handleRateChange = (e) => {
        onConfigChange({ ...config, rate: parseFloat(e.target.value) });
    };

    if (!isOpen) {
        return (
            <button onClick={() => setIsOpen(true)} style={{ background: 'transparent', color: 'var(--text-primary)' }}>
                <SettingsIcon size={24} />
            </button>
        );
    }

    return (
        <div className="settings-panel" style={{
            position: 'absolute', top: 0, right: 0, bottom: 0,
            width: '300px', background: 'var(--bg-primary)',
            boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
            padding: '1rem',
            zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: '1rem',
            borderLeft: '1px solid #ccc'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Reader Settings</h3>
                <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'var(--text-primary)', padding: 0 }}><X /></button>
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>TTS Engine</label>
                <select
                    value={config.engineId}
                    onChange={handleEngineChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                >
                    {availableEngines.map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                    ))}
                </select>
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Voice</label>
                <select
                    value={config.voiceId}
                    onChange={handleVoiceChange}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                >
                    {voiceList.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                </select>
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Speed ({config.rate}x)</label>
                <input
                    type="range"
                    min="0.5"
                    max="3"
                    step="0.1"
                    value={config.rate}
                    onChange={handleRateChange}
                    style={{ width: '100%' }}
                />
            </div>
        </div>
    );
}
