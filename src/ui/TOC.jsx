import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { getParserForFile } from '../core/parsers';
import { Clock, Bookmark, Trash2 } from 'lucide-react';
import { Skeleton } from './components/Skeleton';

const SKELETON_ROWS = [
    { titleWidth: '72%', metaWidth: '34%' },
    { titleWidth: '61%', metaWidth: '28%' },
    { titleWidth: '78%', metaWidth: '39%' },
    { titleWidth: '55%', metaWidth: '24%' },
    { titleWidth: '68%', metaWidth: '31%' },
    { titleWidth: '74%', metaWidth: '36%' }
];

export function TOC() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [meta, setMeta] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [ttsRate, setTtsRate] = useState(1.0);

    useEffect(() => {
        const loadData = async () => {
            try {
                const metadata = await bookStore.getBookMeta(id);
                if (!metadata) {
                    navigate('/');
                    return;
                }
                setMeta(metadata);

                // Use the TOC stored in metadata if available
                // But check if it has reading time (words)
                const hasWords = metadata.toc?.some(chapter => chapter?.words > 0);

                if (metadata.tocVersion === 2 && metadata.toc && hasWords) {
                    setChapters(metadata.toc);
                    setLoading(false);
                    return;
                }

                // Fallback for older books or missing word counts: Need to parse it to get TOC with words
                const data = await bookStore.getBookData(id);
                const parser = getParserForFile(metadata.fileName);
                if (parser) {
                    const parsed = await parser.parse(data, metadata.fileName);
                    const refreshedMetadata = {
                        ...metadata,
                        toc: parsed.toc,
                        tocVersion: 2,
                        totalWords: parsed.toc.reduce((acc, chapter) => acc + (chapter.hidden ? 0 : chapter.words || 0), 0)
                    };
                    setMeta(refreshedMetadata);
                    setChapters(parsed.toc);
                    await bookStore.updateBookMeta(id, {
                        toc: parsed.toc,
                        tocVersion: 2,
                        totalWords: refreshedMetadata.totalWords
                    });
                }

                setLoading(false);
            } catch (err) {
                console.error("TOC Load Error:", err);
                setLoadError('Could not load this book.');
                setLoading(false);
            }
        };

        const loadBookmarks = async () => {
            const list = await bookStore.getBookmarks(id);
            setBookmarks(list);
        };

        const loadSettings = async () => {
            const settings = await bookStore.getSettings('ttsConfig');
            if (settings?.rate) setTtsRate(settings.rate);
        };

        loadData();
        loadBookmarks();
        loadSettings();
    }, [id, navigate]);

    const getReadingTime = (words) => {
        if (!words) return null;
        const wpm = 200 * ttsRate;
        const totalMins = Math.ceil(words / wpm);

        if (totalMins >= 60) {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            return `${hours}h ${mins}m read`;
        }
        return `${totalMins} min read`;
    };

    const getRemainingTime = (metadata) => {
        if (!metadata.toc || !metadata.lastProgress) return null;

        const { spineIndex } = metadata.lastProgress;
        let remainingWords = 0;

        // Current chapter partial (estimation)
        const currentChapter = metadata.toc[spineIndex];
        if (currentChapter && !currentChapter.hidden) {
            remainingWords += (currentChapter.words || 0) * 0.5;
        }

        for (let i = spineIndex + 1; i < metadata.toc.length; i++) {
            if (!metadata.toc[i]?.hidden) remainingWords += (metadata.toc[i]?.words || 0);
        }

        const wpm = 200 * ttsRate;
        const totalMins = Math.ceil(remainingWords / wpm);

        if (totalMins <= 0) return 'Finished';

        if (totalMins >= 60) {
            const h = Math.floor(totalMins / 60);
            const m = totalMins % 60;
            return `${h}h ${m}m left`;
        }
        return `${totalMins}m left`;
    };

    const totalWords = chapters.reduce((acc, curr) => acc + (curr.hidden ? 0 : curr.words || 0), 0);
    const totalTime = getReadingTime(totalWords);
    const timeLeft = meta ? getRemainingTime(meta) : null;

    const deleteBookmark = async (e, bookmarkId) => {
        e.stopPropagation();
        await bookStore.removeBookmark(id, bookmarkId);
        setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    };

    if (loading) return (
        <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <Skeleton width="120px" height="1.2rem" style={{ marginBottom: '2rem' }} />
            <Skeleton width="60%" height="2rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="40%" height="1rem" style={{ marginBottom: '0.5rem' }} />
            <Skeleton width="150px" height="1rem" style={{ marginBottom: '2rem' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {SKELETON_ROWS.map((row, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1rem',
                        border: '1px solid rgba(128,128,128,0.1)',
                        borderRadius: '8px'
                    }}>
                        <Skeleton width="24px" height="24px" style={{ borderRadius: '50%', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <Skeleton width={row.titleWidth} height="1rem" style={{ marginBottom: '0.35rem' }} />
                            <Skeleton width={row.metaWidth} height="0.75rem" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
    if (loadError) return (
        <div role="alert" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
            <p>{loadError}</p>
            <button onClick={() => navigate(0)}>Retry</button>
        </div>
    );
    if (!meta) return <div style={{ padding: '2rem', textAlign: 'center' }}>Book not found.</div>;

    const visibleChapters = chapters
        .map((chapter, spineIndex) => ({ chapter, spineIndex }))
        .filter(({ chapter }) => !chapter.hidden);
    return (
        <div className="toc-container" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>

            <div className="book-header" style={{ marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0' }}>{meta.title}</h1>
                <p style={{ margin: 0, opacity: 0.7 }}>{meta.author}</p>
                {totalTime && (
                    <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--accent-color)',
                        fontWeight: '500',
                        fontSize: '0.9rem'
                    }}>
                        <Clock size={16} /> Total: {totalTime}
                    </div>
                )}
                {timeLeft && (
                    <div style={{
                        marginTop: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--accent-color)',
                        opacity: 0.7,
                        fontSize: '0.8rem',
                        fontStyle: 'italic'
                    }}>
                        Remaining: {timeLeft}
                    </div>
                )}
            </div>

            <div className="chapter-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Contents</h3>
                {visibleChapters.length === 0 ? (
                    <div style={{
                        padding: '2rem 1rem',
                        textAlign: 'center',
                        color: 'var(--text-secondary)',
                        border: '1px dashed var(--border-color)',
                        borderRadius: '12px',
                        fontSize: '0.9rem'
                    }}>
                        No table of contents found.
                    </div>
                ) : (
                    visibleChapters.map(({ chapter, spineIndex }, index) => (
                        <div
                            key={spineIndex}
                            onClick={() => navigate(`/book/${id}/read/${spineIndex}`)}
                            tabIndex={0}
                            role="button"
                            aria-label={`Chapter ${index + 1}: ${chapter.title || ''}`}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/book/${id}/read/${spineIndex}`); } }}
                            className="interactive-card chapter-item"
                            style={{
                                padding: '0.9rem 1rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                position: 'relative'
                            }}
                        >
                            <span className="chapter-index" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', minWidth: '24px', textAlign: 'center' }}>{index + 1}</span>
                            <div className="chapter-main" style={{ flex: 1 }}>
                                <div className="chapter-title" style={{ fontWeight: 500, fontSize: '0.9rem' }}>{chapter.title || chapter.label || `Chapter ${index + 1}`}</div>
                                {chapter.words > 0 && (
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--accent-color)',
                                        opacity: 0.8,
                                        marginTop: '2px'
                                    }}>
                                        {getReadingTime(chapter.words)}
                                    </div>
                                )}
                            </div>
                            {bookmarks.some(b => parseInt(b.spineIndex) === spineIndex) && (
                                <Bookmark size={14} style={{ color: 'var(--accent-color)', opacity: 0.8 }} />
                            )}
                        </div>
                    ))
                )}
            </div>

            {bookmarks.length > 0 && (
                <div className="bookmark-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '3rem' }}>
                    <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Bookmark size={20} /> Bookmarks
                    </h3>
                    {bookmarks.map((b) => (
                        <div
                            key={b.id}
                            onClick={() => navigate(`/book/${id}/read/${b.spineIndex}?node=${b.nodeIndex}`)}
                            tabIndex={0}
                            role="button"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); navigate(`/book/${id}/read/${b.spineIndex}?node=${b.nodeIndex}`); } }}
                            className="interactive-card toc-bookmark-item"
                            style={{
                                padding: '0.9rem 1rem',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                                position: 'relative'
                            }}
                        >
                            <div className="toc-bookmark-main" style={{ flex: 1 }}>
                                <p className="toc-bookmark-text" style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--text-primary)', opacity: 0.85 }}>
                                    "{b.text}"
                                </p>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                    Chapter {b.spineIndex + 1} • {new Date(b.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                            <button
                                onClick={(e) => deleteBookmark(e, b.id)}
                                className="icon-btn"
                                aria-label="Delete bookmark"
                                style={{ color: 'var(--danger-text)', opacity: 0.6, flexShrink: 0 }}
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
