import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ePub from 'epubjs';
import { bookStore } from '../core/bookStore';
import { engines } from '../core/tts';
import { Settings } from './components/Settings';
import { Controls } from './components/Controls';

export function Player() {
    const { id, cfi } = useParams();
    const [book, setBook] = useState(null);
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

                const loadedBook = ePub(bookData);
                await loadedBook.ready;
                setBook(loadedBook);

                // Resolve initial location
                let spineIndex = 0;
                if (cfi && cfi !== 'start') {
                    // If CFI is provided, we need to find the spine item.
                    // Simplified: direct renderer mostly works with chapters.
                    // We will just load the first chapter or what's asked.
                    // For now, default to 0 or try to resolve.
                    const item = loadedBook.spine.get(decodeURIComponent(cfi));
                    if (item) spineIndex = item.index;
                }
                setCurrentSpineIndex(spineIndex);
                loadChapter(loadedBook, spineIndex);

            } catch (err) {
                console.error("Error loading book:", err);
                setError("Failed to load book content.");
                setLoading(false);
            }
        };
        loadBook();
    }, [id, navigate]);

    // Load Chapter Content
    const loadChapter = async (currentBook, index) => {
        setLoading(true);
        setPlaying(false);
        try {
            const spineItem = currentBook.spine.get(index);
            if (!spineItem) {
                setLoading(false);
                return;
            }

            // 1. Get HTML text
            // We use 'load' to get the document, but we can also just get text?
            // spineItem.load(currentBook.load.bind(currentBook)) returns a Document.
            const render = currentBook.renderer; // access internal renderer helpers if needed? No.
            // Use low level load:
            const doc = await spineItem.load(currentBook.load.bind(currentBook));

            // 2. Process Assets (Images)
            // We need to find all images in the doc and replace their src with blob urls from the archive.
            const images = doc.querySelectorAll('img');
            const imagePromises = Array.from(images).map(async (img) => {
                const src = img.getAttribute('src');
                if (src) {
                    // Resolve path relative to the chapter file
                    const absolutePath = currentBook.path.resolve(src, spineItem.url);
                    const url = await currentBook.archive.createUrl(absolutePath);
                    img.src = url;
                }
            });
            await Promise.all(imagePromises);

            // 3. Serialize to HTML string OR just append DOM nodes?
            // Appending nodes is safer and preserves events if we attached them (we didn't yet).
            // But React prefers innerHTML or managing children. 
            // 'dangerouslySetInnerHTML' with the body's innerHTML is easiest.

            // 4. Pre-process for TTS
            // Inject data-indices now on the live DOM passed?
            // Or do it after render. Doing it on 'doc' before stringifying is robust.
            const elements = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
            const items = [];
            elements.forEach((el) => {
                const text = el.innerText.trim();
                if (text) {
                    el.setAttribute('data-tts-index', items.length);
                    el.classList.add('tts-speakable');
                    items.push({ text, id: items.length }); // We can't store 'node' here easily if we re-render string.
                }
            });

            // Convert to string
            // We need the body's content. For XML/XHTML documents (which EPUBs are), 
            // the .body property might be missing on the Document interface.
            const bodyEl = doc.body || doc.querySelector('body');

            if (bodyEl) {
                setChapterContent(bodyEl.innerHTML);
            } else {
                console.warn("No contents found in chapter");
                setChapterContent("");
            }

            // We need to re-find nodes after React renders them.
            // We will do that in useEffect [chapterContent].

            setLoading(false);
        } catch (e) {
            console.error("Failed to load chapter", e);
            setError("Failed to load chapter.");
            setLoading(false);
        }
    };

    // Post-Render Processing: Find Nodes (Listeners removed in favor of delegation)
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
        if (book && currentSpineIndex < book.spine.length - 1) {
            const next = currentSpineIndex + 1;
            setCurrentSpineIndex(next);
            loadChapter(book, next);
            window.scrollTo(0, 0);
        }
    };

    const goToPrevChapter = () => {
        if (book && currentSpineIndex > 0) {
            const prev = currentSpineIndex - 1;
            setCurrentSpineIndex(prev);
            loadChapter(book, prev);
            window.scrollTo(0, 0);
        }
    };


    // TTS Logic
    const playFromIndex = useCallback(async (index) => {
        // Stop previous
        const currentEngine = engines[ttsConfig.engineId];
        if (currentEngine) currentEngine.stop();
        setPlaying(false);
        playingRef.current = false;
        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));

        // Boundary checks
        if (index < 0) return;
        if (index >= currentNodes.current.length) {
            setPlaying(false);
            return;
        }

        // Small delay to ensure engine resets (WebSpeech quirk)
        await new Promise(r => setTimeout(r, 50));

        setCurrentIndex(index);
        setPlaying(true);
        playingRef.current = true;

        const item = currentNodes.current[index];
        if (!item) return;

        // Highlight
        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
        item.node.classList.add('tts-active');

        // Scroll
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

    // Delegated Click Handler (must be defined after playFromIndex)
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

    // Recursion Ref
    useEffect(() => { playNextRef.current = playFromIndex; }, [playFromIndex]);

    const stopTTS = () => {
        // Set flag to false FIRST to prevent onEnd callbacks from triggering next check
        playingRef.current = false;
        setPlaying(false);

        const engine = engines[ttsConfig.engineId];
        if (engine) engine.stop();

        document.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
    };

    // Controls Logic
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
                <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
            </nav>

            {loading && <div style={{ padding: '2rem', textAlign: 'center' }}>Loading content...</div>}
            {error && <div style={{ color: 'red', padding: '1rem' }}>{error}</div>}

            {/* Main Reading Area - Direct DOM */}
            <div
                className="reader-content"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem 1rem 6rem 1rem', /* Major increase in right padding */
                    /* Max width removed for full width */
                    // margin: '0 auto',
                    // width: '100%',
                    lineHeight: '1.6',
                    fontSize: '1.1rem'
                }}
            >
                <button
                    onClick={goToPrevChapter}
                    disabled={currentSpineIndex <= 0}
                    style={{
                        display: 'block', width: '100%', padding: '1rem',
                        marginBottom: '2rem',
                        opacity: currentSpineIndex <= 0 ? 0.5 : 1,
                        background: 'rgba(128,128,128,0.1)',
                        color: 'var(--text-primary)'
                    }}
                >
                    ← Previous Chapter
                </button>

                <div ref={contentRef} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: chapterContent }} />

                <button
                    onClick={goToNextChapter}
                    disabled={!book || currentSpineIndex >= book.spine.length - 1}
                    style={{
                        display: 'block', width: '100%', padding: '1rem',
                        marginTop: '2rem',
                        opacity: (!book || currentSpineIndex >= book.spine.length - 1) ? 0.5 : 1,
                        background: 'rgba(128,128,128,0.1)',
                        color: 'var(--text-primary)'
                    }}
                >
                    Next Chapter →
                </button>
            </div>

            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--bg-primary)',
                borderTop: '1px solid rgba(0,0,0,0.1)',
                padding: '10px' // Ensure controls have space
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
            background-color: rgba(255, 235, 59, 1) !important; /* Material Yellow 500 - Solid */
            border-radius: 4px; 
            outline: 3px solid #F57F17 !important; /* Material Yellow 900 - Strong Border */
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
