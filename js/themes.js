/**
 * ThemeManager - Board color themes with smooth transitions.
 */
export const THEMES = {
  classic: {
    name: 'Classic Wood',
    light: '#f0d9b5',
    dark: '#b58863',
    selected: 'rgba(255, 255, 0, 0.5)',
    lastMove: 'rgba(155, 199, 0, 0.41)',
    accent: '#7c6fff',
    bg: '#1a1210',
    surface: '#2a2018',
    border: '#3d2e1f',
  },
  neon: {
    name: 'Neon Cyber',
    light: '#2a2a4a',
    dark: '#1a1a35',
    selected: 'rgba(0, 255, 200, 0.4)',
    lastMove: 'rgba(0, 255, 200, 0.15)',
    accent: '#00ffc8',
    bg: '#0a0a1a',
    surface: '#12122a',
    border: '#1e1e4a',
  },
  ocean: {
    name: 'Deep Ocean',
    light: '#a8c8e8',
    dark: '#4a7a9b',
    selected: 'rgba(100, 200, 255, 0.5)',
    lastMove: 'rgba(100, 200, 255, 0.2)',
    accent: '#64c8ff',
    bg: '#0a1520',
    surface: '#122030',
    border: '#1a3040',
  },
  midnight: {
    name: 'Midnight',
    light: '#b8c0d8',
    dark: '#5b6799',
    selected: 'rgba(124, 111, 255, 0.5)',
    lastMove: 'rgba(240, 192, 64, 0.25)',
    accent: '#7c6fff',
    bg: '#0f0f13',
    surface: '#1a1a24',
    border: '#2e2e4a',
  },
  marble: {
    name: 'Royal Marble',
    light: '#e8e0d4',
    dark: '#8b7d6b',
    selected: 'rgba(200, 170, 100, 0.5)',
    lastMove: 'rgba(200, 170, 100, 0.25)',
    accent: '#c8a864',
    bg: '#151210',
    surface: '#201c18',
    border: '#352e26',
  },
  emerald: {
    name: 'Emerald',
    light: '#a8d8a8',
    dark: '#4a8a4a',
    selected: 'rgba(80, 200, 120, 0.5)',
    lastMove: 'rgba(80, 200, 120, 0.2)',
    accent: '#50c878',
    bg: '#0a150a',
    surface: '#122012',
    border: '#1a3a1a',
  },
};

export class ThemeManager {
  constructor(initialTheme = 'midnight') {
    this.current = initialTheme;
    this.apply(this.current);
  }

  apply(themeName) {
    const theme = THEMES[themeName];
    if (!theme) return;
    this.current = themeName;
    const root = document.documentElement;
    root.style.setProperty('--light-sq', theme.light);
    root.style.setProperty('--dark-sq', theme.dark);
    root.style.setProperty('--selected', theme.selected);
    root.style.setProperty('--last-move', theme.lastMove);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--accent-glow', theme.accent.replace(')', ',0.3)').replace('rgb', 'rgba'));
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--surface', theme.surface);
    root.style.setProperty('--border', theme.border);
  }

  next() {
    const keys = Object.keys(THEMES);
    const idx = (keys.indexOf(this.current) + 1) % keys.length;
    this.apply(keys[idx]);
    return THEMES[keys[idx]].name;
  }

  getNames() {
    return Object.entries(THEMES).map(([k, v]) => ({ id: k, name: v.name }));
  }
}
