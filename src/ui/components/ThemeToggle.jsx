import React, { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import localforage from 'localforage';

export function ThemeToggle() {
    const [theme, setTheme] = useState('light');

    useEffect(() => {
        // Load saved theme or prefer-color-scheme
        const loadTheme = async () => {
            const savedTheme = await localforage.getItem('theme');
            if (savedTheme) {
                setTheme(savedTheme);
                document.documentElement.setAttribute('data-theme', savedTheme);
            } else {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const initialTheme = prefersDark ? 'dark' : 'light';
                setTheme(initialTheme);
                document.documentElement.setAttribute('data-theme', initialTheme);
            }
        };
        loadTheme();
    }, []);

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
        await localforage.setItem('theme', newTheme);
    };

    return (
        <button
            onClick={toggleTheme}
            className="icon-btn"
            aria-label="Toggle theme"
            style={{ color: 'var(--text-secondary)' }}
        >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
    );
}
