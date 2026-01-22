import { WebSpeechEngine } from './WebSpeechEngine';
import { PiperEngine } from './PiperEngine';
import { EdgeEngine } from './EdgeEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    piper: new PiperEngine(),
    edge: new EdgeEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'Web Speech API' },
        { id: 'piper', name: 'Piper TTS (Local/WASM)' },
        { id: 'edge', name: 'Edge TTS (Online)' } // Placeholder
    ];
};
