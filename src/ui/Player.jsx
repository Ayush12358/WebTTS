import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import ePub from 'epubjs';
import { bookStore } from '../core/bookStore';
import { engines } from '../core/tts';
import { Settings } from './components/Settings';
import { Controls } from './components/Controls';

export function Player() {
    const viewerRef = useRef(null);
    const bookRef = useRef(null);
    const renditionRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [playing, setPlaying] = useState(false);
    const [ttsConfig, setTtsConfig] = useState({
        engineId: 'webSpeech',
        voiceId: '',
        rate: 1.0
    });

    const navigate = useNavigate();

    useEffect(() => {
        const initBook = async () => {
            try {
                const bookData = await bookStore.loadBook();
                if (!bookData) {
                    navigate('/');
                    return;
                }

                const book = ePub(bookData);
                bookRef.current = book;

                // Render to div
                const rendition = book.renderTo(viewerRef.current, {
                    width: '100%',
                    height: '100%',
                    flow: 'paginated', // or 'scrolled-doc'
                    manager: 'default',
                });
                renditionRef.current = rendition;

                await rendition.display();

                // Theme integration
                const theme = document.documentElement.getAttribute('data-theme') || 'light';
                registerThemes(rendition);
                rendition.themes.select(theme);

                setLoading(false);

            } catch (err) {
                console.error("Error loading book:", err);
                setError("Failed to load book content.");
                setLoading(false);
            }
        };

        initBook();

        return () => {
            if (bookRef.current) {
                bookRef.current.destroy();
            }
            stopTTS();
        };
    }, [navigate]);

    const registerThemes = (rendition) => {
        rendition.themes.register('light', {
            body: { color: '#1a1a1a', background: '#ffffff' }
        });
        rendition.themes.register('dark', {
            body: { color: '#ffffff', background: '#1a1a1a' }
        });
    };

    const prevPage = () => {
        stopTTS();
        renditionRef.current?.prev();
    };

    const nextPage = () => {
        stopTTS();
        renditionRef.current?.next();
    };

    const stopTTS = () => {
        const engine = engines[ttsConfig.engineId];
        if (engine) engine.stop();
        setPlaying(false);
        // Remove highlights
        renditionRef.current?.annotations.remove('highlight', 'tts-highlight');
    };

    const speakCurrentPage = async () => {
        if (playing) {
            stopTTS();
            return;
        }

        const rendition = renditionRef.current;
        if (!rendition) return;

        // Get current text
        const location = rendition.currentLocation();
        if (!location || !location.start) return;

        const range = rendition.getRange(location.start.cfi);
        const text = range.toString();

        if (!text) return;

        setPlaying(true);
        const engine = engines[ttsConfig.engineId];
        await engine.init();

        engine.speak(text, {
            voiceId: ttsConfig.voiceId,
            rate: ttsConfig.rate
        }, {
            onStart: () => { },
            onEnd: () => setPlaying(false),
            onError: (e) => {
                console.error("TTS Error", e);
                setPlaying(false);
            },
            onBoundary: (event) => {
                // Placeholder for future highlight logic
            }
        });
    };

    return (
        <div className="player-container" style={{ height: 'calc(100vh - 20px)', display: 'flex', flexDirection: 'column' }}>
            <nav style={{ marginBottom: '0.5rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                    <ArrowLeft size={20} />
                    Back
                </Link>
                <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
            </nav>

            {loading && <div>Loading book...</div>}
            {error && <div style={{ color: 'red' }}>{error}</div>}

            <div style={{ flex: 1, position: 'relative', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div ref={viewerRef} style={{ width: '100%', height: '100%' }} />

                <button
                    onClick={prevPage}
                    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <ChevronLeft />
                </button>
                <button
                    onClick={nextPage}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <ChevronRight />
                </button>
            </div>

            <Controls
                playing={playing}
                onPlayPause={speakCurrentPage}
                onNext={nextPage}
                onPrev={prevPage}
            />
        </div>
    );
}
