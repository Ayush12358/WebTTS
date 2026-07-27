import { WebSpeechEngine } from './WebSpeechEngine';
import { EdgeTTSEngine } from './EdgeTTSEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    edgeTTS: new EdgeTTSEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'edgeTTS', name: 'Microsoft Edge TTS (Neural)', requiresKey: false },
        { id: 'webSpeech', name: 'System TTS', requiresKey: false }
    ];
};
