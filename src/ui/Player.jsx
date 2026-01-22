import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import ePub from 'epubjs';
import { bookStore } from '../core/bookStore';
import { engines } from '../core/tts';
import { Settings } from './components/Settings';
import { Controls } from './components/Controls';

export function Player() {
    const { id, cfi } = useParams();
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

    // Granular reading
    const [currentIndex, setCurrentIndex] = useState(-1);
    const currentChapterNodes = useRef([]);
    const navigate = useNavigate();

    // Playback Ref Bridge
    const playNextRef = useRef(null);
    const stopTTSRef = useRef(null);
    const nextChapterRef = useRef(null);
    const prevChapterRef = useRef(null);

    const playingRef = useRef(false);
    useEffect(() => { playingRef.current = playing; }, [playing]);

    useEffect(() => {
        // Bridges
        window.WebTTSPlay = (index) => {
            if (playNextRef.current) {
                if (stopTTSRef.current) stopTTSRef.current();
                setPlaying(true);
                playingRef.current = true;
                playNextRef.current(index);
            }
        };
        window.WebTTSNext = () => { if (nextChapterRef.current) nextChapterRef.current(); };
        window.WebTTSPrev = () => { if (prevChapterRef.current) prevChapterRef.current(); };

        return () => {
            window.WebTTSPlay = null;
            window.WebTTSNext = null;
            window.WebTTSPrev = null;
        };
    }, []);

    useEffect(() => {
        const initBook = async () => {
            try {
                let bookData;
                if (id) {
                    bookData = await bookStore.getBookData(id);
                } else {
                    bookData = await bookStore.loadBook();
                }

                if (!bookData) {
                    navigate('/');
                    return;
                }

                const book = ePub(bookData);
                bookRef.current = book;

                // Scrolled flow, default manager
                const rendition = book.renderTo(viewerRef.current, {
                    width: '100%',
                    height: '100%',
                    flow: 'scrolled',
                    manager: 'default', // Single chapter
                    allowScriptedContent: true,
                });
                renditionRef.current = rendition;

                const target = cfi && cfi !== 'start' ? decodeURIComponent(cfi) : undefined;
                await rendition.display(target);

                const theme = document.documentElement.getAttribute('data-theme') || 'light';
                registerThemes(rendition);
                rendition.themes.select(theme);

                // Click handling via native events (Bubble up from iframe)
                const handleClick = (event) => {
                    let target = event.target;
                    // Handle text nodes
                    if (target.nodeType === 3) target = target.parentNode;

                    while (target && target !== event.currentTarget.ownerDocument) {
                        // Handle Navigation Buttons
                        if (target.getAttribute && target.getAttribute('data-tts-action')) {
                            const action = target.getAttribute('data-tts-action');
                            if (action === 'prev-chapter') {
                                if (window.WebTTSPrev) window.WebTTSPrev();
                            } else if (action === 'next-chapter') {
                                if (window.WebTTSNext) window.WebTTSNext();
                            }
                            event.preventDefault();
                            return;
                        }

                        // Handle Sentence Click
                        if (target.getAttribute && target.getAttribute('data-tts-index')) {
                            const idx = parseInt(target.getAttribute('data-tts-index'));
                            if (window.WebTTSPlay) window.WebTTSPlay(idx);
                            event.preventDefault();
                            return;
                        }

                        if (target.tagName === 'BODY') break;
                        target = target.parentNode;
                    }
                };

                rendition.on('click', handleClick);

                rendition.hooks.content.register((contents) => {
                    parseContent(contents);
                    contents.document.body.addEventListener('click', handleClick);
                });

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
    }, [id, navigate]);

    const registerThemes = (rendition) => {
        // Robust responsive CSS
        const styles = {
            body: {
                color: '#1a1a1a',
                background: '#ffffff',
                padding: '1rem 1rem 4rem 1rem !important',
                'max-width': '100vw !important',
                'overflow-x': 'hidden !important',
                'word-wrap': 'break-word',
                'box-sizing': 'border-box'
            },
            img: { 'max-width': '100% !important', 'height': 'auto !important' }
        };

        rendition.themes.register('light', styles);
        rendition.themes.register('dark', {
            body: {
                ...styles.body,
                color: '#ffffff',
                background: '#1a1a1a'
            },
            img: styles.img
        });
    };

    const parseContent = (contents) => {
        const doc = contents.document;
        const body = doc.body;

        const style = doc.createElement('style');
        style.innerHTML = `
        .tts-active { 
            background-color: rgba(255, 255, 0, 0.3); 
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        [data-theme='dark'] .tts-active {
            background-color: rgba(255, 255, 0, 0.2); 
        }
        p, h1, h2, h3, h4, h5, h6, li, blockquote {
            cursor: pointer;
            margin-bottom: 1em;
            line-height: 1.6;
            max-width: 100%;
        }
        p:hover, h1:hover, h2:hover, h3:hover, li:hover {
            outline: 1px dashed rgba(128,128,128,0.2);
        }
        .chapter-nav-btn {
            display: block;
            width: 100%;
            padding: 1rem;
            margin: 2rem 0;
            background: rgba(59, 130, 246, 0.1);
            color: var(--accent-color, #3b82f6);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            text-align: center;
            cursor: pointer;
            font-size: 1rem;
            font-family: inherit;
        }
        [data-theme='dark'] .chapter-nav-btn {
             color: #60a5fa;
             border-color: rgba(96, 165, 250, 0.3);
        }
    `;
        doc.head.appendChild(style);

        const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
        const items = [];
        elements.forEach((el) => {
            const text = el.innerText.trim();
            if (text) {
                el.setAttribute('data-tts-index', items.length);
                items.push({ text, node: el });
            }
        });
        currentChapterNodes.current = items;

        // Inject Nav Buttons
        const prevBtn = doc.createElement('button');
        prevBtn.innerText = "← Previous Chapter";
        prevBtn.className = "chapter-nav-btn";
        prevBtn.setAttribute('data-tts-action', 'prev-chapter');
        body.insertBefore(prevBtn, body.firstChild);

        const nextBtn = doc.createElement('button');
        nextBtn.innerText = "Next Chapter →";
        nextBtn.className = "chapter-nav-btn";
        nextBtn.setAttribute('data-tts-action', 'next-chapter');
        body.appendChild(nextBtn);
    };

    const playNext = useCallback((index) => {
        if (!playingRef.current) return;

        if (index >= currentChapterNodes.current.length) {
            setPlaying(false);
            return;
        }

        setCurrentIndex(index);
        const item = currentChapterNodes.current[index];

        highlightNode(item.node);

        try {
            const rect = item.node.getBoundingClientRect();
            const doc = item.node.ownerDocument;
            const win = doc.defaultView;
            const viewHeight = win.innerHeight;
            const isVisible = (rect.top >= 0 && rect.bottom <= viewHeight);
            if (!isVisible) {
                item.node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        } catch (e) {
            item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const engine = engines[ttsConfig.engineId];
        if (!engine) return;

        engine.speak(item.text, {
            voiceId: ttsConfig.voiceId,
            rate: ttsConfig.rate
        }, {
            onEnd: () => {
                if (playingRef.current) {
                    playNext(index + 1);
                }
            },
            onError: (e) => {
                console.error(e);
                setPlaying(false);
            }
        });
    }, [ttsConfig]);

    useEffect(() => { playNextRef.current = playNext; }, [playNext]);

    const highlightNode = (node) => {
        const doc = node.ownerDocument;
        doc.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
        node.classList.add('tts-active');
    };

    const stopTTS = () => {
        const engine = engines[ttsConfig.engineId];
        if (engine) engine.stop();
        setPlaying(false);
        playingRef.current = false;

        if (currentChapterNodes.current.length > 0 && currentChapterNodes.current[0].node) {
            const doc = currentChapterNodes.current[0].node.ownerDocument;
            if (doc) doc.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
        }
    };

    useEffect(() => { stopTTSRef.current = stopTTS; }, [ttsConfig]);

    const togglePlay = () => {
        if (playing) {
            stopTTS();
        } else {
            setPlaying(true);
            playingRef.current = true;
            let startIndex = currentIndex;
            if (startIndex < 0) startIndex = 0;
            playNext(startIndex);
        }
    };

    const handlePrev = () => {
        stopTTS();
        setPlaying(true);
        playingRef.current = true;
        let newIndex = currentIndex - 1;
        if (newIndex < 0) newIndex = 0;
        playNext(newIndex);
    };

    const handleNext = () => {
        stopTTS();
        setPlaying(true);
        playingRef.current = true;
        playNext(currentIndex + 1);
    };

    const handleNextChapter = () => {
        stopTTS();
        renditionRef.current?.next();
    };

    const handlePrevChapter = () => {
        stopTTS();
        renditionRef.current?.prev();
    };

    useEffect(() => {
        nextChapterRef.current = handleNextChapter;
        prevChapterRef.current = handlePrevChapter;
    }, []);

    return (
        <div className="player-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <nav style={{ marginBottom: '0.5rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link to={id ? `/book/${id}/toc` : '/'} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                        <ArrowLeft size={20} />
                        {id ? 'Chapters' : 'Library'}
                    </Link>
                </div>
                <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
            </nav>

            {loading && <div>Loading book...</div>}
            {error && <div style={{ color: 'red' }}>{error}</div>}

            <div style={{ flex: 1, position: 'relative', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div ref={viewerRef} style={{ width: '100%', height: '100%' }} />
            </div>

            <Controls
                playing={playing}
                onPlayPause={togglePlay}
                onNext={handleNext}
                onPrev={handlePrev}
            />
        </div>
    );
}
