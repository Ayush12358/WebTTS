import { useCallback, useEffect, useRef, useState } from 'react';
import { bookStore } from './bookStore';

/**
 * Shared TTS config hook — loaded from IndexedDB on mount.
 * Used by both Header (for Settings panel) and Player (for playback).
 */
export function useTTSConfig() {
    const [config, setConfig] = useState({
        engineId: 'piper',
        voiceId: '',
        rate: 1.0,
        pitch: 1.0
    });
    const changeVersion = useRef(0);

    useEffect(() => {
        const handleConfigChange = event => {
            if (event.detail) {
                changeVersion.current += 1;
                setConfig(event.detail);
            }
        };
        const loadConfig = async () => {
            const saved = await bookStore.getSettings('ttsConfig');
            if (saved && changeVersion.current === 0) setConfig(saved);
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('webtts:tts-config-changed', handleConfigChange);
        }
        loadConfig().catch(error => console.error('Failed to load TTS settings', error));
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('webtts:tts-config-changed', handleConfigChange);
            }
        };
    }, []);

    const updateConfig = useCallback((newConfig) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('webtts:tts-config-changed', { detail: newConfig }));
        } else {
            setConfig(newConfig);
        }
        bookStore.saveSettings('ttsConfig', newConfig).catch(error => {
            console.error('Failed to save TTS settings', error);
        });
    }, []);

    return [config, updateConfig];
}
