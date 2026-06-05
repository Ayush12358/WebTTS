import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { isSupportedFile } from '../core/parsers';
import { canStoreBook } from '../core/quotaManager';
import { Upload, Book, Trash2, FileText, Clock } from 'lucide-react';
import { useToast } from './components/Toast';
import { Skeleton } from './components/Skeleton';

const SUPPORTED_EXTENSIONS = bookStore.getSupportedExtensions();

export function Home() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [books, setBooks] = useState([]);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pastedText, setPastedText] = useState("");
    const [pastedTitle, setPastedTitle] = useState("");
    const [ttsRate, setTtsRate] = useState(1.0);

    const refreshBooks = async () => {
        const list = await bookStore.getBooks();
        setBooks(list);
        setInitialLoading(false);
    };

    useEffect(() => {
        const loadBooks = async () => {
            const list = await bookStore.getBooks();
            setBooks(list);
            setInitialLoading(false);
        };
        loadBooks();

        const loadSettings = async () => {
            const settings = await bookStore.getSettings('ttsConfig');
            if (settings?.rate) setTtsRate(settings.rate);
        };
        loadSettings();
    }, []);

    const getReadingTime = (words, rate = null) => {
        if (!words) return null;
        const currentRate = rate || ttsRate;
        const wpm = 200 * currentRate;
        const totalMins = Math.ceil(words / wpm);

        if (totalMins >= 60) {
            const hours = Math.floor(totalMins / 60);
            const mins = totalMins % 60;
            return `${hours}h ${mins}m read`;
        }
        return `${totalMins} min read`;
    };

    const getRemainingTime = (book) => {
        if (!book.toc || !book.lastProgress) return null;

        const { spineIndex } = book.lastProgress;
        let remainingWords = 0;

        // Current chapter partial (estimation since we don't know total nodes here)
        // We'll just assume half the chapter is read if there is progress, 
        // OR better, we just skip current and count future + current total/2
        const currentChapter = book.toc[spineIndex];
        if (currentChapter) {
            // Estimate remaining in current chapter as 50% if we don't have node count
            // Actually, for Home view, a simpler estimate is fine.
            remainingWords += (currentChapter.words || 0) * 0.5;
        }

        for (let i = spineIndex + 1; i < book.toc.length; i++) {
            remainingWords += (book.toc[i].words || 0);
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

    const handleFile = useCallback(async (file) => {
        if (!file) return;

        if (!isSupportedFile(file.name, file.type)) {
            showToast(`Please select a supported file (${SUPPORTED_EXTENSIONS.join(', ')}).`, 'warning');
            return;
        }

        setLoading(true);
        try {
            // Pre-flight quota check
            const quotaCheck = await canStoreBook(file.size);
            if (quotaCheck.reason) {
                showToast(quotaCheck.reason, quotaCheck.ok ? 'warning' : 'error');
            }
            if (!quotaCheck.ok) {
                setLoading(false);
                return;
            }

            const buffer = await file.arrayBuffer();
            const id = await bookStore.addBook(buffer, file.name, file.type);
            navigate(`/book/${id}/toc`);
        } catch (err) {
            console.error(err);
            if (err.isQuotaError) {
                showToast('Storage is full! Delete unused books to make space.', 'error');
            } else {
                showToast('Failed to load book. The file may be corrupted.', 'error');
            }
            setLoading(false);
        }
    }, [navigate, showToast]);

    const handlePaste = async () => {
        if (!pastedText.trim()) return;
        setLoading(true);
        try {
            const fileName = (pastedTitle.trim() || "Pasted Text") + ".txt";
            const encoder = new TextEncoder();
            const buffer = encoder.encode(pastedText).buffer;
            const id = await bookStore.addBook(buffer, fileName);
            setShowPasteModal(false);
            setPastedText("");
            setPastedTitle("");
            navigate(`/book/${id}/toc`);
        } catch (err) {
            console.error(err);
            if (err.isQuotaError) {
                showToast('Storage is full! Delete unused books to make space.', 'error');
            } else {
                showToast('Failed to save pasted text.', 'error');
            }
            setLoading(false);
        }
    };

    const deleteBook = async (e, id) => {
        e.stopPropagation();
        if (window.confirm("Delete this book?")) {
            await bookStore.removeBook(id);
            refreshBooks();
        }
    };

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, [handleFile]);

    const onDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const onDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);

    const onBrowse = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    return (
        <div className="home-container" style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
            {/* Book Grid */}
            <div className="book-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '2rem',
                marginBottom: '3rem'
            }}>
                {initialLoading ? (
                    Array.from({ length: 4 }, (_, i) => (
                        <div key={i} style={{
                            background: 'var(--bg-secondary, rgba(0,0,0,0.05))',
                            borderRadius: '12px',
                            padding: '0.75rem',
                            aspectRatio: '0.7',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start',
                            alignItems: 'center'
                        }}>
                            <Skeleton height="130px" style={{ marginBottom: '0.75rem', borderRadius: '8px' }} />
                            <Skeleton width="80%" height="0.9rem" style={{ marginBottom: '0.4rem' }} />
                            <Skeleton width="60%" height="0.75rem" style={{ marginBottom: '0.75rem' }} />
                            <Skeleton width="100px" height="0.75rem" />
                        </div>
                    ))
                ) : (
                    books.map(book => (
                    <div
                        key={book.id}
                        onClick={() => navigate(`/book/${book.id}/toc`)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open ${book.title || 'book'}`}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/book/${book.id}/toc`); } }}
                        className="interactive-card"
                        style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '12px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            position: 'relative',
                            aspectRatio: '0.7',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-start',
                            alignItems: 'center',
                            textAlign: 'center',
                            border: '1px solid var(--border-color)',
                            overflow: 'hidden',
                            boxShadow: '0 1px 3px var(--shadow-color)'
                        }}
                    >
                        {book.cover ? (
                            <img
                                src={book.cover}
                                alt={book.title}
                                style={{
                                    width: '100%',
                                    height: '65%',
                                    objectFit: 'cover',
                                    borderRadius: '8px',
                                    marginBottom: '0.75rem',
                                    boxShadow: '0 2px 8px var(--shadow-color)'
                                }}
                            />
                        ) : (
                            <div style={{
                                height: '65%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                background: 'var(--surface-hover)',
                                borderRadius: '8px',
                                marginBottom: '0.75rem'
                            }}>
                                <Book size={48} style={{ opacity: 0.15, color: 'var(--text-secondary)' }} />
                            </div>
                        )}
                        <h4 style={{
                            margin: '0 0 0.25rem 0',
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                        }}>{book.title || 'Unknown Title'}</h4>
                        <p style={{
                            margin: 0,
                            fontSize: '0.75rem',
                            opacity: 0.6,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            width: '90%'
                        }}>{book.author || 'Unknown Author'}</p>

                        {(book.totalWords || (book.toc && book.toc.reduce((a, c) => a + (c.words || 0), 0))) > 0 && (
                            <div style={{
                                marginTop: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                color: 'var(--accent-color)',
                                fontWeight: '500',
                                fontSize: '0.75rem'
                            }}>
                                <Clock size={14} />
                                {getReadingTime(book.totalWords || book.toc.reduce((a, c) => a + (c.words || 0), 0))}
                            </div>
                        )}

                        {book.lastProgress && (
                            <div style={{
                                marginTop: '0.25rem',
                                fontSize: '0.7rem',
                                opacity: 0.4,
                                fontStyle: 'italic'
                            }}>
                                {getRemainingTime(book)}
                            </div>
                        )}

                        <button
                            onClick={(e) => deleteBook(e, book.id)}
                            className="icon-btn"
                            aria-label={`Delete ${book.title || 'book'}`}
                            style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                color: 'var(--danger-text)',
                                opacity: 0.6,
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
                {/* Upload Zone */}
                <div
                    className="drop-zone interactive-card"
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => document.getElementById('file-input').click()}
                    tabIndex={0}
                    role="button"
                    aria-label="Upload a book file"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('file-input').click(); }}
                    style={{
                        flex: 1,
                        border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'var(--border-color)'}`,
                        borderRadius: '12px',
                        padding: '2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragging ? 'rgba(59, 130, 246, 0.06)' : 'var(--bg-secondary)',
                        transition: 'border-color 0.2s, background 0.2s'
                    }}
                >
                    <Upload size={32} style={{ marginBottom: '0.75rem', opacity: 0.4, color: 'var(--text-secondary)' }} />
                    <div style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <Skeleton width="16px" height="16px" style={{ borderRadius: '50%', display: 'inline-block', marginBottom: 0 }} />
                                Processing...
                            </span>
                        ) : (
                            `Add a book (${SUPPORTED_EXTENSIONS.join(', ').toUpperCase()})`
                        )}
                    </div>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', opacity: 0.5 }}>or drag and drop</p>
                    <input
                        type="file"
                        id="file-input"
                        accept={SUPPORTED_EXTENSIONS.map(e => `.${e}`).join(',')}
                        style={{ display: 'none' }}
                        onChange={onBrowse}
                    />
                </div>

                {/* Paste Zone */}
                <div
                    onClick={() => setShowPasteModal(true)}
                    tabIndex={0}
                    role="button"
                    aria-label="Paste text content"
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowPasteModal(true); }}
                    className="interactive-card"
                    style={{
                        flex: 1,
                        border: '2px dashed var(--border-color)',
                        borderRadius: '12px',
                        padding: '2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-secondary)',
                        transition: 'border-color 0.2s, background 0.2s'
                    }}
                >
                    <FileText size={32} style={{ marginBottom: '0.75rem', opacity: 0.4, color: 'var(--text-secondary)' }} />
                    <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500 }}>Paste Text</p>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', opacity: 0.5 }}>create a book from clipboard</p>
                </div>
            </div>

            {/* Paste Modal */}
            {showPasteModal && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setShowPasteModal(false); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setShowPasteModal(false); }}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 1000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '1rem',
                        animation: 'toast-slide-in 0.2s ease-out'
                    }}>
                    <div style={{
                        background: 'var(--bg-primary)',
                        width: '100%', maxWidth: '520px',
                        padding: '2rem', borderRadius: '16px',
                        display: 'flex', flexDirection: 'column', gap: '1rem',
                        boxShadow: '0 16px 48px var(--shadow-lg)'
                    }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Paste Text Content</h3>
                        <input
                            type="text"
                            placeholder="Title (optional)"
                            value={pastedTitle}
                            onChange={(e) => setPastedTitle(e.target.value)}
                        />
                        <textarea
                            placeholder="Paste your text here..."
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            style={{
                                width: '100%', height: '250px',
                                resize: 'vertical'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowPasteModal(false)}
                                className="icon-btn"
                                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '0.5rem 1.25rem', minWidth: 'auto', minHeight: 'auto' }}
                            >Cancel</button>
                            <button
                                onClick={handlePaste}
                                disabled={!pastedText.trim() || loading}
                            >Save &amp; Read</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Credits Footer */}
            <footer style={{
                marginTop: '3rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid rgba(128,128,128,0.2)',
                textAlign: 'center',
                fontSize: '0.85rem',
                opacity: 0.7
            }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                    Created by <strong>Ayush Maurya</strong>
                </p>
                <p style={{ margin: 0 }}>
                    Licensed under <a
                        href="https://www.apache.org/licenses/LICENSE-2.0"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent-color, #3B82F6)' }}
                    >Apache 2.0</a>
                </p>
            </footer>
        </div>
    );
}
