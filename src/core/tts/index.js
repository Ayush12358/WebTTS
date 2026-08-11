import { WebSpeechEngine } from './WebSpeechEngine';
import { KokoroEngine } from './KokoroEngine';
import { OnlineKokoroEngine } from './OnlineKokoroEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    kokoro: new KokoroEngine(),
    onlineKokoro: new OnlineKokoroEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'System TTS', requiresKey: false },
        { id: 'kokoro', name: 'Kokoro (On-device Neural)', requiresKey: false },
        { id: 'onlineKokoro', name: 'Kokoro (Online)', requiresKey: false }
    ];
};
