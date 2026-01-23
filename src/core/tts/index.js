import { WebSpeechEngine } from './WebSpeechEngine';
import { ResponsiveVoiceEngine } from './ResponsiveVoiceEngine';
import { GoogleCloudTTSEngine } from './GoogleCloudTTSEngine';
import { AmazonPollyEngine } from './AmazonPollyEngine';
import { SpeakitEngine } from './SpeakitEngine';

export const engines = {
    webSpeech: new WebSpeechEngine(),
    responsiveVoice: new ResponsiveVoiceEngine(),
    googleCloud: new GoogleCloudTTSEngine(),
    amazonPolly: new AmazonPollyEngine(),
    speakit: new SpeakitEngine()
};

export const getAvailableEngines = () => {
    return [
        { id: 'webSpeech', name: 'System TTS', requiresKey: false },
        { id: 'speakit', name: 'Speakit-JS (Custom)', requiresKey: false },
        { id: 'responsiveVoice', name: 'ResponsiveVoice (Free)', requiresKey: false },
        { id: 'amazonPolly', name: 'Amazon Polly (5M/month)', requiresKey: true },
        { id: 'googleCloud', name: 'Google Cloud TTS (4M/month)', requiresKey: true }
    ];
};
