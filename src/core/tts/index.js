import { WebSpeechEngine } from './WebSpeechEngine';
import { EdgeTTSEngine } from './EdgeTTSEngine';
import { PiperEngine } from './PiperEngine';

export const engines = {
    piper: new PiperEngine(),
    edgeTTS: new EdgeTTSEngine(),
    webSpeech: new WebSpeechEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'piper', name: 'Piper (On-device Neural)', requiresKey: false },
        { id: 'edgeTTS', name: 'Microsoft Edge TTS (Edge browser only)', requiresKey: false },
        { id: 'webSpeech', name: 'System TTS', requiresKey: false }
    ];
};
