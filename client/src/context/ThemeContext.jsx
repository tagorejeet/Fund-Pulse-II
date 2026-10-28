import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

const STORAGE_KEY = 'snazzy_fundlens_theme';

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      // Clear persistent localStorage keys so old cached dark mode never overrides initial load
      localStorage.removeItem('fundpulse_theme');
      localStorage.removeItem(STORAGE_KEY);
      
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === 'dark') return 'dark';
      if (saved === 'light') return 'light';
    } catch (e) {}
    // Default is strictly light mode (crisp clean white day mode) on opening URL
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
    try {
      // Save in sessionStorage for the active session, keep localStorage clear
      sessionStorage.setItem(STORAGE_KEY, theme);
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
