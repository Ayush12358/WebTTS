import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import localforage from 'localforage';

export function ThemeToggle() {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        let active = true;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = nextTheme => {
            if (!active) return;
            setTheme(nextTheme);
            document.documentElement.setAttribute('data-theme', nextTheme);
        };
        const handleSystemThemeChange = event => applyTheme(event.matches ? 'dark' : 'light');

        const loadTheme = async () => {
            try {
                const savedTheme = await localforage.getItem('theme');
                if (savedTheme === 'dark' || savedTheme === 'light') {
                    applyTheme(savedTheme);
                    return;
                }
            } catch (error) {
                console.warn('Could not load saved theme', error);
            }

            applyTheme(media.matches ? 'dark' : 'light');
            media.addEventListener?.('change', handleSystemThemeChange);
        };

        loadTheme();
        return () => {
            active = false;
            media.removeEventListener?.('change', handleSystemThemeChange);
        };
    }, []);

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        try {
            await localforage.setItem('theme', newTheme);
        } catch (error) {
            console.warn('Could not save theme', error);
        }
    };


    return (
        <button
            onClick={toggleTheme}
            className="icon-btn"
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            style={{ color: 'var(--text-secondary)' }}
        >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
    );
}
