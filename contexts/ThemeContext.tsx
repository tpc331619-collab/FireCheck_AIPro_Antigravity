import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeType = 'light' | 'dark' | 'monokai' | 'solarized' | 'dracula' | 'nord' | 'onedark' | 'system';

export interface ThemeStyles {
    bg: string;
    text: string;
    card: string;
    border: string;
    primary: string;
    secondary: string;
    highlight: string;
    buttonText: string;
    isDark: boolean;
    patternStyle: React.CSSProperties;
}

// 方向 B：建築／工業幾何微紋理主題 (Architectural Grid / Dot Matrix / CAD Blueprint)
export const THEME_STYLES: Record<ThemeType, ThemeStyles> = {
    // 1. 精密點陣・極簡白 (Dot Matrix Light)
    light: {
        bg: 'bg-[#f8fafc]',
        text: 'text-slate-800',
        card: 'bg-white',
        border: 'border-slate-200',
        primary: 'bg-blue-600',
        secondary: 'bg-indigo-600',
        highlight: 'text-blue-600',
        buttonText: 'text-white',
        isDark: false,
        patternStyle: {
            backgroundColor: '#f8fafc',
            backgroundImage: `
                radial-gradient(at 100% 0%, rgba(59, 130, 246, 0.07) 0px, transparent 50%),
                radial-gradient(at 0% 100%, rgba(99, 102, 241, 0.05) 0px, transparent 50%),
                radial-gradient(rgba(100, 116, 139, 0.22) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 100% 100%, 20px 20px'
        }
    },
    // 2. 工程方格・冷冽銀 (Architectural Grid)
    nord: {
        bg: 'bg-[#f1f5f9]',
        text: 'text-slate-800',
        card: 'bg-white',
        border: 'border-slate-200',
        primary: 'bg-sky-600',
        secondary: 'bg-slate-700',
        highlight: 'text-sky-600',
        buttonText: 'text-white',
        isDark: false,
        patternStyle: {
            backgroundColor: '#f1f5f9',
            backgroundImage: `
                radial-gradient(at 50% 0%, rgba(255, 255, 255, 0.85) 0px, transparent 70%),
                linear-gradient(to right, rgba(100, 116, 139, 0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(100, 116, 139, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 24px 24px, 24px 24px'
        }
    },
    // 3. 工程雙格・溫潤米白 (Technical Dual-Grid)
    dracula: {
        bg: 'bg-[#fafaf9]',
        text: 'text-stone-800',
        card: 'bg-white',
        border: 'border-stone-200',
        primary: 'bg-amber-600',
        secondary: 'bg-orange-600',
        highlight: 'text-amber-600',
        buttonText: 'text-white',
        isDark: false,
        patternStyle: {
            backgroundColor: '#f8f7f4',
            backgroundImage: `
                linear-gradient(to right, rgba(120, 113, 108, 0.11) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(120, 113, 108, 0.11) 1px, transparent 1px),
                linear-gradient(to right, rgba(120, 113, 108, 0.045) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(120, 113, 108, 0.045) 1px, transparent 1px)
            `,
            backgroundSize: '96px 96px, 96px 96px, 16px 16px, 16px 16px'
        }
    },
    // 4. 綠能環安・生態點陣 (EHS Eco Matrix)
    monokai: {
        bg: 'bg-[#f2fbf7]',
        text: 'text-slate-800',
        card: 'bg-white',
        border: 'border-emerald-200',
        primary: 'bg-emerald-600',
        secondary: 'bg-teal-600',
        highlight: 'text-emerald-600',
        buttonText: 'text-white',
        isDark: false,
        patternStyle: {
            backgroundColor: '#f2fbf7',
            backgroundImage: `
                radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.08) 0px, transparent 55%),
                radial-gradient(rgba(16, 185, 129, 0.22) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 20px 20px'
        }
    },
    // 5. 建築藍圖・CAD 網格 (CAD Blueprint Dark)
    solarized: {
        bg: 'bg-[#0b213f]',
        text: 'text-sky-50',
        card: 'bg-white',
        border: 'border-sky-800',
        primary: 'bg-sky-500',
        secondary: 'bg-cyan-500',
        highlight: 'text-sky-400',
        buttonText: 'text-white',
        isDark: true,
        patternStyle: {
            backgroundColor: '#0b213f',
            backgroundImage: `
                radial-gradient(at 50% 0%, rgba(14, 165, 233, 0.16) 0px, transparent 65%),
                linear-gradient(to right, rgba(56, 189, 248, 0.14) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.14) 1px, transparent 1px),
                linear-gradient(to right, rgba(56, 189, 248, 0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(56, 189, 248, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 100px 100px, 100px 100px, 20px 20px, 20px 20px'
        }
    },
    // 6. 戰情中控・暗夜方格 (Command Center Dark)
    dark: {
        bg: 'bg-[#0f172a]',
        text: 'text-slate-100',
        card: 'bg-white',
        border: 'border-slate-700',
        primary: 'bg-blue-600',
        secondary: 'bg-slate-700',
        highlight: 'text-sky-400',
        buttonText: 'text-white',
        isDark: true,
        patternStyle: {
            backgroundColor: '#0f172a',
            backgroundImage: `
                radial-gradient(at 15% 0%, rgba(59, 130, 246, 0.14) 0px, transparent 50%),
                radial-gradient(at 85% 100%, rgba(99, 102, 241, 0.1) 0px, transparent 50%),
                linear-gradient(to right, rgba(148, 163, 184, 0.075) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148, 163, 184, 0.075) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 100% 100%, 24px 24px, 24px 24px'
        }
    },
    // 7. 鈦金工業・深邃點陣 (Titanium Dot Matrix)
    onedark: {
        bg: 'bg-[#18181b]',
        text: 'text-zinc-100',
        card: 'bg-white',
        border: 'border-zinc-700',
        primary: 'bg-blue-500',
        secondary: 'bg-zinc-700',
        highlight: 'text-blue-400',
        buttonText: 'text-white',
        isDark: true,
        patternStyle: {
            backgroundColor: '#18181b',
            backgroundImage: `
                radial-gradient(at 50% 0%, rgba(255, 255, 255, 0.05) 0px, transparent 60%),
                radial-gradient(rgba(255, 255, 255, 0.12) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 18px 18px'
        }
    },
    // 8. 跟隨系統 (System Auto)
    system: {
        bg: 'bg-[#f8fafc]',
        text: 'text-slate-800',
        card: 'bg-white',
        border: 'border-slate-200',
        primary: 'bg-blue-600',
        secondary: 'bg-indigo-600',
        highlight: 'text-blue-600',
        buttonText: 'text-white',
        isDark: false,
        patternStyle: {
            backgroundColor: '#f8fafc',
            backgroundImage: `
                radial-gradient(at 100% 0%, rgba(59, 130, 246, 0.07) 0px, transparent 50%),
                radial-gradient(rgba(100, 116, 139, 0.22) 1px, transparent 1px)
            `,
            backgroundSize: '100% 100%, 20px 20px'
        }
    }
};

interface ThemeContextType {
    theme: ThemeType;
    setTheme: (theme: ThemeType) => void;
    styles: ThemeStyles;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<ThemeType>(() => {
        const saved = localStorage.getItem('app-theme') as ThemeType;
        return saved && THEME_STYLES[saved] ? saved : 'light';
    });

    const [resolvedTheme, setResolvedTheme] = useState<ThemeType>('light');

    useEffect(() => {
        localStorage.setItem('app-theme', theme);

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => {
                setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
            };

            handleChange();
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            setResolvedTheme(theme);
        }
    }, [theme]);

    useEffect(() => {
        const root = document.documentElement;
        const activeStyle = THEME_STYLES[resolvedTheme] || THEME_STYLES.light;

        if (activeStyle.isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [resolvedTheme]);

    const currentStyles = THEME_STYLES[resolvedTheme] || THEME_STYLES.light;

    return (
        <ThemeContext.Provider value={{ theme, setTheme, styles: currentStyles }}>
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
