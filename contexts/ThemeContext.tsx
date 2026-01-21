import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeType = 'light' | 'dark' | 'monokai' | 'solarized' | 'dracula' | 'nord' | 'onedark' | 'system';

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
    // VS Code Light+ 風格
    light: {
        bg: 'bg-[#f3f3f3]',
        text: 'text-[#1e1e1e]',
        card: 'bg-white',
        border: 'border-[#e5e5e5]',
        primary: 'bg-[#007acc]',
        secondary: 'bg-[#68217a]',
        highlight: 'text-[#007acc]',
        buttonText: 'text-white'
    },
    // VS Code Dark+ 風格
    dark: {
        bg: 'bg-[#1e1e1e]',
        text: 'text-[#d4d4d4]',
        card: 'bg-[#252526]',
        border: 'border-[#3e3e42]',
        primary: 'bg-[#0e639c]',
        secondary: 'bg-[#37373d]',
        highlight: 'text-[#4fc1ff]',
        buttonText: 'text-white'
    },
    // Monokai 風格
    monokai: {
        bg: 'bg-[#272822]',
        text: 'text-[#f8f8f2]',
        card: 'bg-[#3e3d32]',
        border: 'border-[#49483e]',
        primary: 'bg-[#a6e22e]',
        secondary: 'bg-[#66d9ef]',
        highlight: 'text-[#f92672]',
        buttonText: 'text-[#272822]'
    },
    // Solarized Dark 風格
    solarized: {
        bg: 'bg-[#002b36]',
        text: 'text-[#839496]',
        card: 'bg-[#073642]',
        border: 'border-[#586e75]',
        primary: 'bg-[#268bd2]',
        secondary: 'bg-[#2aa198]',
        highlight: 'text-[#b58900]',
        buttonText: 'text-white'
    },
    // Dracula 風格
    dracula: {
        bg: 'bg-[#282a36]',
        text: 'text-[#f8f8f2]',
        card: 'bg-[#44475a]',
        border: 'border-[#6272a4]',
        primary: 'bg-[#bd93f9]',
        secondary: 'bg-[#ff79c6]',
        highlight: 'text-[#50fa7b]',
        buttonText: 'text-[#282a36]'
    },
    // Nord 風格
    nord: {
        bg: 'bg-[#2e3440]',
        text: 'text-[#d8dee9]',
        card: 'bg-[#3b4252]',
        border: 'border-[#4c566a]',
        primary: 'bg-[#88c0d0]',
        secondary: 'bg-[#81a1c1]',
        highlight: 'text-[#8fbcbb]',
        buttonText: 'text-[#2e3440]'
    },
    // One Dark Pro 風格
    onedark: {
        bg: 'bg-[#282c34]',
        text: 'text-[#abb2bf]',
        card: 'bg-[#21252b]',
        border: 'border-[#181a1f]',
        primary: 'bg-[#61afef]',
        secondary: 'bg-[#c678dd]',
        highlight: 'text-[#98c379]',
        buttonText: 'text-white'
    },
    // System (跟隨系統)
    system: {
        bg: 'bg-[#f3f3f3]',
        text: 'text-[#1e1e1e]',
        card: 'bg-white',
        border: 'border-[#e5e5e5]',
        primary: 'bg-[#007acc]',
        secondary: 'bg-[#68217a]',
        highlight: 'text-[#007acc]',
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

    // 3. Toggle 'dark' class on html element for Tailwind dark mode support
    useEffect(() => {
        const root = document.documentElement;
        // List of themes that should trigger dark mode
        const darkThemes: ThemeType[] = ['dark', 'monokai', 'solarized', 'dracula', 'nord', 'onedark'];

        if (darkThemes.includes(resolvedTheme)) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [resolvedTheme]);

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
