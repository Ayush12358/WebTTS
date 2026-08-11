import { useEffect, useState, useCallback, useRef } from 'react';
import { getAvailableEngines, engines } from '../../core/tts';
import { bookStore } from '../../core/bookStore';
import { formatBytes } from '../../core/quotaManager';
import { Settings as SettingsIcon, X, HardDrive, Trash2, Play, Square } from 'lucide-react';
import { useToast } from './Toast';

const SAMPLE_TEXT = 'This is a preview of the selected voice.';

export function Settings({ config, onConfigChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [voiceList, setVoiceList] = useState([]);
    const [voicesLoading, setVoicesLoading] = useState(false);
    const [storageInfo, setStorageInfo] = useState({ usage: 0, quota: 0, percentUsed: 0 });
    const [modelInfo, setModelInfo] = useState(null);
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const previewGenRef = useRef(0);
    const previewActiveRef = useRef(false); // true while a preview speak is actually in flight
    const [sleepTimerEnabled, setSleepTimerEnabled] = useState(false);
    const [sleepTimerMinutes, setSleepTimerMinutes] = useState('15');
    const { showToast } = useToast();

    const availableEngines = getAvailableEngines();

    // Voice preview — standalone: never routed through Player state. The gen
    // counter invalidates stale callbacks (an onEnd from a stopped preview must
    // not clobber the state of a newer preview). The engine is a shared
    // singleton with the Player, so stop() runs ONLY while a preview is
    // actually in flight — a bare close/engine-change with no preview must
    // never kill the Player's active speak() (F2 MAJOR).
    const stopPreview = useCallback(() => {
        previewGenRef.current++;
        if (previewActiveRef.current) {
            engines[config.engineId]?.stop?.();
            previewActiveRef.current = false;
        }
        setIsPreviewing(false);
    }, [config.engineId]);

    const handlePreview = () => {
        if (isPreviewing) {
            stopPreview();
            return;
        }
        const gen = ++previewGenRef.current;
        const engine = engines[config.engineId];
        if (!engine) return;
        setIsPreviewing(true);
        previewActiveRef.current = true;
        // The Player shares this engine singleton — its active speak() dies the
        // moment this preview starts. Tell it to reset cleanly; the preview
        // itself stays standalone (no Player state writes from here).
        window.dispatchEvent(new CustomEvent('webtts:preview-started', { detail: { engineId: config.engineId } }));
        engine.speak(
            SAMPLE_TEXT,
            { voiceId: config.voiceId || undefined, rate: config.rate, pitch: config.pitch },
            {
                onEnd: () => {
                    if (gen === previewGenRef.current) {
                        previewActiveRef.current = false;
                        setIsPreviewing(false);
                    }
                },
                onError: (error) => {
                    console.error('Voice preview failed:', error);
                    if (gen === previewGenRef.current) {
                        previewActiveRef.current = false;
                        setIsPreviewing(false);
                    }
                    showToast(error?.message || 'Preview failed', 'error');
                }
            }
        );
    };

    const handleClose = useCallback(() => {
        stopPreview();
        setIsOpen(false);
    }, [stopPreview]);

    // Close on Escape
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape' && isOpen) handleClose();
    }, [isOpen, handleClose]);
    useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

    // Engine model info (kokoro only) — refreshed on open/engine change and after cache delete
    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!isOpen || config.engineId !== 'kokoro') {
                setModelInfo(null);
                return;
            }
            try {
                const info = await engines[config.engineId].getModelInfo?.();
                if (!cancelled && info) setModelInfo(info);
            } catch (error) {
                console.error('Failed to load model info', error);
                if (!cancelled) setModelInfo(null);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [isOpen, config.engineId]);

    // Online engine API key — loaded from IndexedDB on open, mirrored into the
    // engine singleton so speak/preview use it without further round-trips.
    useEffect(() => {
        if (!isOpen || config.engineId !== 'onlineKokoro') return;
        let cancelled = false;
        const load = async () => {
            const saved = await bookStore.getSettings('deepinfraApiKey');
            if (!cancelled && saved) {
                setApiKeyInput(saved);
                engines.onlineKokoro?.setApiKey?.(saved);
            }
        };
        load().catch(error => console.error('Failed to load API key', error));
        return () => { cancelled = true; };
    }, [isOpen, config.engineId]);

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

    // Sleep timer — load persisted value on open; mirror external changes
    // (Player disables it at expiry, so the checkbox must follow).
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const load = async () => {
            try {
                const saved = await bookStore.getSettings('sleepTimer');
                if (!cancelled && saved) {
                    setSleepTimerEnabled(!!saved.enabled);
                    setSleepTimerMinutes(String(saved.minutes ?? 15));
                }
            } catch (error) {
                console.error('Failed to load sleep timer', error);
            }
        };
        load();
        const handleChange = (event) => {
            if (!event.detail) return;
            setSleepTimerEnabled(!!event.detail.enabled);
            setSleepTimerMinutes(String(event.detail.minutes ?? 15));
        };
        window.addEventListener('webtts:sleep-timer-changed', handleChange);
        return () => {
            cancelled = true;
            window.removeEventListener('webtts:sleep-timer-changed', handleChange);
        };
    }, [isOpen]);

    const handleEngineChange = (e) => {
        stopPreview(); // stop the outgoing engine's preview audio
        onConfigChange({ ...config, engineId: e.target.value, voiceId: '' });
    };

    const handleVoiceChange = (e) => {
        stopPreview(); // preview would otherwise keep playing with the old voice
        onConfigChange({ ...config, voiceId: e.target.value });
    };

    // Live-mirror into the engine singleton so a preview right after typing
    // already uses the new key; persisted to IndexedDB on every change.
    const handleApiKeyChange = (e) => {
        const value = e.target.value;
        setApiKeyInput(value);
        engines.onlineKokoro?.setApiKey?.(value);
        bookStore.saveSettings('deepinfraApiKey', value).catch(error => {
            console.error('Failed to save API key', error);
        });
    };

    const handleRateChange = (e) => {
        onConfigChange({ ...config, rate: parseFloat(e.target.value) });
    };

    const handlePitchChange = (e) => {
        onConfigChange({ ...config, pitch: parseFloat(e.target.value) });
    };

    // Sleep timer — persisted + broadcast so the Player reacts without prop drilling.
    const applySleepTimer = useCallback((value) => {
        window.dispatchEvent(new CustomEvent('webtts:sleep-timer-changed', { detail: value }));
        bookStore.saveSettings('sleepTimer', value).catch(error => {
            console.error('Failed to save sleep timer', error);
            showToast('Could not save sleep timer.', 'error');
        });
    }, [showToast]);

    const handleSleepTimerToggle = (e) => {
        const enabled = e.target.checked;
        setSleepTimerEnabled(enabled);
        applySleepTimer({ enabled, minutes: Math.max(1, parseInt(sleepTimerMinutes, 10) || 15) });
    };

    const handleSleepTimerMinutesChange = (e) => {
        const raw = e.target.value;
        setSleepTimerMinutes(raw);
        const minutes = parseInt(raw, 10);
        if (!Number.isInteger(minutes) || minutes < 1) return; // keep typing; persist only valid values
        if (sleepTimerEnabled) applySleepTimer({ enabled: true, minutes });
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

    const handleDeleteCachedModel = async () => {
        try {
            await engines[config.engineId]?.deleteCachedModel?.();
            showToast('Cached model deleted.', 'info');
            const info = await engines[config.engineId]?.getModelInfo?.();
            setModelInfo(info);
        } catch (error) {
            console.error('Failed to delete cached model', error);
            showToast('Could not delete cached model.', 'error');
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
                <button onClick={handleClose} className="icon-btn" aria-label="Close settings">
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

            {config.engineId === 'kokoro' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        On-device neural TTS. Model downloads on first use and is stored in your browser.
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {modelInfo
                            ? `Model ${modelInfo.downloaded ? 'downloaded' : 'not downloaded'} · ${modelInfo.sizeMB} MB`
                            : 'Checking model cache…'}
                    </p>
                    <button
                        onClick={handleDeleteCachedModel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.8rem',
                            padding: '0.5rem 0.75rem',
                            background: 'var(--danger-bg)',
                            color: 'var(--danger-text)',
                            border: '1px solid var(--danger-border)',
                            borderRadius: '8px',
                            alignSelf: 'flex-start'
                        }}
                    >
                        <Trash2 size={14} />
                        Delete cached model
                    </button>
                </div>
            )}

            {config.engineId === 'onlineKokoro' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Free: several community-hosted Kokoro servers (no key needed) — rotates automatically when one is rate-limited. Slow — several seconds per sentence, occasional cold starts. Optional: add a DeepInfra API key (deepinfra.com) for fast, reliable playback.
                    </p>
                    <input
                        type="password"
                        value={apiKeyInput}
                        onChange={handleApiKeyChange}
                        placeholder="DeepInfra API key (optional — leave empty for free)"
                        autoComplete="off"
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                    />
                </div>
            )}


            <div>
                <label htmlFor="tts-voice" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Voice</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                        id="tts-voice"
                        value={config.voiceId}
                        onChange={handleVoiceChange}
                        disabled={voicesLoading}
                        style={{ flex: 1, width: 'auto', padding: '0.5rem', borderRadius: '4px' }}
                    >
                        <option value="">{voicesLoading ? 'Loading voices…' : 'System default'}</option>
                        {voiceList.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={handlePreview}
                        className="icon-btn"
                        title={isPreviewing ? 'Stop preview' : 'Preview voice'}
                        aria-label={isPreviewing ? 'Stop voice preview' : 'Preview voice'}
                    >
                        {isPreviewing ? <Square size={16} /> : <Play size={16} />}
                    </button>
                </div>
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
                {(config.engineId === 'kokoro' || config.engineId === 'onlineKokoro') && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Pitch is not supported by this engine.
                    </p>
                )}
            </div>

            {/* Sleep Timer */}
            <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    <input
                        type="checkbox"
                        checked={sleepTimerEnabled}
                        onChange={handleSleepTimerToggle}
                        style={{ marginRight: '0.5rem' }}
                    />
                    Sleep timer
                </label>
                <input
                    id="sleep-timer-minutes"
                    type="number"
                    min="1"
                    max="720"
                    list="sleep-timer-presets"
                    value={sleepTimerMinutes}
                    onChange={handleSleepTimerMinutesChange}
                    disabled={!sleepTimerEnabled}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', boxSizing: 'border-box' }}
                />
                <datalist id="sleep-timer-presets">
                    {[5, 10, 15, 30, 45, 60].map(m => <option key={m} value={m} />)}
                </datalist>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Stop playback after this many minutes. Counts only while audio is playing.
                </p>
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
