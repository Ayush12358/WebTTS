import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { Settings } from './Settings';
import { useHeaderActions } from './HeaderActions';
import { useTTSConfig } from '../../core/useTTSConfig';
import { useEffect, useState } from 'react';
import { bookStore } from '../../core/bookStore';

/**
 * Persistent app header rendered once in App.jsx above all routes.
 * Shows: back nav, page/book title, Bookmarks button, Settings gear, ThemeToggle.
 */
export function Header() {
    const location = useLocation();
    const navigate = useNavigate();
    const isHome = location.pathname === '/';
    const isReader = location.pathname.includes('/read/');

    // Extract book ID from pathname (useParams only works inside Routes)
    const pathParts = location.pathname.split('/');
    const bookId = pathParts.length >= 3 && pathParts[1] === 'book' ? pathParts[2] : null;

    const { bookmarkCount, onBookmarkClick } = useHeaderActions();

    const [ttsConfig, setTtsConfig] = useTTSConfig();
    const [pageTitle, setPageTitle] = useState('');

    useEffect(() => {
        const resolveTitle = async () => {
            if (isHome) { setPageTitle(''); return; }
            const path = location.pathname;
            if (path === '/test-tts') { setPageTitle('TTS Tester'); return; }
            if (bookId) {
                try {
                    const meta = await bookStore.getBookMeta(bookId);
                    if (meta?.title) { setPageTitle(meta.title); return; }
                } catch { /* fallback */ }
            }
            if (path.includes('/toc')) setPageTitle('Chapters');
            else if (path.includes('/read')) setPageTitle('Reading');
            else setPageTitle('WebTTS');
        };
        resolveTitle();
    }, [location.pathname, bookId, isHome]);

    const handleBack = () => {
        navigate(window.history.length > 1 ? -1 : '/');
    };

    const handleBookmarkClick = () => {
        if (isReader && onBookmarkClick) {
            onBookmarkClick();
        } else if (bookId) {
            navigate(`/book/${bookId}/toc`);
        }
    };

    return (
        <header className="app-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '48px',
            padding: '0 0.75rem',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            flexShrink: 0,
            zIndex: 50
        }}>
            {/* Left */}
            <div className="header-title-area" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
                {!isHome && (
                    <button onClick={handleBack} className="icon-btn" aria-label="Go back" style={{ flexShrink: 0 }}>
                        <ArrowLeft size={18} />
                    </button>
                )}
                <Link
                    to="/"
                    className="header-title"
                    style={{
                        textDecoration: 'none', color: 'var(--text-primary)',
                        fontWeight: 700, fontSize: '1rem',
                        whiteSpace: 'nowrap', overflow: 'hidden',
                        textOverflow: 'ellipsis', lineHeight: 1.2
                    }}
                >
                    {isHome ? 'WebTTS' : pageTitle || 'WebTTS'}
                </Link>
            </div>

            {/* Right */}
            <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                {(bookId || isHome) && (
                    <button
                        onClick={handleBookmarkClick}
                        className="icon-btn"
                        aria-label="Bookmarks"
                        style={{ position: 'relative', color: 'var(--text-secondary)' }}
                    >
                        <Bookmark size={16} />
                        {bookmarkCount > 0 && (
                            <span style={{
                                position: 'absolute', top: '2px', right: '2px',
                                background: 'var(--accent-color)', color: 'white',
                                fontSize: '0.55rem', fontWeight: 600,
                                minWidth: '14px', height: '14px', padding: '0 2px',
                                borderRadius: '7px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                lineHeight: 1
                            }}>
                                {bookmarkCount > 99 ? '99+' : bookmarkCount}
                            </span>
                        )}
                    </button>
                )}
                <Settings config={ttsConfig} onConfigChange={setTtsConfig} />
                <ThemeToggle />
            </div>
        </header>
    );
}
