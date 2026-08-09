import { WebSpeechEngine } from './WebSpeechEngine';
import { KokoroEngine } from './KokoroEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    kokoro: new KokoroEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'System TTS', requiresKey: false },
        { id: 'kokoro', name: 'Kokoro (On-device Neural)', requiresKey: false }
    ];
};
