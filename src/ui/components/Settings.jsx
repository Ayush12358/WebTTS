import { useEffect, useState } from 'react';
import { getAvailableEngines, engines } from '../../core/tts';
import { Settings as SettingsIcon, X, Key } from 'lucide-react';

export function Settings({ config, onConfigChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceList, setVoiceList] = useState([]);
    const [showApiConfig, setShowApiConfig] = useState(false);
    const [apiKeys, setApiKeys] = useState({
        googleCloud: localStorage.getItem('googleCloudTTSApiKey') || '',
        responsiveVoice: localStorage.getItem('responsiveVoiceKey') || '',
        awsAccessKey: '',
        awsSecretKey: '',
        awsRegion: 'us-east-1'
    });

    const availableEngines = getAvailableEngines();
    const currentEngineInfo = availableEngines.find(e => e.id === config.engineId);

    // Load saved AWS credentials
    useEffect(() => {
        const saved = localStorage.getItem('awsPollyCredentials');
        if (saved) {
            const parsed = JSON.parse(saved);
            setApiKeys(prev => ({
                ...prev,
                awsAccessKey: parsed.accessKeyId || '',
                awsSecretKey: parsed.secretAccessKey || '',
                awsRegion: parsed.region || 'us-east-1'
            }));
        }
    }, []);

    useEffect(() => {
        const loadVoices = async () => {
            const engine = engines[config.engineId];
            if (engine) {
                const voices = await engine.getVoices();
                // Filter for English only
                const englishVoices = voices.filter(v =>
                    v.lang && (v.lang.toLowerCase().startsWith('en') || v.id === 'setup_required' || v.id === 'error' || v.id === 'unavailable')
                );
                setVoiceList(englishVoices.length > 0 ? englishVoices : voices);
            }
        };
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

    const saveGoogleApiKey = () => {
        engines.googleCloud.setApiKey(apiKeys.googleCloud);
        alert('Google Cloud API key saved!');
        // Reload voices
        onConfigChange({ ...config });
    };

    const saveResponsiveVoiceKey = () => {
        engines.responsiveVoice.setApiKey(apiKeys.responsiveVoice);
        alert('ResponsiveVoice API key saved!');
        onConfigChange({ ...config });
    };

    const saveAwsCredentials = () => {
        engines.amazonPolly.setCredentials(
            apiKeys.awsAccessKey,
            apiKeys.awsSecretKey,
            apiKeys.awsRegion
        );
        alert('AWS credentials saved!');
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

                    {config.engineId === 'responsiveVoice' && (
                        <div>
                            <input
                                type="password"
                                placeholder="ResponsiveVoice Key"
                                value={apiKeys.responsiveVoice}
                                onChange={(e) => setApiKeys({ ...apiKeys, responsiveVoice: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}
                            />
                            <button onClick={saveResponsiveVoiceKey} style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}>
                                Save App Key
                            </button>
                            <div style={{ fontSize: '0.7rem', opacity: 0.8, lineHeight: '1.2' }}>
                                <p style={{ marginBottom: '0.25rem' }}>
                                    If you see a "Site not verified" error, add your domain (e.g. localhost) to the
                                    <a href="https://responsivevoice.org/dashboard/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-color, #3B82F6)', marginLeft: '4px' }}>
                                        ResponsiveVoice Dashboard
                                    </a>.
                                </p>
                            </div>
                        </div>
                    )}

                    {config.engineId === 'amazonPolly' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="AWS Access Key ID"
                                value={apiKeys.awsAccessKey}
                                onChange={(e) => setApiKeys({ ...apiKeys, awsAccessKey: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                            />
                            <input
                                type="password"
                                placeholder="AWS Secret Access Key"
                                value={apiKeys.awsSecretKey}
                                onChange={(e) => setApiKeys({ ...apiKeys, awsSecretKey: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                            />
                            <select
                                value={apiKeys.awsRegion}
                                onChange={(e) => setApiKeys({ ...apiKeys, awsRegion: e.target.value })}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                            >
                                <option value="us-east-1">US East (N. Virginia)</option>
                                <option value="us-west-2">US West (Oregon)</option>
                                <option value="eu-west-1">EU (Ireland)</option>
                                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                            </select>
                            <button onClick={saveAwsCredentials} style={{ width: '100%', padding: '0.5rem' }}>
                                Save AWS Credentials
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

            <div style={{ marginTop: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                    {config.engineId === 'webSpeech' && 'Uses your device\'s built-in voices.'}
                    {config.engineId === 'speakit' && 'Lightweight wrapper for Web Speech API.'}
                    {config.engineId === 'espeak' && 'Offline WASM-based speech synthesizer.'}
                    {config.engineId === 'responsiveVoice' && 'Free unlimited usage with attribution.'}
                    {config.engineId === 'googleCloud' && 'Get API key from Google Cloud Console.'}
                    {config.engineId === 'amazonPolly' && 'Get credentials from AWS IAM Console.'}
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
