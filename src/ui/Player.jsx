import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { bookStore } from '../core/bookStore';
import { getParserForFile } from '../core/parsers';
import { engines } from '../core/tts';
import { Settings } from './components/Settings';
import { Controls } from './components/Controls';
import { ThemeToggle } from './components/ThemeToggle';

export function Player() {
    const { id, cfi } = useParams();
    const [book, setBook] = useState(null);
    const [bookMeta, setBookMeta] = useState(null);
    const [parser, setParser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chapterContent, setChapterContent] = useState('');
    const [currentSpineIndex, setCurrentSpineIndex] = useState(0);

    const contentRef = useRef(null); // Ref to the container div

    const [playing, setPlaying] = useState(false);

    const [ttsConfig, setTtsConfig] = useState({
        engineId: 'webSpeech',
        voiceId: '',
        rate: 1.0
    });

    // Playback State
    const [currentIndex, setCurrentIndex] = useState(-1);
    const currentNodes = useRef([]); // Speakable nodes
    const navigate = useNavigate();

    // Playback Ref Bridge
    const playNextRef = useRef(null);
    const playingRef = useRef(false);
    useEffect(() => { playingRef.current = playing; }, [playing]);

    // Load Book
    useEffect(() => {
        const loadBook = async () => {
            try {
                if (!id) {
                    navigate('/');
                    return;
                }

                const bookData = await bookStore.getBookData(id);
                const metadata = await bookStore.getBookMeta(id);

                if (!bookData || !metadata) {
                    navigate('/');
                    return;
                }

                setBookMeta(metadata);
                const bookParser = getParserForFile(metadata.fileName);
                if (!bookParser) {
                    throw new Error(`No parser found for ${metadata.fileName}`);
                }
                setParser(bookParser);

                const parsed = await bookParser.parse(bookData, metadata.fileName);
                setBook(parsed.instance);

                // Resolve initial location
                let spineIndex = 0;
                if (cfi && cfi !== 'start') {
                    // Cfi support is EPUB specific for now, but index works for others
                    spineIndex = parseInt(cfi) || 0;
                }
                setCurrentSpineIndex(spineIndex);
                loadChapter(bookParser, parsed.instance, spineIndex);

            } catch (err) {
                console.error("Error loading book:", err);
                setError("Failed to load book content.");
                setLoading(false);
            }
        };
        loadBook();
    }, [id, navigate]);

    // Load Chapter Content
    const loadChapter = async (currentParser, bookInstance, index) => {
        setLoading(true);
        setPlaying(false);
        try {
            const result = await currentParser.getChapterContent(bookInstance, index);

            // Pre-process for TTS in a temporary container
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = result.html;

            const elements = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, span');
            const items = [];
            elements.forEach((el) => {
                const text = el.innerText.trim();
                // Avoid nested speakables
                if (text && !el.closest('.tts-speakable')) {
                    el.setAttribute('data-tts-index', items.length);
                    el.classList.add('tts-speakable');
                    items.push({ text, id: items.length });
                }
            });

            setChapterContent(tempDiv.innerHTML);
            setLoading(false);
        } catch (e) {
            console.error("Failed to load chapter", e);
            setError("Failed to load chapter.");
            setLoading(false);
        }
    };

    // Post-Render Processing: Find Nodes
    useEffect(() => {
        if (!contentRef.current) return;

        const container = contentRef.current;
        const elements = container.querySelectorAll('.tts-speakable');
        const items = [];

        elements.forEach((el) => {
            const idx = parseInt(el.getAttribute('data-tts-index'));
            const text = el.innerText.trim();
            items.push({ text, node: el, index: idx });
        });

        currentNodes.current = items;
    }, [chapterContent]);

    // Navigation
    const goToNextChapter = () => {
        if (!book || !parser) return;
        const next = parser.getNextChapter(book, currentSpineIndex);
        if (next !== null) {
            setCurrentSpineIndex(next);
            loadChapter(parser, book, next);
            window.scrollTo(0, 0);
        }
    };

    const goToPrevChapter = () => {
        if (!book || !parser) return;
        const prev = parser.getPrevChapter(book, currentSpineIndex);
        if (prev !== null) {
            setCurrentSpineIndex(prev);
            loadChapter(parser, book, prev);
            window.scrollTo(0, 0);
        }
    };

    // TTS Logic
    const playFromIndex = useCallback(async (index) => {
        const currentEngine = engines[ttsConfig.engineId];
        if (currentEngine) currentEngine.stop();
        setPlaying(false);
        playingRef.current = false;
        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));

        if (index < 0) return;
        if (index >= currentNodes.current.length) {
            setPlaying(false);
            return;
        }

        await new Promise(r => setTimeout(r, 50));

        setCurrentIndex(index);
        setPlaying(true);
        playingRef.current = true;

        const item = currentNodes.current[index];
        if (!item) return;

        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
        item.node.classList.add('tts-active');

        const rect = item.node.getBoundingClientRect();
        const inView = (rect.top >= 0 && rect.bottom <= window.innerHeight);
        if (!inView) {
            item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const speechEngine = engines[ttsConfig.engineId];
        if (!speechEngine) return;

        try {
            await speechEngine.speak(item.text, {
                voiceId: ttsConfig.voiceId,
                rate: ttsConfig.rate
            }, {
                onEnd: () => {
                    if (playingRef.current) {
                        playNextRef.current(index + 1);
                    }
                },
                onError: (e) => {
                    console.error(e);
                    setPlaying(false);
                }
            });
        } catch (e) {
            console.error(e);
            setPlaying(false);
        }
    }, [ttsConfig]);

    const handleContentClick = useCallback((e) => {
        let target = e.target;
        while (target && target !== contentRef.current) {
            if (target.getAttribute && target.getAttribute('data-tts-index')) {
                const idx = parseInt(target.getAttribute('data-tts-index'));
                e.stopPropagation();
                playFromIndex(idx);
                return;
            }
            target = target.parentNode;
        }
    }, [playFromIndex]);

    useEffect(() => { playNextRef.current = playFromIndex; }, [playFromIndex]);

    const stopTTS = () => {
        playingRef.current = false;
        setPlaying(false);
        const engine = engines[ttsConfig.engineId];
        if (engine) engine.stop();
        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
    };

    const togglePlay = () => {
        if (playing) {
            stopTTS();
        } else {
            let start = currentIndex >= 0 ? currentIndex : 0;
            playFromIndex(start);
        }
    };

    return (
        <div className="player-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <nav style={{
                padding: '0.5rem',
                borderBottom: '1px solid var(--border-color, rgba(0,0,0,0.1))',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-primary)'
            }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <Link to={id ? `/book/${id}/toc` : '/'} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                        <ArrowLeft size={20} />
                        {id ? 'Chapters' : 'Library'}
                    </Link>
                </div>
                <ThemeToggle />
                <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
            </nav>

            {loading && <div style={{ padding: '2rem', textAlign: 'center' }}>Loading content...</div>}
            {error && <div style={{ color: 'red', padding: '1rem' }}>{error}</div>}

            <div
                className="reader-content"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem 1rem 6rem 1rem',
                    lineHeight: '1.6',
                    fontSize: '1.1rem'
                }}
            >
                <button
                    onClick={goToPrevChapter}
                    disabled={!parser || !book || parser.getPrevChapter(book, currentSpineIndex) === null}
                    style={{
                        display: 'block', width: '100%', padding: '1rem',
                        marginBottom: '2rem',
                        opacity: (!parser || !book || parser.getPrevChapter(book, currentSpineIndex) === null) ? 0.5 : 1,
                        background: 'rgba(128,128,128,0.1)',
                        color: 'var(--text-primary)'
                    }}
                >
                    ← Previous
                </button>

                <div ref={contentRef} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: chapterContent }} />

                <button
                    onClick={goToNextChapter}
                    disabled={!parser || !book || parser.getNextChapter(book, currentSpineIndex) === null}
                    style={{
                        display: 'block', width: '100%', padding: '1rem',
                        marginTop: '2rem',
                        opacity: (!parser || !book || parser.getNextChapter(book, currentSpineIndex) === null) ? 0.5 : 1,
                        background: 'rgba(128,128,128,0.1)',
                        color: 'var(--text-primary)'
                    }}
                >
                    Next →
                </button>
            </div>

            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--bg-primary)',
                borderTop: '1px solid rgba(0,0,0,0.1)',
                padding: '10px'
            }}>
                <Controls
                    playing={playing}
                    onPlayPause={togglePlay}
                    onNext={() => playFromIndex(currentIndex + 1)}
                    onPrev={() => playFromIndex(currentIndex - 1)}
                />
            </div>

            <style>{`
            .tts-speakable { cursor: pointer; transition: background 0.2s; }
            .tts-speakable:hover { background: rgba(255, 255, 255, 0.1); }
            .tts-active { 
                background-color: rgba(255, 235, 59, 1) !important;
                border-radius: 4px; 
                outline: 3px solid #F57F17 !important;
                color: #000000 !important;
                box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            }
            [data-theme='dark'] .tts-active { 
                background-color: rgba(255, 235, 59, 0.7) !important; 
                outline-color: #F57F17 !important;
                color: #ffffff !important;
            }
            img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
          `}</style>
        </div>
    );
}
