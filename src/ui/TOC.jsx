import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { getParserForFile } from '../core/parsers';
import { ArrowLeft, BookOpen, Clock, Bookmark, Trash2 } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';
import { Skeleton } from './components/Skeleton';

export function TOC() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [meta, setMeta] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [bookmarks, setBookmarks] = useState([]);
    const [loading, setLoading] = useState(true);
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
                const hasWords = metadata.toc && metadata.toc.length > 0 && metadata.toc[0].words > 0;

                if (metadata.toc && hasWords) {
                    setChapters(metadata.toc);
                    setLoading(false);
                    return;
                }

                // Fallback for older books or missing word counts: Need to parse it to get TOC with words
                const data = await bookStore.getBookData(id);
                const parser = getParserForFile(metadata.fileName);
                if (parser) {
                    const parsed = await parser.parse(data, metadata.fileName);
                    setChapters(parsed.toc);
                    // Update metadata with the new TOC (including words) for next time
                    await bookStore.updateBookMeta(id, { toc: parsed.toc });
                }

                setLoading(false);
            } catch (err) {
                console.error("TOC Load Error:", err);
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
        if (currentChapter) {
            remainingWords += (currentChapter.words || 0) * 0.5;
        }

        for (let i = spineIndex + 1; i < metadata.toc.length; i++) {
            remainingWords += (metadata.toc[i].words || 0);
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

    const totalWords = chapters.reduce((acc, curr) => acc + (curr.words || 0), 0);
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
                {Array.from({ length: 6 }, (_, i) => (
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
                            <Skeleton width={`${50 + Math.random() * 30}%`} height="1rem" style={{ marginBottom: '0.35rem' }} />
                            <Skeleton width={`${20 + Math.random() * 20}%`} height="0.75rem" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
    if (!meta) return <div style={{ padding: '2rem', textAlign: 'center' }}>Book not found.</div>;

    return (
        <div className="toc-container" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            <nav style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                    <ArrowLeft size={20} />
                    Library
                </Link>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <ThemeToggle />
                </div>
            </nav>

            <div className="book-header" style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(128,128,128,0.2)', paddingBottom: '1rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0' }}>{meta.title}</h1>
                <p style={{ margin: 0, opacity: 0.7 }}>{meta.author}</p>
                {totalTime && (
                    <div style={{
                        marginTop: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: 'var(--accent-color, #3B82F6)',
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
                        color: 'var(--accent-color, #3B82F6)',
                        opacity: 0.6,
                        fontSize: '0.8rem',
                        fontStyle: 'italic'
                    }}>
                        Remaining: {timeLeft}
                    </div>
                )}
            </div>

            <div className="chapter-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h3 style={{ marginBottom: '1rem' }}>Contents</h3>
                {chapters.length === 0 ? (
                    <div style={{ padding: '1rem', opacity: 0.7, border: '1px dashed rgba(128,128,128,0.3)', borderRadius: '8px' }}>
                        No table of contents found.
                    </div>
                ) : (
                    chapters.map((chapter, index) => (
                        <div
                            key={index}
                            onClick={() => navigate(`/book/${id}/read/${index}`)}
                            className="chapter-item"
                            style={{
                                padding: '1rem',
                                border: '1px solid rgba(128,128,128,0.1)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                transition: 'background 0.2s',
                                position: 'relative'
                            }}
                        >
                            <span style={{ opacity: 0.5, fontSize: '0.8rem', minWidth: '24px' }}>{index + 1}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>{chapter.title || chapter.label || `Chapter ${index + 1}`}</div>
                                {chapter.words > 0 && (
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--accent-color, #3B82F6)',
                                        opacity: 0.8,
                                        marginTop: '4px'
                                    }}>
                                        {getReadingTime(chapter.words)}
                                    </div>
                                )}
                            </div>
                            {bookmarks.some(b => parseInt(b.spineIndex) === index) && (
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
                            style={{
                                padding: '1rem',
                                border: '1px solid rgba(128,128,128,0.1)',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                position: 'relative'
                            }}
                        >
                            <div style={{ flex: 1 }}>
                                <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', fontStyle: 'italic', opacity: 0.8 }}>
                                    "{b.text}"
                                </p>
                                <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                                    Chapter {b.spineIndex + 1} • {new Date(b.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                            <button
                                onClick={(e) => deleteBookmark(e, b.id)}
                                style={{ background: 'transparent', color: 'red', opacity: 0.5 }}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
