import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeType = 'light' | 'dark' | 'blue' | 'green' | 'orange' | 'purple' | 'high-contrast' | 'system';

interface ThemeStyles {
    bg: string;
    text: string;
    card: string;
    border: string;
    primary: string;
    secondary: string;
    highlight: string;
    buttonText: string;
}

// Define the styles for each theme using Tailwind classes
export const THEME_STYLES: Record<ThemeType, ThemeStyles> = {
    light: {
        bg: 'bg-slate-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-slate-100',
        primary: 'bg-red-600',
        secondary: 'bg-slate-800',
        highlight: 'text-red-600',
        buttonText: 'text-white'
    },
    dark: {
        bg: 'bg-slate-950',
        text: 'text-slate-100',
        card: 'bg-slate-900',
        border: 'border-slate-800',
        primary: 'bg-red-700',
        secondary: 'bg-slate-700',
        highlight: 'text-red-500',
        buttonText: 'text-white'
    },
    blue: {
        bg: 'bg-blue-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-blue-100',
        primary: 'bg-blue-600',
        secondary: 'bg-slate-800',
        highlight: 'text-blue-600',
        buttonText: 'text-white'
    },
    green: {
        bg: 'bg-emerald-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-emerald-100',
        primary: 'bg-emerald-600',
        secondary: 'bg-slate-800',
        highlight: 'text-emerald-600',
        buttonText: 'text-white'
    },
    orange: {
        bg: 'bg-orange-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-orange-100',
        primary: 'bg-orange-600',
        secondary: 'bg-slate-800',
        highlight: 'text-orange-600',
        buttonText: 'text-white'
    },
    purple: {
        bg: 'bg-purple-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-purple-100',
        primary: 'bg-purple-600',
        secondary: 'bg-slate-800',
        highlight: 'text-purple-600',
        buttonText: 'text-white'
    },
    'high-contrast': {
        bg: 'bg-[#000000]',
        text: 'text-[#FFFF00]',
        card: 'bg-[#001f3f]',
        border: 'border-white',
        primary: 'bg-[#FFFF00]',
        secondary: 'bg-white',
        highlight: 'text-[#FFFF00]',
        buttonText: 'text-black'
    },
    system: {
        bg: 'bg-slate-50',
        text: 'text-slate-900',
        card: 'bg-white',
        border: 'border-slate-100',
        primary: 'bg-red-600',
        secondary: 'bg-slate-800',
        highlight: 'text-red-600',
        buttonText: 'text-white'
    }
};

interface ThemeContextType {
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    styles: ThemeStyles;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 1. Initialize from localStorage or default 'light'
    const [theme, setTheme] = useState<ThemeType>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as ThemeType) || 'light';
    });

    // 2. Handle System Theme
    const [resolvedTheme, setResolvedTheme] = useState<ThemeType>('light');

    useEffect(() => {
        localStorage.setItem('app-theme', theme);

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => {
                setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
            };

            // Initial check
            handleChange();

            // Listen
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            setResolvedTheme(theme);
        }
    }, [theme]);

    // 3. Get currently active styles based on resolved theme (handling system fallback)
    // Note: If theme is 'system' and resolved is 'dark', we use 'dark' styles.
    const activeStyles = THEME_STYLES[resolvedTheme === 'system' ? 'light' : resolvedTheme];
    // Wait, resolvedTheme will be 'dark' or 'light' if system. 
    // If theme is explicitly 'dark', resolved is 'dark'.

    // Correction: THEME_STYLES should be indexed by resolvedTheme if it's a valid key.
    // If resolvedTheme is not in THEME_STYLES (shouldn't happen), fallback to light.
    const currentStyles = THEME_STYLES[resolvedTheme] || THEME_STYLES.light;

    const value = {
        theme,
        setTheme,
        styles: currentStyles
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
