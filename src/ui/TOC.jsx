import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { ArrowLeft, BookOpen, Clock } from 'lucide-react';
import { ThemeToggle } from './components/ThemeToggle';

export function TOC() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [meta, setMeta] = useState(null);
    const [chapters, setChapters] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const metadata = await bookStore.getBookMeta(id);
                if (!metadata) {
                    navigate('/');
                    return;
                }
                setMeta(metadata);

                // Use the TOC stored in metadata if available, 
                // otherwise we would need to parse the book again.
                // Our new bookStore.addBook stores the TOC.
                if (metadata.toc) {
                    setChapters(metadata.toc);
                    setLoading(false);
                    return;
                }

                // Fallback for older books: Need to parse it to get TOC
                const data = await bookStore.getBookData(id);
                const parser = bookStore.getParser(metadata.fileName);
                if (parser) {
                    const parsed = await parser.parse(data, metadata.fileName);
                    setChapters(parsed.toc);
                }

                setLoading(false);
            } catch (err) {
                console.error("TOC Load Error:", err);
                setLoading(false);
            }
        };
        loadData();
    }, [id, navigate]);

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Chapter List...</div>;
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
                <div style={{ marginTop: '1rem' }}>
                    <Link
                        to={`/book/${id}/read/0`}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: 'var(--accent-color, #3B82F6)',
                            color: '#fff',
                            borderRadius: '4px',
                            textDecoration: 'none',
                            fontWeight: 'bold'
                        }}
                    >
                        <BookOpen size={18} /> Start Reading
                    </Link>
                </div>
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
                                transition: 'background 0.2s'
                            }}
                        >
                            <span style={{ opacity: 0.5, fontSize: '0.8rem', minWidth: '24px' }}>{index + 1}</span>
                            <span style={{ fontWeight: 500 }}>{chapter.title || chapter.label || `Chapter ${index + 1}`}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
