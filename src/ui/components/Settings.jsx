import { useEffect, useState } from 'react';
import { getAvailableEngines, engines } from '../../core/tts';
import { Settings as SettingsIcon, X, Key } from 'lucide-react';

export function Settings({ config, onConfigChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceList, setVoiceList] = useState([]);
    const [apiKeys, setApiKeys] = useState({
        googleCloud: localStorage.getItem('googleCloudTTSApiKey') || ''
    });

    const availableEngines = getAvailableEngines();
    const currentEngineInfo = availableEngines.find(e => e.id === config.engineId);

    useEffect(() => {
        const checkEngine = () => {
            if (!engines[config.engineId]) {
                console.warn(`Stored engine "${config.engineId}" no longer available. Falling back to webSpeech.`);
                onConfigChange({ ...config, engineId: 'webSpeech', voiceId: '' });
            }
        };

        const loadVoices = async () => {
            const engine = engines[config.engineId];
            if (engine) {
                const voices = await engine.getVoices();
                setVoiceList(voices);
            }
        };

        checkEngine();
        loadVoices();
    }, [config.engineId, apiKeys]);

    const handleEngineChange = (e) => {
        onConfigChange({ ...config, engineId: e.target.value, voiceId: '' });
    };

    const handleVoiceChange = (e) => {
        onConfigChange({ ...config, voiceId: e.target.value });
    };

    const handleRateChange = (e) => {
        onConfigChange({ ...config, rate: parseFloat(e.target.value) });
    };

    const handlePitchChange = (e) => {
        onConfigChange({ ...config, pitch: parseFloat(e.target.value) });
    };

    const saveGoogleApiKey = () => {
        engines.googleCloud.setApiKey(apiKeys.googleCloud);
        alert('Google Cloud API key saved!');
        // Reload voices
        onConfigChange({ ...config });
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
            width: '320px', background: 'var(--bg-primary)',
            boxShadow: '-2px 0 10px rgba(0,0,0,0.2)',
            padding: '1rem',
            zIndex: 100,
            display: 'flex', flexDirection: 'column', gap: '1rem',
            borderLeft: '1px solid var(--border-color, #ccc)',
            overflowY: 'auto'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Reader Settings</h3>
                <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', color: 'var(--text-primary)', padding: 0 }}><X /></button>
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>TTS Engine</label>
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

            {/* API Key Configuration for cloud services */}
            {currentEngineInfo?.requiresKey && (
                <div style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(59, 130, 246, 0.3)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <Key size={16} />
                        <strong>API Configuration</strong>
                    </div>

                    {config.engineId === 'googleCloud' && (
                        <div>
                            <input
                                type="password"
                                placeholder="Google Cloud API Key"
                                value={apiKeys.googleCloud}
                                onChange={(e) => setApiKeys({ ...apiKeys, googleCloud: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}
                            />
                            <button onClick={saveGoogleApiKey} style={{ width: '100%', padding: '0.5rem' }}>
                                Save API Key
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Voice</label>
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
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Speed ({config.rate}x)</label>
                <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={config.rate}
                    onChange={handleRateChange}
                    style={{ width: '100%' }}
                />
            </div>

            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Pitch ({config.pitch})</label>
                <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={config.pitch}
                    onChange={handlePitchChange}
                    style={{ width: '100%' }}
                />
            </div>

            <div style={{ marginTop: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                    {config.engineId === 'webSpeech' && 'Uses your device\'s built-in voices.'}
                    {config.engineId === 'edgeTTS' && 'High-quality neural voices from Microsoft Edge.'}
                    {config.engineId === 'googleCloud' && 'Get API key from Google Cloud Console.'}
                </p>
                <a
                    href="/test-tts"
                    style={{ color: 'var(--accent-color, #3B82F6)', textDecoration: 'underline' }}
                >
                    Open TTS Diagnostics
                </a>
            </div>
        </div>
    );
}
