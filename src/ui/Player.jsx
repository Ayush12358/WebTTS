import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { bookStore } from '../core/bookStore';
import { getParserForFile } from '../core/parsers';
import { engines } from '../core/tts';
import { Settings } from './components/Settings';
import { Controls } from './components/Controls';
import { ThemeToggle } from './components/ThemeToggle';
import { PDFPageView } from './components/PDFPageView';
import { BookmarkPanel } from './components/BookmarkPanel';
import { Skeleton } from './components/Skeleton';
import { Bookmark } from 'lucide-react';

export function Player() {
    const { id, cfi } = useParams();
    const [book, setBook] = useState(null);
    const [bookMeta, setBookMeta] = useState(null);
    const [parser, setParser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [chapterContent, setChapterContent] = useState('');
    const [currentSpineIndex, setCurrentSpineIndex] = useState(0);
    const [nativePdfPayload, setNativePdfPayload] = useState(null);

    const contentRef = useRef(null); // Ref to the container div

    const [playing, setPlaying] = useState(false);
    const [bookmarks, setBookmarks] = useState([]);
    const [showBookmarks, setShowBookmarks] = useState(false);

    const [ttsConfig, setTtsConfig] = useState({
        engineId: 'webSpeech',
        voiceId: '',
        rate: 1.0,
        pitch: 1.0
    });

    // Playback State
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [searchParams] = useSearchParams();
    const currentNodes = useRef([]); // Speakable nodes
    const navigate = useNavigate();

    // Playback Ref Bridge
    const playNextRef = useRef(null);
    const playingRef = useRef(false);
    useEffect(() => { playingRef.current = playing; }, [playing]);

    // Prefetch Ref
    const prefetchRef = useRef({ index: -1, promise: null });

    // Auto-scroll dedup ref
    const lastScrolledIndex = useRef(-1);

    // Load Book
    useEffect(() => {
        const loadBook = async () => {
            try {
                if (!id) {
                    navigate('/');
                    return;
                }

                // Load saved TTS settings
                const savedSettings = await bookStore.getSettings('ttsConfig');
                if (savedSettings) {
                    setTtsConfig(savedSettings);
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
                let nodeIndex = 0;

                if (cfi && cfi !== 'start') {
                    // Cfi support is EPUB specific for now, but index works for others
                    spineIndex = parseInt(cfi) || 0;
                    const nodeParam = searchParams.get('node');
                    if (nodeParam) nodeIndex = parseInt(nodeParam);
                } else {
                    // Load last progress
                    const lastProgress = await bookStore.getProgress(id);
                    if (lastProgress) {
                        spineIndex = lastProgress.spineIndex;
                        nodeIndex = lastProgress.nodeIndex;
                    }
                }

                setCurrentSpineIndex(spineIndex);
                setCurrentIndex(nodeIndex);
                loadChapter(bookParser, parsed.instance, spineIndex, nodeIndex);

            } catch (err) {
                console.error("Error loading book:", err);
                setError("Failed to load book content.");
                setLoading(false);
            }
        };
        loadBook();
        loadBookmarks();
    }, [id, navigate]);

    // Save settings when ttsConfig changes
    useEffect(() => {
        bookStore.saveSettings('ttsConfig', ttsConfig);
    }, [ttsConfig]);

    const loadBookmarks = async () => {
        const list = await bookStore.getBookmarks(id);
        setBookmarks(list);
    };

    // Load Chapter Content
    const loadChapter = async (currentParser, bookInstance, index, jumpToNode = -1) => {
        setLoading(true);
        setPlaying(false);
        try {
            const result = await currentParser.getChapterContent(bookInstance, index);

            if (result.isPdfNative) {
                // Bypass the HTML extraction entirely
                setChapterContent('');
                setNativePdfPayload(result);
                // We don't set loading false yet, the PDFPageView will call a callback when done
            } else {
                setNativePdfPayload(null);
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

                // If we have a jumpToNode, wait for render then jump
                if (jumpToNode >= 0) {
                    // The useEffect for chapterContent will handle the scrolling
                }
            }
        } catch (e) {
            console.error("Failed to load chapter", e);
            setError("Failed to load chapter.");
            setLoading(false);
        }
    };

    // Post-Render Processing: Find Nodes
    useEffect(() => {
        if (!contentRef.current) return;
        if (loading) return; // Wait until PDF or HTML is fully loaded

        const container = contentRef.current;
        const elements = container.querySelectorAll('.tts-speakable');
        const items = [];

        elements.forEach((el) => {
            const idx = parseInt(el.getAttribute('data-tts-index'));
            const text = el.innerText.trim();
            items.push({ text, node: el, index: idx });
        });

        currentNodes.current = items;

        // Apply visual markers for existing bookmarks in this chapter
        const chapterBookmarks = bookmarks.filter(b => parseInt(b.spineIndex) === currentSpineIndex);
        chapterBookmarks.forEach(b => {
            const target = items.find(n => n.index === parseInt(b.nodeIndex));
            if (target) target.node.classList.add('is-bookmarked');
        });

        // Jump to bookmarked line or saved progress
        const nodeToJump = searchParams.get('node') || currentIndex;
        if (nodeToJump !== null && nodeToJump >= 0 && items.length > 0) {
            const idx = parseInt(nodeToJump);
            const target = items.find(n => n.index === idx);
            if (target) {
                setTimeout(() => {
                    target.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.node.classList.add('tts-active');
                    // Remove highlight after a delay so it's not permanent unless playing
                    if (!playingRef.current) {
                        setTimeout(() => target.node.classList.remove('tts-active'), 2000);
                    }
                }, 100);
            }
        }
    }, [chapterContent, nativePdfPayload, loading, searchParams, bookmarks]);

    // Save progress when spine/node changes
    useEffect(() => {
        if (id && currentSpineIndex >= 0 && currentIndex >= 0) {
            bookStore.saveProgress(id, currentSpineIndex, currentIndex);
        }
    }, [id, currentSpineIndex, currentIndex]);

    const calculateTimeLeft = () => {
        if (!bookMeta?.toc || !ttsConfig.rate) return null;

        let remainingWords = 0;

        // 1. Current chapter remaining
        const currentChapter = bookMeta.toc[currentSpineIndex];
        if (currentChapter && currentNodes.current.length > 0) {
            const progress = (currentIndex + 1) / currentNodes.current.length;
            remainingWords += currentChapter.words * (1 - progress);
        }

        // 2. Future chapters
        for (let i = currentSpineIndex + 1; i < bookMeta.toc.length; i++) {
            remainingWords += (bookMeta.toc[i].words || 0);
        }

        const wpm = 200 * ttsConfig.rate;
        const totalMins = Math.ceil(remainingWords / wpm);

        if (totalMins >= 60) {
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;
            return `${h}h ${m}m`;
        }
        return `${totalMins}m`;
    };

    const timeLeft = calculateTimeLeft();

    // Navigation
    const goToNextChapter = () => {
        if (!book || !parser) return;
        const next = parser.getNextChapter(book, currentSpineIndex);
        if (next !== null) {
            setCurrentSpineIndex(next);
            loadChapter(parser, book, next);
            contentRef.current?.parentElement?.scrollTo(0, 0);
        }
    };

    const goToPrevChapter = () => {
        if (!book || !parser) return;
        const prev = parser.getPrevChapter(book, currentSpineIndex);
        if (prev !== null) {
            setCurrentSpineIndex(prev);
            loadChapter(parser, book, prev);
            contentRef.current?.parentElement?.scrollTo(0, 0);
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

        // Auto-scroll: only if not already scrolled to this index
        if (lastScrolledIndex.current !== index) {
            lastScrolledIndex.current = index;
            const container = contentRef.current?.parentElement;
            const containerRect = container ? container.getBoundingClientRect() : null;
            const rect = item.node.getBoundingClientRect();

            // Check if element is visible within the scroll container, not the window
            const inView = containerRect
                ? (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom)
                : (rect.top >= 0 && rect.bottom <= window.innerHeight);

            if (!inView) {
                item.node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        const speechEngine = engines[ttsConfig.engineId];
        if (!speechEngine) return;

        try {
            // Check for prefetch
            let audioObject = null;
            if (prefetchRef.current.index === index && prefetchRef.current.promise) {
                console.log('Resolving prefetch for index:', index);
                audioObject = await prefetchRef.current.promise;
                prefetchRef.current = { index: -1, promise: null }; // Consume
            }

            // Trigger NEXT prefetch immediately
            const nextIndex = index + 1;
            if (nextIndex < currentNodes.current.length) {
                const nextText = currentNodes.current[nextIndex].text;
                console.log('Prefetching next index:', nextIndex);
                prefetchRef.current = {
                    index: nextIndex,
                    promise: speechEngine.prefetch(nextText, {
                        voiceId: ttsConfig.voiceId,
                        rate: ttsConfig.rate,
                        pitch: ttsConfig.pitch
                    })
                };
            }

            await speechEngine.speak(item.text, {
                voiceId: ttsConfig.voiceId,
                rate: ttsConfig.rate,
                pitch: ttsConfig.pitch,
                audioObject: audioObject // Pass preloaded audio
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
        // If this click follows a long press, ignore it
        if (isLongPress.current) {
            isLongPress.current = false;
            return;
        }

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

    const handleBookmark = async () => {
        if (currentIndex < 0 || !currentNodes.current[currentIndex]) {
            return;
        }
        await saveBookmark(currentSpineIndex, currentIndex, currentNodes.current[currentIndex].text);
    };

    const saveBookmark = useCallback(async (spineIndex, nodeIndex, text) => {
        try {
            const si = parseInt(spineIndex);
            const ni = parseInt(nodeIndex);

            const existing = bookmarks.find(b =>
                parseInt(b.spineIndex) === si &&
                parseInt(b.nodeIndex) === ni
            );

            if (existing) {
                await bookStore.removeBookmark(id, existing.id);
                setBookmarks(prev => prev.filter(b => b.id !== existing.id));
                const target = currentNodes.current.find(n => n.index === ni);
                if (target) target.node.classList.remove('is-bookmarked');
            } else {
                const newB = await bookStore.addBookmark(id, si, ni, text);
                setBookmarks(prev => [...prev, newB]);
                const target = currentNodes.current.find(n => n.index === ni);
                if (target) target.node.classList.add('is-bookmarked');
            }
        } catch (e) {
            console.error("Failed to toggle bookmark", e);
        }
    }, [id, bookmarks]);

    const handleContextMenu = useCallback((e) => {
        e.preventDefault();

        // If our long-press timer already handled this, just exit
        if (isLongPress.current) {
            // Note: We don't reset isLongPress here because handleContentClick needs it
            return;
        }

        // Handle right-click or native long-press
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        let target = e.target;
        while (target && target !== contentRef.current) {
            if (target.getAttribute && target.getAttribute('data-tts-index')) {
                const idx = parseInt(target.getAttribute('data-tts-index'));
                const text = target.innerText.trim();
                saveBookmark(currentSpineIndex, idx, text);
                return;
            }
            target = target.parentNode;
        }
    }, [saveBookmark, currentSpineIndex]);

    // Unified Pointer Logic (Mouse + Touch)
    const longPressTimer = useRef(null);
    const lastPointerPos = useRef({ x: 0, y: 0 });
    const isLongPress = useRef(false);

    // Swipe tracking
    const swipeStart = useRef({ x: 0, y: 0, active: false });
    const isVerticalScroll = useRef(false);
    const SWIPE_THRESHOLD = 50; // min horizontal px to trigger swipe

    const handlePointerDown = useCallback((e) => {
        // Only trigger for primary button (left click / single touch)
        if (e.button !== 0) return;
        isLongPress.current = false;

        // Start swipe tracking
        swipeStart.current = { x: e.clientX, y: e.clientY, active: true };
        isVerticalScroll.current = false;

        let target = e.target;
        while (target && target !== contentRef.current) {
            if (target.getAttribute && target.getAttribute('data-tts-index')) {
                const idx = parseInt(target.getAttribute('data-tts-index'));
                const text = target.innerText.trim();

                lastPointerPos.current = { x: e.clientX, y: e.clientY };

                longPressTimer.current = setTimeout(() => {
                    isLongPress.current = true;
                    if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
                    saveBookmark(currentSpineIndex, idx, text);
                    longPressTimer.current = null;
                }, 500);
                return;
            }
            target = target.parentNode;
        }
    }, [saveBookmark, currentSpineIndex]);

    const handlePointerUp = useCallback((e) => {
        // Cleanup long-press timer
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }

        // Swipe detection
        if (swipeStart.current.active && !isLongPress.current && !isVerticalScroll.current) {
            const deltaX = e.clientX - swipeStart.current.x;
            const absDeltaX = Math.abs(deltaX);

            if (absDeltaX > SWIPE_THRESHOLD) {
                if (deltaX > 0) {
                    // Right swipe → previous sentence
                    playFromIndex(currentIndex - 1);
                } else {
                    // Left swipe → next sentence
                    playFromIndex(currentIndex + 1);
                }
                if (navigator.vibrate) navigator.vibrate(15);
            }
        }

        swipeStart.current.active = false;
    }, [currentIndex, playFromIndex]);

    const handlePointerMove = useCallback((e) => {
        // Determine scroll direction (only once per gesture)
        if (swipeStart.current.active && !isVerticalScroll.current) {
            const dx = Math.abs(e.clientX - swipeStart.current.x);
            const dy = Math.abs(e.clientY - swipeStart.current.y);
            if (dx > 5 || dy > 5) {
                isVerticalScroll.current = dy > dx;
            }
            // If horizontal swipe, prevent vertical scroll takeover
            if (!isVerticalScroll.current && dx > 30) {
                e.preventDefault();
            }
        }

        // Long-press cancellation (existing logic)
        if (!longPressTimer.current) return;

        const dist = Math.sqrt(
            Math.pow(e.clientX - lastPointerPos.current.x, 2) +
            Math.pow(e.clientY - lastPointerPos.current.y, 2)
        );

        if (dist > 10) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    }, []);

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
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                        onClick={() => setShowBookmarks(prev => !prev)}
                        style={{
                            background: 'transparent',
                            color: showBookmarks ? 'var(--accent-color)' : 'var(--text-primary)',
                            padding: '4px',
                            position: 'relative'
                        }}
                        title="Bookmarks"
                    >
                        <Bookmark size={20} fill={showBookmarks ? 'currentColor' : 'none'} />
                        {bookmarks.length > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-2px',
                                right: '-6px',
                                background: 'var(--accent-color)',
                                color: 'white',
                                fontSize: '0.6rem',
                                width: '16px',
                                height: '16px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                {bookmarks.length}
                            </span>
                        )}
                    </button>
                    <ThemeToggle />
                    <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
                </div>
            </nav>

            {loading && (
                <div style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
                    {Array.from({ length: 8 }, (_, i) => (
                        <Skeleton
                            key={i}
                            width={`${85 + Math.random() * 15}%`}
                            height="1rem"
                            style={{ marginBottom: '0.75rem' }}
                        />
                    ))}
                    <Skeleton width="60%" height="1rem" style={{ marginBottom: '2rem' }} />
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton
                            key={i + 8}
                            width={`${80 + Math.random() * 20}%`}
                            height="1rem"
                            style={{ marginBottom: '0.75rem' }}
                        />
                    ))}
                </div>
            )}
            {error && <div style={{ color: 'red', padding: '1rem' }}>{error}</div>}

            <div
                className="reader-content"
                onContextMenu={handleContextMenu}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerMove={handlePointerMove}
                onPointerCancel={handlePointerUp}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '1rem 1rem 6rem 1rem',
                    lineHeight: '1.6',
                    fontSize: '1.1rem',
                    touchAction: 'pan-y pinch-zoom' // Allow vertical scroll + pinch, swipe handled by pointer events
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

                {nativePdfPayload ? (
                    <div ref={contentRef} onClick={handleContentClick} style={{ display: 'flex', justifyContent: 'center' }}>
                        <PDFPageView
                            pdfData={nativePdfPayload.binaryData}
                            pageIndex={nativePdfPayload.pageIndex}
                            onLoaded={() => setLoading(false)}
                        />
                    </div>
                ) : (
                    <div ref={contentRef} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: chapterContent }} />
                )}

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

            <BookmarkPanel
                bookmarks={bookmarks}
                currentSpineIndex={currentSpineIndex}
                onNavigate={(spineIndex, nodeIndex) => {
                    navigate(`/book/${id}/read/${spineIndex}?node=${nodeIndex}`);
                    setShowBookmarks(false);
                }}
                onDelete={async (bookmarkId) => {
                    await bookStore.removeBookmark(id, bookmarkId);
                    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
                }}
                isOpen={showBookmarks}
                onClose={() => setShowBookmarks(false)}
            />

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
                    timeLeft={timeLeft}
                />
            </div>

            <style>{`
            .tts-speakable { 
                cursor: pointer; 
                transition: background 0.2s; 
                position: relative; 
                user-select: none; /* Prevent text selection during long press */
                -webkit-tap-highlight-color: transparent;
                -webkit-touch-callout: none;
            }
            .tts-speakable:hover { background: rgba(255, 255, 255, 0.1); }
            .is-bookmarked::before {
                content: '🔖';
                position: absolute;
                left: -1.25rem;
                top: 0;
                font-size: 0.8rem;
                opacity: 0.8;
            }
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
