import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { getParserForFile } from '../core/parsers';
import { engines } from '../core/tts';
import { Controls } from './components/Controls';
import { PDFPageView } from './components/PDFPageView';
import { BookmarkPanel } from './components/BookmarkPanel';
import { Skeleton } from './components/Skeleton';
import { useHeaderActions } from './components/HeaderActions';
import { useTTSConfig } from '../core/useTTSConfig';
import { getElementSegment, prepareHtmlContent, splitTextIntoSegments } from '../core/content';
import { Clock } from 'lucide-react';
import { useToast } from './components/Toast';

function resolveSegmentTarget(target, root) {
    let node = target;
    while (node && node !== root) {
        const direct = getElementSegment(node);
        if (direct) return { ...direct, node };

        const groupIndex = node.getAttribute?.('data-tts-segment-index');
        if (groupIndex !== null && groupIndex !== undefined) {
            const leader = root.querySelector(`[data-tts-index="${groupIndex}"]`);
            const segment = getElementSegment(leader);
            if (segment) return { ...segment, node: leader };
        }
        node = node.parentNode;
    }
    return null;
}

/**
 * Resolve a bookmark segment by exact `data-tts-text` match against the
 * rendered chapter DOM. Books repeat short sentences, so among text-equal
 * elements the one whose `data-tts-index === nodeIndex` wins; the first
 * text-equal element is the fallback when no index matches. Returns null when
 * no element has exactly this text (caller falls back to nodeIndex).
 * @param {Element} root
 * @param {string} text
 * @param {number|string} nodeIndex
 * @returns {{ index: number, text: string, node: Element }|null}
 */
function resolveSegmentByText(root, text, nodeIndex) {
    if (!root || !text) return null;
    const wantIndex = Number.isInteger(Number(nodeIndex)) ? Number(nodeIndex) : null;
    let firstMatch = null;
    let indexMatch = null;
    root.querySelectorAll('.tts-speakable').forEach(node => {
        const segment = getElementSegment(node);
        if (!segment || segment.text !== text) return;
        if (!firstMatch) firstMatch = { ...segment, node };
        if (wantIndex !== null && segment.index === wantIndex && !indexMatch) {
            indexMatch = { ...segment, node };
        }
    });
    return indexMatch || firstMatch;
}

function setSegmentClass(root, index, className, enabled) {
    if (!root) return;
    root.querySelectorAll(`[data-tts-index="${index}"], [data-tts-segment-index="${index}"]`).forEach(node => {
        node.classList.toggle(className, enabled);
    });
}

