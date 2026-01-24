import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { Upload, Book, Trash2, FileText, Clock } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';

export function Home() {
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [books, setBooks] = useState([]);
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pastedText, setPastedText] = useState("");
    const [pastedTitle, setPastedTitle] = useState("");
    const [ttsRate, setTtsRate] = useState(1.0);

    const refreshBooks = async () => {
        const list = await bookStore.getBooks();
        setBooks(list);
    };

    const [supportedExts, setSupportedExts] = useState(['epub']);

    useEffect(() => {
        refreshBooks();
        // Get supported extensions from store (which gets them from parsers)
        const exts = bookStore.getSupportedExtensions();
        setSupportedExts(exts);

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

        const { spineIndex, nodeIndex } = book.lastProgress;
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

    const handleFile = async (file) => {
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        // Check if extension is supported
        if (!supportedExts.includes(ext) && !file.type.includes('epub')) { // Keep epub type check as fallback
            alert(`Please select a supported file (${supportedExts.join(', ')}).`);
            return;
        }

        setLoading(true);
        try {
            const buffer = await file.arrayBuffer();
            const id = await bookStore.addBook(buffer, file.name);
            navigate(`/book/${id}/toc`);
        } catch (err) {
            console.error(err);
            alert('Failed to load book');
            setLoading(false);
        }
    };

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
            alert('Failed to save pasted text');
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
    }, []);

    const onDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true); }, []);
    const onDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);

    const onBrowse = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    return (
        <div className="home-container" style={{ maxWidth: '800px', margin: '2rem auto', padding: '1rem' }}>
            <header style={{ marginBottom: '3rem', textAlign: 'center' }}>
                <h2>WebTTS <ThemeToggle /></h2>
            </header>

            {/* Book Grid */}
            <div className="book-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '2rem',
                marginBottom: '3rem'
            }}>
                {books.map(book => (
                    <div
                        key={book.id}
                        onClick={() => navigate(`/book/${book.id}/toc`)}
                        style={{
                            background: 'var(--bg-secondary, rgba(0,0,0,0.05))',
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
                            border: '1px solid rgba(128,128,128,0.1)',
                            transition: 'all 0.2s',
                            overflow: 'hidden'
                        }}
                        className="book-card"
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
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                }}
                            />
                        ) : (
                            <div style={{
                                height: '65%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%',
                                background: 'rgba(0,0,0,0.03)',
                                borderRadius: '8px',
                                marginBottom: '0.75rem'
                            }}>
                                <Book size={48} style={{ opacity: 0.1 }} />
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
                                color: 'var(--accent-color, #3B82F6)',
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
                            style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                background: 'transparent',
                                color: 'red',
                                opacity: 0.5,
                                padding: '4px'
                            }}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
                {/* Upload Zone */}
                <div
                    className="drop-zone"
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onClick={() => document.getElementById('file-input').click()}
                    style={{
                        flex: 1,
                        border: `2px dashed ${isDragging ? 'var(--accent-color)' : 'rgba(128,128,128,0.3)'}`,
                        borderColor: isDragging ? 'var(--accent-color)' : 'rgba(128,128,128,0.3)',
                        borderRadius: '8px',
                        padding: '2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: isDragging ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                        transition: 'all 0.2s'
                    }}
                >
                    <Upload size={32} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>{loading ? 'Processing...' : `Add a book (${supportedExts.join(', ').toUpperCase()})`}</p>
                    <input
                        type="file"
                        id="file-input"
                        accept={supportedExts.map(e => `.${e}`).join(',')}
                        style={{ display: 'none' }}
                        onChange={onBrowse}
                    />
                </div>

                {/* Paste Zone */}
                <div
                    onClick={() => setShowPasteModal(true)}
                    style={{
                        flex: 1,
                        border: '2px dashed rgba(128,128,128,0.3)',
                        borderRadius: '8px',
                        padding: '2rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    className="paste-zone"
                >
                    <Upload size={32} style={{ marginBottom: '1rem', opacity: 0.5, transform: 'rotate(180deg)' }} />
                    <p style={{ margin: 0 }}>Paste Text</p>
                </div>
            </div>

            {/* Paste Modal */}
            {showPasteModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', zIndex: 1000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        background: 'var(--bg-primary, #fff)',
                        width: '100%', maxWidth: '600px',
                        padding: '2rem', borderRadius: '12px',
                        display: 'flex', flexDirection: 'column', gap: '1rem'
                    }}>
                        <h3 style={{ margin: 0 }}>Paste Text Content</h3>
                        <input
                            type="text"
                            placeholder="Title (optional)"
                            value={pastedTitle}
                            onChange={(e) => setPastedTitle(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px' }}
                        />
                        <textarea
                            placeholder="Paste your text here..."
                            value={pastedText}
                            onChange={(e) => setPastedText(e.target.value)}
                            style={{
                                width: '100%', height: '300px',
                                padding: '0.5rem', borderRadius: '4px',
                                fontFamily: 'inherit'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowPasteModal(false)}
                                style={{ background: 'transparent', padding: '0.5rem 1rem' }}
                            >Cancel</button>
                            <button
                                onClick={handlePaste}
                                disabled={!pastedText.trim() || loading}
                                style={{
                                    background: 'var(--accent-color, #3B82F6)',
                                    color: '#fff', padding: '0.5rem 1.5rem',
                                    borderRadius: '4px'
                                }}
                            >Save & Read</button>
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
