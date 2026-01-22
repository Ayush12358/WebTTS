import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { bookStore } from '../core/bookStore';
import { ArrowLeft, BookOpen, Clock } from 'lucide-react';
import ePub from 'epubjs';
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

                const data = await bookStore.getBookData(id);
                const book = ePub(data);
                await book.ready;
                const navigation = await book.loaded.navigation;

                // Flatten navigation for simple list? Or keep tree?
                // Simple flat list for V1
                const toc = flattenToc(navigation.toc);
                setChapters(toc);

                setLoading(false);
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };
        loadData();
    }, [id, navigate]);

    const flattenToc = (toc) => {
        let output = [];
        toc.forEach(item => {
            output.push(item);
            if (item.subitems && item.subitems.length > 0) {
                output = output.concat(flattenToc(item.subitems));
            }
        });
        return output;
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Chapter List...</div>;

    return (
        <div className="toc-container" style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
            <nav style={{ marginBottom: '2rem' }}>
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', color: 'var(--text-primary)' }}>
                    <ArrowLeft size={20} />
                    Library
                </Link>
            </nav>

            <div className="book-header" style={{ marginBottom: '2rem', borderBottom: '1px solid rgba(128,128,128,0.2)', paddingBottom: '1rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0' }}>{meta.title}</h1>
                <p style={{ margin: 0, opacity: 0.7 }}>{meta.author}</p>
            </div>
            <ThemeToggle />

            <div className="chapter-list">
                {chapters.length === 0 ? (
                    <div style={{ padding: '1rem', opacity: 0.7 }}>No table of contents found. <Link to={`/book/${id}/read/start`}>Start Reading</Link></div>
                ) : (
                    chapters.map((chapter, index) => (
                        <div
                            key={index}
                            onClick={() => navigate(`/book/${id}/read/${encodeURIComponent(chapter.href)}`)}
                            className="chapter-item"
                            style={{
                                padding: '1rem',
                                borderBottom: '1px solid rgba(128,128,128,0.1)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem'
                            }}
                        >
                            <span style={{ opacity: 0.5, fontSize: '0.8rem', minWidth: '20px' }}>{index + 1}</span>
                            <span>{chapter.label.trim()}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
