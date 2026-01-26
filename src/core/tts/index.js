import { WebSpeechEngine } from './WebSpeechEngine';
import { GoogleCloudTTSEngine } from './GoogleCloudTTSEngine';
import { EdgeTTSEngine } from './EdgeTTSEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    googleCloud: new GoogleCloudTTSEngine(),
    edgeTTS: new EdgeTTSEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'edgeTTS', name: 'Microsoft Edge TTS (Neural)', requiresKey: false },
        { id: 'webSpeech', name: 'System TTS', requiresKey: false },
        { id: 'googleCloud', name: 'Google Cloud TTS (Neural)', requiresKey: true }
    ];
};
