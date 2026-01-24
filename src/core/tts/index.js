import { WebSpeechEngine } from './WebSpeechEngine';
import { GoogleCloudTTSEngine } from './GoogleCloudTTSEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    googleCloud: new GoogleCloudTTSEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'System TTS', requiresKey: false },
        { id: 'googleCloud', name: 'Google Cloud TTS (Neural)', requiresKey: true }
    ];
};
