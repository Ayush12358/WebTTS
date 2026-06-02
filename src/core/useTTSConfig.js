import { useEffect, useState } from 'react';
import { bookStore } from './bookStore';

/**
 * Shared TTS config hook — loaded from IndexedDB on mount.
 * Used by both Header (for Settings panel) and Player (for playback).
 */
export function useTTSConfig() {
    const [config, setConfig] = useState({
        engineId: 'webSpeech',
        voiceId: '',
        rate: 1.0,
        pitch: 1.0
    });

    useEffect(() => {
        bookStore.getSettings('ttsConfig').then(saved => {
            if (saved) setConfig(saved);
        });
    }, []);

    const updateConfig = (newConfig) => {
        setConfig(newConfig);
        bookStore.saveSettings('ttsConfig', newConfig);
    };

    return [config, updateConfig];
}
