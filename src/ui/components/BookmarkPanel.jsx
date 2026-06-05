import { useState, useEffect } from 'react';
import { Bookmark, Trash2, X, Search, BookOpen } from 'lucide-react';

/**
 * Slide-out bookmark management panel — mirrors Settings.jsx pattern.
 * @param {{ bookmarks: Array, currentSpineIndex: number, onNavigate: Function, onDelete: Function, isOpen: boolean, onClose: Function }} props
 */
export function BookmarkPanel({ bookmarks, currentSpineIndex, onNavigate, onDelete, isOpen, onClose }) {
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const filtered = search.trim()
        ? bookmarks.filter(b => b.text.toLowerCase().includes(search.toLowerCase()))
        : bookmarks;

    const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

    return (
        <div
            className="bookmark-panel slide-panel"
            style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0,
                width: 'clamp(280px, 80vw, 320px)',
                background: 'var(--bg-primary)',
                boxShadow: '-4px 0 24px var(--shadow-lg)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid var(--border-color)'
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                borderBottom: '1px solid var(--border-color)',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Bookmark size={18} />
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>Bookmarks</h3>
                </div>
                <button onClick={onClose} className="icon-btn" aria-label="Close bookmarks">
                    <X size={18} />
                </button>
            </div>

            {/* Search */}
            {bookmarks.length > 2 && (
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                    <div className="bookmark-search-box" style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.4rem 0.6rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                    }}>
                        <Search size={14} style={{ opacity: 0.4 }} />
                        <input
                            type="text"
                            placeholder="Search bookmarks..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                flex: 1,
                                minWidth: 0,
                                fontSize: '0.85rem',
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>
                </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                {sorted.length === 0 ? (
                    <div style={{
                        padding: '2rem 1rem',
                        textAlign: 'center',
                        opacity: 0.6,
                        fontSize: '0.9rem'
                    }}>
                        {search.trim() ? (
                            'No bookmarks match your search.'
                        ) : (
                            <>
                                <Bookmark size={32} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
                                <p style={{ margin: 0 }}>No bookmarks yet.</p>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
                                    Long-press or right-click a sentence.
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    sorted.map(b => {
                        const isExpanded = expandedId === b.id;
                        const chapterLabel = `Chapter ${b.spineIndex + 1}`;
                        const displayText = isExpanded
                            ? b.text
                            : b.text.length > 120
                                ? b.text.substring(0, 120) + '...'
                                : b.text;
                        const isCurrentChapter = parseInt(b.spineIndex) === currentSpineIndex;

                        return (
                            <div
                                className="bookmark-panel-item"
                                key={b.id}
                                style={{
                                    padding: '0.6rem 0.75rem',
                                    marginBottom: '0.35rem',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    border: `1px solid ${isCurrentChapter ? 'var(--accent-color, #3b82f6)' : 'transparent'}`,
                                    background: isCurrentChapter
                                        ? 'rgba(59,130,246,0.06)'
                                        : 'transparent',
                                    transition: 'background 0.15s'
                                }}
                                onClick={() => onNavigate(b.spineIndex, b.nodeIndex)}
                            >
                                <p style={{
                                    margin: '0 0 0.25rem 0',
                                    fontSize: '0.85rem',
                                    fontStyle: 'italic',
                                    opacity: 0.85,
                                    lineHeight: '1.4',
                                    wordBreak: 'break-word'
                                }}>
                                    "{displayText}"
                                    {b.text.length > 120 && (
                                        <span
                                            onClick={e => {
                                                e.stopPropagation();
                                                setExpandedId(isExpanded ? null : b.id);
                                            }}
                                            style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--accent-color, #3b82f6)',
                                                cursor: 'pointer',
                                                marginLeft: '0.25rem'
                                            }}
                                        >
                                            {isExpanded ? ' less' : ' more'}
                                        </span>
                                    )}
                                </p>
                                <div className="bookmark-panel-meta" style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontSize: '0.7rem',
                                        opacity: 0.5
                                    }}>
                                        <BookOpen size={12} />
                                        <span>{chapterLabel}</span>
                                        <span>•</span>
                                        <span>{new Date(b.timestamp).toLocaleDateString()}</span>
                                    </div>
                                    <button
                                        onClick={e => {
                                            e.stopPropagation();
                                            onDelete(b.id);
                                        }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            padding: '2px',
                                            color: 'var(--toast-text-error, #991b1b)',
                                            opacity: 0.5
                                        }}
                                        title="Delete bookmark"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
