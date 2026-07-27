import { useEffect, useState, useCallback } from 'react';
import { getAvailableEngines, engines } from '../../core/tts';
import { bookStore } from '../../core/bookStore';
import { formatBytes } from '../../core/quotaManager';
import { Settings as SettingsIcon, X, HardDrive, Trash2 } from 'lucide-react';
import { useToast } from './Toast';

export function Settings({ config, onConfigChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceList, setVoiceList] = useState([]);
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, percentUsed: 0 });
    const { showToast } = useToast();

    const availableEngines = getAvailableEngines();

    // Close on Escape
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && isOpen) setIsOpen(false);
    }, [isOpen]);
    useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

    useEffect(() => {
        const checkEngine = () => {
            if (!engines[config.engineId]) {
                console.warn(`Stored engine "${config.engineId}" no longer available. Falling back to webSpeech.`);
                onConfigChange({ ...config, engineId: 'webSpeech', voiceId: '' });
            }
        };

        const loadVoices = async () => {
            const engine = engines[config.engineId];
            if (!engine) return;
            setVoicesLoading(true);
            try {
                const voices = await engine.getVoices();
                setVoiceList(voices);
            } catch (error) {
                console.error('Failed to load voices', error);
                setVoiceList([]);
                showToast('Could not load voices for this engine.', 'warning');
            } finally {
                setVoicesLoading(false);
            }
        };

        const loadStorage = async () => {
            try {
                const info = await bookStore.getStorageUsage();
                setStorageInfo(info);
            } catch (error) {
                console.error('Failed to load storage usage', error);
                showToast('Storage usage is unavailable.', 'warning');
            }
        };

        checkEngine();
        if (isOpen) loadVoices();
        if (isOpen) loadStorage();
    }, [config, onConfigChange, isOpen, showToast]);

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


    const handleClearAllBooks = async () => {
        if (!window.confirm('Delete ALL books? This cannot be undone.')) return;
        try {
            await bookStore.clearAllBooks();
            const info = await bookStore.getStorageUsage();
            setStorageInfo(info);
            showToast('All books deleted.', 'info');
        } catch (error) {
            console.error('Failed to delete all books', error);
            showToast('Could not delete all books.', 'error');
        }
    };

    if (!isOpen) {
        return (
            <button onClick={() => setIsOpen(true)} className="icon-btn" aria-label="Open settings">
                <SettingsIcon size={18} />
            </button>
        );
    }

    return (
        <div
            className="settings-panel slide-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            style={{
                position: 'absolute', top: 0, right: 0, bottom: 0,
                width: 'clamp(280px, 80vw, 320px)',
                background: 'var(--bg-primary)',
                boxShadow: '-4px 0 24px var(--shadow-lg)',
                padding: '1rem',
                zIndex: 100,
                display: 'flex', flexDirection: 'column', gap: '1rem',
                borderLeft: '1px solid var(--border-color)',
                overflowY: 'auto'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 id="settings-title" style={{ margin: 0, fontSize: '1rem' }}>Settings</h3>
                <button onClick={() => setIsOpen(false)} className="icon-btn" aria-label="Close settings">
                    <X size={18} />
                </button>
            </div>

            <div>
                <label htmlFor="tts-engine" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>TTS Engine</label>
                <select
                    id="tts-engine"
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
                <label htmlFor="tts-voice" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Voice</label>
                <select
                    id="tts-voice"
                    value={config.voiceId}
                    onChange={handleVoiceChange}
                    disabled={voicesLoading}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                >
                    <option value="">{voicesLoading ? 'Loading voices…' : 'System default'}</option>
                    {voiceList.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor="tts-rate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Speed ({config.rate}x)</label>
                <input
                    id="tts-rate"
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
                <label htmlFor="tts-pitch" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Pitch ({config.pitch})</label>
                <input
                    id="tts-pitch"
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.1"
                    value={config.pitch}
                    onChange={handlePitchChange}
                    style={{ width: '100%' }}
                />
            </div>

            {/* Storage Usage */}
            <div style={{
                borderTop: '1px solid var(--border-color, #ccc)',
                paddingTop: '1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <HardDrive size={16} />
                    <strong style={{ fontSize: '0.85rem' }}>Storage</strong>
                </div>
                {storageInfo.quota > 0 ? (
                    <>
                        <div style={{
                            height: '8px',
                            background: 'var(--border-color)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            marginBottom: '0.35rem'
                        }}>
                            <div style={{
                                width: `${Math.min(storageInfo.percentUsed, 100)}%`,
                                height: '100%',
                                background: storageInfo.percentUsed > 80
                                    ? 'var(--danger-text)'
                                    : storageInfo.percentUsed > 60
                                        ? 'var(--toast-text-warning)'
                                        : 'var(--accent-color)',
                                borderRadius: '4px',
                                transition: 'width 0.3s'
                            }} />
                        </div>
                        <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)} used ({storageInfo.percentUsed.toFixed(0)}%)
                        </p>
                    </>
                ) : (
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Storage info unavailable
                    </p>
                )}
                <button
                    onClick={handleClearAllBooks}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.8rem',
                        padding: '0.5rem 0.75rem',
                        background: 'var(--danger-bg)',
                        color: 'var(--danger-text)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: '8px'
                    }}
                >
                    <Trash2 size={14} />
                    Delete All Books
                </button>
            </div>

            <div style={{ marginTop: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                    {config.engineId === 'webSpeech' && 'Uses your device\'s built-in voices.'}
                    {config.engineId === 'edgeTTS' && 'High-quality neural voices from Microsoft Edge.'}
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
