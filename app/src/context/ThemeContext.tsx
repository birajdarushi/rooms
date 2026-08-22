import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance, ColorSchemeName, Platform, useColorScheme } from 'react-native';
import { getTheme, ThemeColors } from '../constants/theme';

interface ThemeContextType {
  isDark: boolean;
  theme: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  theme: getTheme(false),
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hookScheme = useColorScheme();
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    hookScheme || Appearance.getColorScheme() || 'light'
  );

  useEffect(() => {
    // 1. React Native Appearance listener (iOS & Android native)
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      if (colorScheme) {
        setSystemScheme(colorScheme);
      }
    });

    // 2. Web matchMedia listener for browser / desktop system theme switches
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const matcher = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        setSystemScheme(e.matches ? 'dark' : 'light');
      };
      setSystemScheme(matcher.matches ? 'dark' : 'light');
      matcher.addEventListener('change', listener);
      return () => {
        subscription.remove();
        matcher.removeEventListener('change', listener);
      };
    }

    return () => subscription.remove();
  }, []);

  // Update whenever hookScheme updates from React Native
  useEffect(() => {
    if (hookScheme) {
      setSystemScheme(hookScheme);
    }
  }, [hookScheme]);

  const isDark = systemScheme === 'dark';
  const theme = getTheme(isDark);

  return (
    <ThemeContext.Provider value={{ isDark, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => useContext(ThemeContext);
