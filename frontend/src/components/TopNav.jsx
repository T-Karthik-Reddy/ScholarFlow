import React, { useState, useEffect } from 'react';
import { Sun, Moon, Settings } from 'lucide-react';
import { setTheme } from '../services/settings';

export default function TopNav({ onOpenSettings }) {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // index.html applies the stored theme before paint; sync with it.
        setIsDark(document.documentElement.classList.contains('dark'));
    }, []);

    const toggleTheme = () => {
        const next = !isDark;
        setTheme(next ? 'dark' : 'light');
        setIsDark(next);
    };

    return (
        <header className="bg-surface border-b border-hardcoded-border flex justify-between items-center w-full px-margin-page h-14 z-40 shrink-0 transition-colors duration-300">
            <div className="flex items-center gap-gap-md">
                <span className="font-headline-md text-headline-md font-bold text-on-surface transition-colors duration-300">ScholarFlow</span>
            </div>
            <div className="flex items-center gap-gap-md">
                <button
                    onClick={toggleTheme}
                    className={`w-14 h-7 rounded-full relative transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-surface ${isDark ? 'bg-primary' : 'bg-[#CBD5E1]'}`}
                    aria-label="Toggle Dark Mode"
                >
                    <span
                        className={`absolute top-[2px] left-[2px] w-6 h-6 rounded-full bg-white shadow flex items-center justify-center transition-transform duration-300 ${isDark ? 'transform translate-x-7' : ''}`}
                    >
                        {isDark ? <Moon size={14} className="text-primary" /> : <Sun size={14} className="text-[#F59E0B]" />}
                    </span>
                </button>
                <button
                    onClick={onOpenSettings}
                    className="p-2 rounded hover:bg-surface-container transition-colors text-on-surface-variant hover:text-primary"
                    aria-label="Open Settings"
                    title="Settings (API key & PDF folder)"
                >
                    <Settings size={18} />
                </button>
            </div>
        </header>
    );
}
