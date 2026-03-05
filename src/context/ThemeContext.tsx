import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'dark',
    toggleTheme: () => { },
    setTheme: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setThemeState] = useState<Theme>(() => {
        const stored = localStorage.getItem('3olabs-theme');
        return (stored === 'light' || stored === 'dark') ? stored : 'dark';
    });

    useEffect(() => {
        localStorage.setItem('3olabs-theme', theme);
        const root = document.documentElement;
        if (theme === 'light') {
            root.classList.add('light-theme');
            root.classList.remove('dark-theme');
        } else {
            root.classList.add('dark-theme');
            root.classList.remove('light-theme');
        }
    }, [theme]);

    const toggleTheme = () => setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
    const setTheme = (t: Theme) => setThemeState(t);

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);
