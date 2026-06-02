import { createContext, useContext, useState, useCallback } from 'react';

const HeaderActionsContext = createContext(null);

/**
 * Minimal context so pages can hook into the persistent header's actions.
 * - bookmarkCount: badge number on the bookmark button (set by Player)
 * - onBookmarkClick: called when bookmark button is clicked (set by Player to toggle panel)
 */
export function HeaderActionsProvider({ children }) {
    const [bookmarkCount, setBookmarkCount] = useState(0);
    const [onBookmarkClick, setOnBookmarkClick] = useState(null);

    const registerBookmarks = useCallback((count, handler) => {
        setBookmarkCount(count);
        setOnBookmarkClick(() => handler);
    }, []);

    const clearBookmarks = useCallback(() => {
        setBookmarkCount(0);
        setOnBookmarkClick(null);
    }, []);

    return (
        <HeaderActionsContext.Provider value={{ bookmarkCount, onBookmarkClick, registerBookmarks, clearBookmarks }}>
            {children}
        </HeaderActionsContext.Provider>
    );
}

export function useHeaderActions() {
    const ctx = useContext(HeaderActionsContext);
    if (!ctx) return { bookmarkCount: 0, onBookmarkClick: null, registerBookmarks: () => {}, clearBookmarks: () => {} };
    return ctx;
}
