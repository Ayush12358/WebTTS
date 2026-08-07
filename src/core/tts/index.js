import { WebSpeechEngine } from './WebSpeechEngine';
import { EdgeTTSEngine } from './EdgeTTSEngine';
import { KokoroEngine } from './KokoroEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    edgeTTS: new EdgeTTSEngine(),
    kokoro: new KokoroEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'kokoro', name: 'Kokoro (On-device Neural)', requiresKey: false },
        { id: 'edgeTTS', name: 'Microsoft Edge TTS (Edge browser only)', requiresKey: false },
        { id: 'webSpeech', name: 'System TTS', requiresKey: false }
    ];
};