function formatSleepTime(seconds) {
    return seconds >= 60 ? `${Math.ceil(seconds / 60)}m` : `${Math.max(0, Math.round(seconds))}s`;
}

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
    const { registerBookmarks, clearBookmarks } = useHeaderActions();

    const [ttsConfig] = useTTSConfig();
    const [engineStatus, setEngineStatus] = useState(null);

    // Optional engine setup-status reporting (some engines implement onStatus).
    useEffect(() => {
        const engine = engines[ttsConfig.engineId];
        if (engine?.onStatus) return engine.onStatus(setEngineStatus);
    }, [ttsConfig.engineId]);

    // Playback State
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [currentNodeCount, setCurrentNodeCount] = useState(0);
    const [searchParams] = useSearchParams();
    const currentNodes = useRef([]); // Speakable nodes
    const navigate = useNavigate();

    // Playback Ref Bridge
    const playNextRef = useRef(null);
    const playingRef = useRef(false);
    useEffect(() => { playingRef.current = playing; }, [playing]);

    // Paused = engine suspended, NOT stopped (highlight/currentIndex/auto-continue stay put).
    const [paused, setPaused] = useState(false);
    const pausedRef = useRef(false);
    useEffect(() => { pausedRef.current = paused; }, [paused]);

    // Sleep timer — armed from Settings via webtts:sleep-timer-changed; counts
    // down only while actually playing (pause/stop freeze it); ONLY expiry
    // disables it — manual stop/navigation/auto-continue leave it armed.
    const [sleepTimer, setSleepTimer] = useState({ enabled: false, minutes: 15 });
    const [sleepSecondsLeft, setSleepSecondsLeft] = useState(null);
    const { showToast } = useToast();

    useEffect(() => {
        const handleChange = (event) => {
            if (!event.detail) return;
            setSleepTimer(event.detail);
            setSleepSecondsLeft(event.detail.enabled ? Math.round(event.detail.minutes * 60) : null);
        };
        const load = async () => {
            try {
                const saved = await bookStore.getSettings('sleepTimer');
                if (saved && saved.enabled) {
                    setSleepTimer(saved);
                    setSleepSecondsLeft(Math.round((saved.minutes || 15) * 60));
                }
            } catch (error) {
                console.error('Failed to load sleep timer', error);
            }
        };
        load();
        window.addEventListener('webtts:sleep-timer-changed', handleChange);
        return () => window.removeEventListener('webtts:sleep-timer-changed', handleChange);
    }, []);

    // Chapter auto-continue: set when the last sentence of a chapter ends and a
    // next chapter exists; consumed by the post-render effect once its nodes load.
    const autoContinueRef = useRef(false);

    // Prefetch Ref
    const prefetchRef = useRef({ index: -1, promise: null });

    // Auto-scroll dedup ref
    const lastScrolledIndex = useRef(-1);
    const longPressTimer = useRef(null);
    const lastPointerPos = useRef({ x: 0, y: 0 });
    const isLongPress = useRef(false);
    const swipeStart = useRef({ x: 0, y: 0, active: false });
    const isVerticalScroll = useRef(false);
    const SWIPE_THRESHOLD = 50;
    const loadRequestRef = useRef(0);
    const playbackRequestRef = useRef(0);
    const previousTtsConfigRef = useRef(null);
    const resumeOnConfigChangeRef = useRef(false);

    const loadBookmarks = useCallback(async () => {
        const list = await bookStore.getBookmarks(id);
        setBookmarks(list);
    }, [id]);

    const loadChapter = useCallback(async (currentParser, bookInstance, index, jumpToNode = -1) => {
        const requestId = ++loadRequestRef.current;
        setLoading(true);
        setPlaying(false);
        setPaused(false);
        pausedRef.current = false;
        setError(null);
        setCurrentIndex(jumpToNode >= 0 ? jumpToNode : 0);
        setCurrentNodeCount(0);
        currentNodes.current = [];
        lastScrolledIndex.current = -1;
        prefetchRef.current = { index: -1, promise: null };
        resumeOnConfigChangeRef.current = false;
        try {
            const result = await currentParser.getChapterContent(bookInstance, index);
            if (requestId !== loadRequestRef.current) return;

            if (result.kind === 'pdf-page') {
                const cachedOcr = await bookStore.getPdfOcr(id, result.pageIndex - 1);
                if (requestId !== loadRequestRef.current) return;
                const payload = cachedOcr?.text
                    ? {
                        ...result,
                        segments: splitTextIntoSegments(cachedOcr.text),
                        ocrWords: cachedOcr.words || [],
                        empty: false
                    }
                    : result;
                setChapterContent('');
                setNativePdfPayload(payload);
            } else {
                setNativePdfPayload(null);
                const prepared = prepareHtmlContent(result.html || '');
                setChapterContent(prepared.html);
                setLoading(false);
            }
        } catch (e) {
            if (requestId !== loadRequestRef.current) return;
            console.error("Failed to load chapter", e);
            setError("Failed to load chapter.");
            setLoading(false);
        }
    }, [id]);

    const handlePdfOcr = useCallback(async (result, pageIndex) => {
        setNativePdfPayload(current => {
            if (!current || current.pageIndex !== pageIndex + 1) return current;
            return {
                ...current,
                segments: splitTextIntoSegments(result.text),
                ocrWords: result.words,
                empty: false
            };
        });
        try {
            await bookStore.savePdfOcr(id, pageIndex, result);
        } catch (e) {
            console.error('Failed to cache PDF OCR result', e);
        }
    }, [id]);


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

                const bookParser = getParserForFile(metadata.fileName);
                if (!bookParser) {
                    throw new Error(`No parser found for ${metadata.fileName}`);
                }
                setParser(bookParser);

                const parsed = await bookParser.parse(bookData, metadata.fileName);
                setBook(parsed.instance);
                const bookMetadata = metadata.tocVersion === 2 ? metadata : {
                    ...metadata,
                    toc: parsed.toc,
                    tocVersion: 2,
                    totalWords: parsed.toc.reduce((acc, chapter) => acc + (chapter.hidden ? 0 : chapter.words || 0), 0)
                };
                if (bookMetadata !== metadata) {
                    await bookStore.updateBookMeta(id, {
                        toc: bookMetadata.toc,
                        tocVersion: bookMetadata.tocVersion,
                        totalWords: bookMetadata.totalWords
                    });
                }
                setBookMeta(bookMetadata);

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
                await loadBookmarks();

            } catch (err) {
                console.error("Error loading book:", err);
                setError("Failed to load book content.");
                setLoading(false);
            }
        };
        loadBook();
    }, [id, navigate, cfi, searchParams, loadBookmarks, loadChapter]);

    // Save settings when ttsConfig changes
    useEffect(() => {
        bookStore.saveSettings('ttsConfig', ttsConfig);
    }, [ttsConfig]);


    // Post-Render Processing: Find Nodes
    useEffect(() => {
        if (!contentRef.current || loading) return;

        const container = contentRef.current;
        const items = Array.from(container.querySelectorAll('.tts-speakable'))
            .map(node => {
                const segment = getElementSegment(node);
                return segment ? { text: segment.text, node, index: segment.index } : null;
            })
            .filter(Boolean);

        currentNodes.current = items;
        setCurrentNodeCount(items.length);

        // Chapter auto-continue: consume-then-play, exactly once per chapter transition
        // (flag set by playFromIndex at chapter end; nodes for the new chapter are now ready).
        if (autoContinueRef.current && items.length > 0) {
            autoContinueRef.current = false;
            playNextRef.current(0);
        }

        // Bookmark compat: re-segmentation (500-char chunking) shifts
        // .tts-speakable ordinals, so match stored text against the rendered
        // chapter's data-tts-text FIRST (index tiebreak among text-equal
        // elements); nodeIndex is the fallback when no exact text match exists.
        // Accepted limitation: pre-fix bookmarks in a re-segmented chapter that
        // were jumped from another chapter degrade to the nodeIndex fallback
        // (text lookup runs only against the currently rendered chapter DOM).
        const chapterBookmarks = bookmarks.filter(b => parseInt(b.spineIndex, 10) === currentSpineIndex);
        chapterBookmarks.forEach(bookmark => {
            const segment = resolveSegmentByText(container, bookmark.text, parseInt(bookmark.nodeIndex, 10));
            const index = segment ? segment.index : parseInt(bookmark.nodeIndex, 10);
            if (segment || Number.isInteger(index)) setSegmentClass(container, index, 'is-bookmarked', true);
        });

        const rawNodeToJump = searchParams.get('node');
        let nodeToJump = rawNodeToJump === null ? currentIndex : parseInt(rawNodeToJump, 10);
        if (Number.isInteger(nodeToJump) && nodeToJump >= 0 && items.length > 0) {
            // Text-first jump resolution: when the jump target matches a stored
            // bookmark, re-resolve by exact text so re-segmented chapters land
            // on the right sentence (fallback: plain nodeIndex scroll).
            const jumpBookmark = chapterBookmarks.find(b => parseInt(b.nodeIndex, 10) === nodeToJump);
            if (jumpBookmark) {
                const resolved = resolveSegmentByText(container, jumpBookmark.text, nodeToJump);
                if (resolved) nodeToJump = resolved.index;
            }
            const target = items.find(item => item.index === nodeToJump);
            if (target) {
                setTimeout(() => {
                    target.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setSegmentClass(container, nodeToJump, 'tts-active', true);
                    if (!playingRef.current) {
                        // Removal fires 2s later — re-check at fire time so a
                        // play/pause that started meanwhile keeps its highlight
                        // (the DOM may have been rebuilt by a re-render, so
                        // re-assert the active class when playback is live).
                        setTimeout(() => {
                            if (playingRef.current || pausedRef.current) {
                                setSegmentClass(container, currentIndex, 'tts-active', true);
                            } else {
                                setSegmentClass(container, nodeToJump, 'tts-active', false);
                            }
                        }, 2000);
                    }
                }, 100);
            }
        }
    }, [chapterContent, nativePdfPayload, loading, searchParams, bookmarks, currentIndex, currentSpineIndex]);

    // Save progress when spine/node changes
    useEffect(() => {
        if (id && currentSpineIndex >= 0 && currentIndex >= 0) {
            const chapterId = bookMeta?.toc?.[currentSpineIndex]?.id || null;
            bookStore.saveProgress(id, currentSpineIndex, currentIndex, chapterId);
        }
    }, [id, currentSpineIndex, currentIndex, bookMeta]);

    // Re-assert the live highlight after every render: re-renders re-apply
    // dangerouslySetInnerHTML and wipe direct DOM class edits, so the active
    // sentence must be re-marked while playing or paused.
    useEffect(() => {
        if ((playing || paused) && currentIndex >= 0 && contentRef.current) {
            setSegmentClass(contentRef.current, currentIndex, 'tts-active', true);
        }
    });

    const calculateTimeLeft = () => {
        if (!bookMeta?.toc || !ttsConfig.rate) return null;

        let remainingWords = 0;

        // 1. Current chapter remaining
        const currentChapter = bookMeta.toc[currentSpineIndex];
        if (currentChapter && !currentChapter.hidden && currentNodeCount > 0) {
            const progress = (currentIndex + 1) / currentNodeCount;
            remainingWords += currentChapter.words * (1 - progress);
        }

        // 2. Future chapters
        for (let i = currentSpineIndex + 1; i < bookMeta.toc.length; i++) {
            if (!bookMeta.toc[i]?.hidden) remainingWords += (bookMeta.toc[i]?.words || 0);
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
    const goToNextChapter = useCallback(() => {
        if (!book || !parser) return;
        const next = parser.getNextChapter(book, currentSpineIndex);
        if (next !== null) {
            setCurrentSpineIndex(next);
            loadChapter(parser, book, next);
            contentRef.current?.parentElement?.scrollTo(0, 0);
        }
    }, [book, parser, currentSpineIndex, loadChapter]);

    const goToPrevChapter = () => {
        if (!book || !parser) return;
        autoContinueRef.current = false; // manual navigation cancels pending auto-continue
        const prev = parser.getPrevChapter(book, currentSpineIndex);
        if (prev !== null) {
            setCurrentSpineIndex(prev);
            loadChapter(parser, book, prev);
            contentRef.current?.parentElement?.scrollTo(0, 0);
        }
    };

    // TTS Logic
    const stopTTS = useCallback(() => {
        playingRef.current = false;
        pausedRef.current = false;
        setPaused(false);
        resumeOnConfigChangeRef.current = false;
        autoContinueRef.current = false; // manual stop cancels pending auto-continue
        playbackRequestRef.current += 1;
        setPlaying(false);
        const engine = engines[ttsConfig.engineId];
        if (engine) engine.stop();
        contentRef.current?.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
    }, [ttsConfig.engineId]);

    // A Settings voice preview shares this engine singleton — its speak()
    // kills the Player's active one, so reset via the Player-level path.
    // The preview itself stays standalone (Settings never writes Player state).
    useEffect(() => {
        const handlePreviewStarted = () => stopTTS();
        window.addEventListener('webtts:preview-started', handlePreviewStarted);
        return () => window.removeEventListener('webtts:preview-started', handlePreviewStarted);
    }, [stopTTS]);

    // Countdown: 1s tick only while playing and not paused; the interval is
    // torn down on pause/stop but the remaining seconds live in state, so the
    // countdown freezes (and survives navigation/auto-continue).
    const sleepTimerRef = useRef(sleepTimer);
    const sleepSecondsLeftRef = useRef(sleepSecondsLeft);
    useEffect(() => { sleepTimerRef.current = sleepTimer; }, [sleepTimer]);
    useEffect(() => { sleepSecondsLeftRef.current = sleepSecondsLeft; }, [sleepSecondsLeft]);

    // Expiry: stop via the Player-level path (raw engine.stop would leave the
    // playing state stuck), disable + persist, notify. stopTTS also clears
    // autoContinueRef, so a pending chapter auto-continue is cancelled too.
    const handleSleepTimerExpiry = useCallback(() => {
        stopTTS();
        setSleepSecondsLeft(null);
        setSleepTimer(prev => ({ ...prev, enabled: false }));
        bookStore.saveSettings('sleepTimer', { ...sleepTimerRef.current, enabled: false }).catch(error => {
            console.error('Failed to disable sleep timer', error);
            showToast('Could not disable sleep timer.', 'error');
        });
        showToast('Sleep timer finished.', 'info');
    }, [stopTTS, showToast]);

    useEffect(() => {
        if (!sleepTimer.enabled || !playing || paused) return;
        let interval;
        interval = setInterval(() => {
            const current = sleepSecondsLeftRef.current ?? sleepTimer.minutes * 60;
            if (current <= 1) {
                clearInterval(interval);
                setSleepSecondsLeft(0);
                handleSleepTimerExpiry();
            } else {
                setSleepSecondsLeft(current - 1);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [sleepTimer.enabled, sleepTimer.minutes, playing, paused, handleSleepTimerExpiry]);

    const playFromIndex = useCallback(async (index) => {
        const requestId = ++playbackRequestRef.current;
        const currentEngine = engines[ttsConfig.engineId];
        if (currentEngine) currentEngine.stop();
        setPlaying(false);
        playingRef.current = false;
        // Stale-paused guard: EVERY playback-initiation path clears both the
        // React state and the ref — clearing only the ref leaves togglePlay
        // reading a stale paused=true, so pause could never engage again.
        setPaused(false);
        pausedRef.current = false;
        contentRef.current?.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));

        if (index < 0) return;
        if (index >= currentNodes.current.length) {
            // Chapter end: auto-continue to the next chapter, else stop at book end.
            if (parser && book && parser.getNextChapter(book, currentSpineIndex) !== null) {
                autoContinueRef.current = true;
                goToNextChapter();
            } else {
                stopTTS();
            }
            return;
        }
        autoContinueRef.current = false; // user-initiated play of a real sentence cancels any pending auto-continue

        await new Promise(r => setTimeout(r, 50));
        if (requestId !== playbackRequestRef.current) return;

        setCurrentIndex(index);
        setPlaying(true);
        playingRef.current = true;

        const item = currentNodes.current[index];
        if (!item) return;

        setSegmentClass(contentRef.current, index, 'tts-active', true);

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

        const speechEngine = engines[ttsConfig.engineId] || engines.webSpeech;
        if (!speechEngine) return;

        try {
            // Check for prefetch
            let audioObject = null;
            if (prefetchRef.current.index === index && prefetchRef.current.promise) {
                console.log('Resolving prefetch for index:', index);
                audioObject = await new Promise((resolve, reject) => {
                    Promise.resolve(prefetchRef.current.promise).then(resolve, reject);
                });
                if (requestId !== playbackRequestRef.current) return;
                prefetchRef.current = { index: -1, promise: null }; // Consume
            }

            // Trigger NEXT prefetch immediately. Placed after the first await so
            // a pause landing during the 50ms/synthesize window is caught here
            // (an entry-level check would be dead code — entry cleared pausedRef).
            const nextIndex = index + 1;
            if (!pausedRef.current && nextIndex < currentNodes.current.length) {
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

            speechEngine.speak(item.text, {
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
                    if (requestId === playbackRequestRef.current) {
                        showToast(`Playback error: ${e?.message || 'Unknown error'}`, 'error');
                        setPlaying(false);
                    }
                }
            });
        } catch (e) {
            console.error(e);
            setPlaying(false);
        }
    }, [ttsConfig, book, parser, currentSpineIndex, goToNextChapter, stopTTS, showToast]);

    const handleContentClick = useCallback((e) => {
        if (isLongPress.current) {
            isLongPress.current = false;
            return;
        }

        const segment = resolveSegmentTarget(e.target, contentRef.current);
        if (segment) {
            e.stopPropagation();
            engines[ttsConfig.engineId]?.warmAudio?.(); // tap is a gesture — warm audio before the async start
            playFromIndex(segment.index);
        }
    }, [playFromIndex, ttsConfig.engineId]);


    useEffect(() => {
        const previousConfig = previousTtsConfigRef.current;
        previousTtsConfigRef.current = ttsConfig;
        if (!previousConfig) return;

        const configChanged = ['engineId', 'voiceId', 'rate', 'pitch']
            .some(key => previousConfig[key] !== ttsConfig[key]);
        if (!configChanged) return;

        const shouldResume = (playingRef.current || resumeOnConfigChangeRef.current) && !pausedRef.current;
        const resumeIndex = currentIndex;
        resumeOnConfigChangeRef.current = shouldResume;
        playbackRequestRef.current += 1;
        playingRef.current = false;
        pausedRef.current = false;
        setPaused(false); // the old config's session is dead — next click starts fresh, never stale-resumes
        engines[previousConfig.engineId]?.stop();
        setPlaying(false);
        contentRef.current?.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
        prefetchRef.current = { index: -1, promise: null };
        autoContinueRef.current = false; // config change cancels pending auto-continue

        if (shouldResume && resumeIndex >= 0) {
            const resumeConfig = ttsConfig;
            setTimeout(() => {
                if (previousTtsConfigRef.current !== resumeConfig || !resumeOnConfigChangeRef.current) return;
                resumeOnConfigChangeRef.current = false;
                playFromIndex(resumeIndex);
            }, 0);
        }
    }, [ttsConfig, currentIndex, playFromIndex]);
    useEffect(() => () => {
        playbackRequestRef.current += 1;
        playingRef.current = false;
        pausedRef.current = false;
        resumeOnConfigChangeRef.current = false;
        autoContinueRef.current = false;
        engines[previousTtsConfigRef.current?.engineId]?.stop();
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
        prefetchRef.current = { index: -1, promise: null };
    }, []);
    useEffect(() => { playNextRef.current = playFromIndex; }, [playFromIndex]);

    const togglePlay = useCallback(() => {
        const engine = engines[ttsConfig.engineId] || engines.webSpeech;
        if (playing) {
            // Playing → pause: suspend the engine only — NO stopTTS (no gen
            // bump, no highlight clear, no autoContinueRef clear). onEnd cannot
            // fire while suspended, so no advance happens either.
            engine?.pause?.();
            setPaused(true);
            pausedRef.current = true;
            setPlaying(false);
            playingRef.current = false;
        } else if (paused) {
            // Paused → resume: warm the AudioContext synchronously inside this
            // gesture (iOS requires it before async speak resolves), then resume.
            const startIndex = currentIndex >= 0 ? currentIndex : 0;
            const fallback = () => {
                console.log('Engine resume failed — restarting from index', startIndex);
                playFromIndex(startIndex); // also clears paused (stale-paused guard)
            };
            engine?.warmAudio?.();
            try {
                const result = engine?.resume?.();
                if (result && typeof result.catch === 'function') {
                    result.catch(() => { if (pausedRef.current) fallback(); });
                }
                setPaused(false);
                pausedRef.current = false;
                setPlaying(true);
                playingRef.current = true;
            } catch (error) {
                console.error('Engine resume threw — restarting from index', startIndex, error);
                fallback();
            }
        } else {
            // Stopped → start: warm the context in the gesture; playFromIndex
            // awaits setTimeout(50) before speak, so warm-up cannot happen later.
            engine?.warmAudio?.();
            playFromIndex(currentIndex >= 0 ? currentIndex : 0);
        }
    }, [playing, paused, currentIndex, ttsConfig.engineId, playFromIndex]);

    const saveBookmark = useCallback(async (spineIndex, nodeIndex, text) => {
        try {
            const si = parseInt(spineIndex);
            const ni = parseInt(nodeIndex);

            // SAVE PATH: persist the segment's trimmed data-tts-text (never raw
            // textContent) so bookmark text matches data-tts-text exactly.
            const node = contentRef.current?.querySelector(`.tts-speakable[data-tts-index="${ni}"]`);
            const saveText = node?.getAttribute('data-tts-text') || text;

            // DEDUPE: an existing bookmark means the SAME sentence — same spine,
            // same nodeIndex AND same text. A text-only match at a different
            // nodeIndex is a DIFFERENT sentence (duplicate text is common in
            // books) and must NOT dedupe. addBookmark truncates long texts for
            // storage, so also compare against the stored (truncated) form.
            const storedText = (t) => (t.length > 100 ? `${t.substring(0, 100)}...` : t);
            const existing = bookmarks.find(b =>
                parseInt(b.spineIndex) === si &&
                parseInt(b.nodeIndex) === ni &&
                (b.text === saveText || b.text === storedText(saveText))
            );

            if (existing) {
                await bookStore.removeBookmark(id, existing.id);
                setBookmarks(prev => prev.filter(b => b.id !== existing.id));
                const target = currentNodes.current.find(n => n.index === ni);
                if (target) setSegmentClass(contentRef.current, ni, 'is-bookmarked', false);
            } else {
                const chapterId = bookMeta?.toc?.[si]?.id || null;
                const newB = await bookStore.addBookmark(id, si, ni, saveText, chapterId);
                setBookmarks(prev => [...prev, newB]);
                const target = currentNodes.current.find(n => n.index === ni);
                if (target) setSegmentClass(contentRef.current, ni, 'is-bookmarked', true);
            }
        } catch (e) {
            console.error("Failed to toggle bookmark", e);
        }
    }, [id, bookmarks, bookMeta]);

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

        const segment = resolveSegmentTarget(e.target, contentRef.current);
        if (segment) {
            saveBookmark(currentSpineIndex, segment.index, segment.text);
        }
    }, [saveBookmark, currentSpineIndex]);


    const handlePointerDown = useCallback((e) => {
        // Only trigger for primary button (left click / single touch)
        if (e.button !== 0) return;
        isLongPress.current = false;

        // Start swipe tracking
        swipeStart.current = { x: e.clientX, y: e.clientY, active: true };
        isVerticalScroll.current = false;

        const segment = resolveSegmentTarget(e.target, contentRef.current);
        if (!segment) return;

        lastPointerPos.current = { x: e.clientX, y: e.clientY };
        longPressTimer.current = setTimeout(() => {
            isLongPress.current = true;
            if (navigator.vibrate) navigator.vibrate(50);
            saveBookmark(currentSpineIndex, segment.index, segment.text);
            longPressTimer.current = null;
        }, 500);
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

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            const tagName = e.target.tagName;
            if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tagName) || e.target.isContentEditable) return;
            if (e.key === 'Escape') { setShowBookmarks(false); return; }
            if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); playFromIndex(currentIndex + 1); return; }
            if (e.key === 'ArrowLeft') { e.preventDefault(); playFromIndex(currentIndex - 1); return; }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, playFromIndex, togglePlay]);

    // Register the bookmark toggle with the global header
    useEffect(() => {
        registerBookmarks(bookmarks.length, () => setShowBookmarks(prev => !prev));
        return () => clearBookmarks();
    }, [bookmarks.length, registerBookmarks, clearBookmarks]);

    return (
        <div className="player-container" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

            {loading && (
                <div style={{ padding: '2rem', maxWidth: '650px', margin: '0 auto' }}>
                    {[100, 92, 85, 97, 70, 88, 95, 60].map((width, i) => (
                        <Skeleton
                            key={i}
                            width={`${width}%`}
                            height="1rem"
                            style={{ marginBottom: i === 3 ? '2rem' : '0.75rem' }}
                        />
                    ))}
                    {[88, 95, 75, 90, 55, 82].map((width, i) => (
                        <Skeleton
                            key={i + 8}
                            width={`${width}%`}
                            height="1rem"
                            style={{ marginBottom: '0.75rem' }}
                        />
                    ))}
                </div>
            )}
            {error && <div style={{ color: 'var(--danger-text)', padding: '1rem', textAlign: 'center' }}>{error}</div>}

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
                    padding: '1rem 1rem 5rem 1rem',
                    lineHeight: '1.7',
                    fontSize: '1.05rem',
                    touchAction: 'pan-y pinch-zoom',
                    overflowWrap: 'anywhere'
                }}
            >
                <button
                    onClick={goToPrevChapter}
                    disabled={!parser || !book || parser.getPrevChapter(book, currentSpineIndex) === null}
                    style={{
                        display: 'block', width: '100%', padding: '0.75rem 1rem',
                        marginBottom: '1.5rem',
                        background: 'var(--surface-hover)',
                        color: 'var(--text-secondary)',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        transition: 'background 0.15s, opacity 0.15s'
                    }}
                >
                    ← Previous Chapter
                </button>

                {nativePdfPayload ? (
                    <div ref={contentRef} onClick={handleContentClick} style={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                        <PDFPageView
                            key={`${nativePdfPayload.pageIndex}-${nativePdfPayload.ocrWords?.length ? 'ocr' : 'text'}`}
                            pdfData={nativePdfPayload.pdfData}
                            pageIndex={nativePdfPayload.pageIndex}
                            segments={nativePdfPayload.segments}
                            empty={nativePdfPayload.empty}
                            ocrWords={nativePdfPayload.ocrWords}
                            onOcr={handlePdfOcr}
                            onLoaded={() => setLoading(false)}
                        />
                    </div>
                ) : (
                    <div className="reader-html-content" ref={contentRef} onClick={handleContentClick} dangerouslySetInnerHTML={{ __html: chapterContent }} />
                )}

                <button
                    onClick={goToNextChapter}
                    disabled={!parser || !book || parser.getNextChapter(book, currentSpineIndex) === null}
                    style={{
                        display: 'block', width: '100%', padding: '0.75rem 1rem',
                        marginTop: '1.5rem',
                        background: 'var(--surface-hover)',
                        color: 'var(--text-secondary)',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        transition: 'background 0.15s, opacity 0.15s'
                    }}
                >
                    Next Chapter →
                </button>
            </div>

            <BookmarkPanel
                bookmarks={bookmarks}
                currentSpineIndex={currentSpineIndex}
                onNavigate={(spineIndex, nodeIndex) => {
                    // Text-first resolution (bookmark compat): 500-char
                    // re-segmentation shifts .tts-speakable ordinals, so when
                    // the bookmark's chapter is rendered, resolve its stored
                    // text against the DOM (index tiebreak) before navigating.
                    // For bookmarks in another chapter, text lookup runs in the
                    // post-render effect once that chapter's nodes exist.
                    // Accepted limitation: pre-fix bookmarks jumped from another
                    // chapter degrade to the nodeIndex fallback.
                    let targetIndex = nodeIndex;
                    if (parseInt(spineIndex, 10) === currentSpineIndex) {
                        const bookmark = bookmarks.find(b =>
                            parseInt(b.spineIndex, 10) === parseInt(spineIndex, 10) &&
                            parseInt(b.nodeIndex, 10) === parseInt(nodeIndex, 10)
                        );
                        const resolved = bookmark
                            ? resolveSegmentByText(contentRef.current, bookmark.text, parseInt(bookmark.nodeIndex, 10))
                            : null;
                        if (resolved) targetIndex = resolved.index;
                    }
                    navigate(`/book/${id}/read/${spineIndex}?node=${targetIndex}`);
                    setShowBookmarks(false);
                }}
                onDelete={async (bookmarkId) => {
                    await bookStore.removeBookmark(id, bookmarkId);
                    setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
                }}
                isOpen={showBookmarks}
                onClose={() => setShowBookmarks(false)}
            />

            <div className="reader-controls-shell" style={{
                flexShrink: 0,
                background: 'var(--bg-primary)',
                borderTop: '1px solid var(--border-color)',
                padding: '0.5rem',
                position: 'relative'
            }}>
                {(engineStatus?.phase === 'loading' || engineStatus?.phase === 'downloading') && (
                    <div role="status" aria-live="polite" style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.25rem 0.5rem 0.5rem',
                        fontSize: '0.75rem', color: 'var(--text-secondary)'
                    }}>
                        <span style={{ flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {engineStatus.message}
                        </span>
                        <div style={{
                            flex: 1, minWidth: '80px', height: '6px', borderRadius: '3px',
                            background: 'var(--bg-secondary)', overflow: 'hidden'
                        }}>
                            {engineStatus.progress != null ? (
                                <div style={{
                                    height: '100%', width: `${Math.round(engineStatus.progress * 100)}%`,
                                    background: 'var(--accent-color)', transition: 'width 0.2s ease'
                                }} />
                            ) : (
                                <div className="tts-status-shimmer" style={{ height: '100%', width: '100%' }} />
                            )}
                        </div>
                    </div>
                )}
                <Controls
                    playing={playing}
                    onPlayPause={togglePlay}
                    onNext={() => playFromIndex(currentIndex + 1)}
                    onPrev={() => playFromIndex(currentIndex - 1)}
                    timeLeft={timeLeft}
                    canPrev={currentIndex > 0}
                    canNext={currentIndex >= 0 && currentIndex < currentNodeCount - 1}
                />
                {sleepTimer.enabled && (
                    <div className="sleep-timer-chip" style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '0.4rem',
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '999px',
                        padding: '0.15rem 0.6rem'
                    }}>
                        <Clock size={13} /> zzz {formatSleepTime(sleepSecondsLeft ?? sleepTimer.minutes * 60)}
                    </div>
                )}
            </div>

            <style>{`
            .tts-speakable { 
                cursor: pointer; 
                position: relative; 
                user-select: none;
                -webkit-tap-highlight-color: transparent;
                -webkit-touch-callout: none;
                padding: 0.15rem 0.3rem;
                margin: 0 -0.3rem;
                border-radius: 4px;
                transition: background 0.15s;
            }
            .tts-speakable:hover { background: var(--surface-hover); }
            .is-bookmarked::before {
                content: '🔖';
                position: absolute;
                left: -1.5rem;
                top: 0;
                font-size: 0.75rem;
                opacity: 0.7;
                pointer-events: none;
            }
            .tts-active { 
                background-color: rgba(255, 235, 59, 0.85) !important;
                color: #1a1a1a !important;
                border-radius: 4px; 
                outline: 2px solid #eab308 !important;
                outline-offset: 1px;
                box-shadow: 0 2px 8px rgba(234, 179, 8, 0.3);
                transition: background 0.1s, outline 0.1s;
            }
            [data-theme='dark'] .tts-active { 
                background-color: rgba(255, 235, 59, 0.75) !important;
                color: #1a1a1a !important;
                outline-color: #facc15 !important;
            }
            .tts-status-shimmer {
                background: linear-gradient(90deg, var(--accent-color) 0%, var(--bg-secondary) 50%, var(--accent-color) 100%);
                background-size: 200% 100%;
                animation: tts-status-shimmer 1.4s linear infinite;
            }
            @keyframes tts-status-shimmer {
                from { background-position: 200% 0; }
                to { background-position: -200% 0; }
            }
            img { max-width: 100%; height: auto; display: block; margin: 1rem auto; }
          `}</style>
        </div>
    );
}
