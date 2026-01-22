import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { Upload, Book, Trash2 } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';

export function Home() {
    const navigate = useNavigate();
    const [isDragging, setIsDragging] = useState(false);
    const [loading, setLoading] = useState(false);
    const [books, setBooks] = useState([]);

    const refreshBooks = async () => {
        const list = await bookStore.getBooks();
        setBooks(list);
    };

    useEffect(() => {
        refreshBooks();
    }, []);

    const handleFile = async (file) => {
        if (!file || (!file.type.includes('epub') && !file.name.endsWith('.epub'))) {
            alert('Please select an EPUB file.');
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
                            borderRadius: '8px',
                            padding: '1rem',
                            cursor: 'pointer',
                            position: 'relative',
                            aspectRatio: '0.7',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            textAlign: 'center',
                            border: '1px solid transparent',
                            transition: 'all 0.2s'
                        }}
                        className="book-card"
                    >
                        <Book size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{book.title || 'Unknown Title'}</h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.7 }}>{book.author || 'Unknown Author'}</p>

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

            {/* Upload Zone */}
            <div
                className="drop-zone"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => document.getElementById('file-input').click()}
                style={{
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
                <p style={{ margin: 0 }}>{loading ? 'Processing...' : 'Add a new book (EPUB)'}</p>
                <input
                    type="file"
                    id="file-input"
                    accept=".epub"
                    style={{ display: 'none' }}
                    onChange={onBrowse}
                />
            </div>
        </div>
    );
}
