import { WebSpeechEngine } from './WebSpeechEngine';

export const engines = {
    webSpeech: new WebSpeechEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'System TTS' }
    ];
};
