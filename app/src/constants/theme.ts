export interface SongPalette {
  primary: string;
  primaryDim: string;
  gradientStart: string;
  gradientEnd: string;
  glow: string;
  textColor: string;
}

export const SONG_PALETTES: SongPalette[] = [
  {
    // Sunset Coral
    primary: '#ff8a5f',
    primaryDim: '#d97147',
    gradientStart: '#ffb98c',
    gradientEnd: '#c25a37',
    glow: 'rgba(255, 138, 95, 0.35)',
    textColor: '#2a1509',
  },
  {
    // Honey Gold
    primary: '#e8c468',
    primaryDim: '#c49a38',
    gradientStart: '#fde68a',
    gradientEnd: '#b45309',
    glow: 'rgba(232, 196, 104, 0.35)',
    textColor: '#2a2109',
  },
  {
    // Matcha Sage
    primary: '#93b58c',
    primaryDim: '#6b9264',
    gradientStart: '#bbf7d0',
    gradientEnd: '#3f6212',
    glow: 'rgba(147, 181, 140, 0.35)',
    textColor: '#142612',
  },
  {
    // Electric Violet / Lavender
    primary: '#a78bfa',
    primaryDim: '#7c3aed',
    gradientStart: '#ddd6fe',
    gradientEnd: '#5b21b6',
    glow: 'rgba(167, 139, 250, 0.35)',
    textColor: '#1e1035',
  },
  {
    // Wild Rose / Ruby
    primary: '#fb7185',
    primaryDim: '#e11d48',
    gradientStart: '#fecdd3',
    gradientEnd: '#9f1239',
    glow: 'rgba(251, 113, 133, 0.35)',
    textColor: '#2e0b14',
  },
  {
    // Ocean Sky / Azure
    primary: '#38bdf8',
    primaryDim: '#0284c7',
    gradientStart: '#bae6fd',
    gradientEnd: '#0369a1',
    glow: 'rgba(56, 189, 248, 0.35)',
    textColor: '#082536',
  },
  {
    // Emerald Teal
    primary: '#2dd4bf',
    primaryDim: '#0f766e',
    gradientStart: '#99f6e4',
    gradientEnd: '#115e59',
    glow: 'rgba(45, 212, 191, 0.35)',
    textColor: '#04221e',
  },
];

/** Deterministic multi-color song palette derived from song title / ID */
export const getSongPalette = (key: string): SongPalette => {
  let hash = 0;
  const str = key || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % SONG_PALETTES.length;
  return SONG_PALETTES[idx];
};

export interface ThemeColors {
  isDark: boolean;
  bg: string;
  bgSoft: string;
  cardBg: string;
  cardBorder: string;
  cardRaised: string;
  elevatedBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentLight: string;
  pillMintBg: string;
  pillMintText: string;
  pillBlueBg: string;
  pillBlueText: string;
  errorBg: string;
  errorText: string;
  bottomBarBg: string;
  bottomBarBorder: string;
  scrubberTrack: string;
  stroke: string;
  strokeStrong: string;
}

export const getTheme = (isDark: boolean): ThemeColors => {
  if (isDark) {
    // 🌑 Boutique Dark Mode (Warm Espresso / Vinyl Lounge)
    return {
      isDark: true,
      bg: '#16120e',
      bgSoft: '#1d1712',
      cardBg: '#241d16',
      cardBorder: 'rgba(245, 237, 225, 0.08)',
      cardRaised: '#2a2119',
      elevatedBg: '#2a2119',
      textPrimary: '#f5ede1',
      textSecondary: '#cabfae',
      textMuted: '#8f8375',
      accent: '#ff8a5f',
      accentLight: 'rgba(255, 138, 95, 0.15)',
      pillMintBg: 'rgba(147, 181, 140, 0.12)',
      pillMintText: '#93b58c',
      pillBlueBg: '#2a2119',
      pillBlueText: '#f5ede1',
      errorBg: 'rgba(239, 68, 68, 0.15)',
      errorText: '#f87171',
      bottomBarBg: '#1d1712',
      bottomBarBorder: 'rgba(245, 237, 225, 0.08)',
      scrubberTrack: '#241d16',
      stroke: 'rgba(245, 237, 225, 0.08)',
      strokeStrong: 'rgba(245, 237, 225, 0.16)',
    };
  }

  // ☀️ Boutique Light Mode (Warm Cream / Linen Paper)
  return {
    isDark: false,
    bg: '#F7F4EE',
    bgSoft: '#EFECE4',
    cardBg: '#FFFFFF',
    cardBorder: '#E8E3D8',
    cardRaised: '#F3EFE7',
    elevatedBg: '#F3EFE7',
    textPrimary: '#241D16',
    textSecondary: '#6B6053',
    textMuted: '#968C7D',
    accent: '#D97147',
    accentLight: 'rgba(217, 113, 71, 0.10)',
    pillMintBg: '#EAF5E8',
    pillMintText: '#3B6B33',
    pillBlueBg: '#EFECE4',
    pillBlueText: '#241D16',
    errorBg: 'rgba(239, 68, 68, 0.08)',
    errorText: '#DC2626',
    bottomBarBg: '#FFFFFF',
    bottomBarBorder: '#E8E3D8',
    scrubberTrack: '#E8E3D8',
    stroke: '#E8E3D8',
    strokeStrong: '#D6D0C3',
  };
};

export const getAvatarColors = (name: string, isDark: boolean) => {
  let hash = 0;
  for (let i = 0; i < (name || 'User').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const palettes = isDark
    ? [
        { bg: '#ff8a5f', text: '#2a1509' }, // Coral
        { bg: '#e8c468', text: '#2a2109' }, // Gold
        { bg: '#93b58c', text: '#142612' }, // Sage
        { bg: '#a78bfa', text: '#1e1035' }, // Lavender
        { bg: '#fb7185', text: '#2e0b14' }, // Rose
        { bg: '#38bdf8', text: '#082536' }, // Sky
      ]
    : [
        { bg: '#FFD7C7', text: '#8A3B18' }, // Coral
        { bg: '#FDE68A', text: '#78350F' }, // Gold
        { bg: '#DCFCE7', text: '#166534' }, // Sage
        { bg: '#EDE9FE', text: '#5B21B6' }, // Lavender
        { bg: '#FFE4E6', text: '#9F1239' }, // Rose
        { bg: '#E0F2FE', text: '#075985' }, // Sky
      ];

  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
};
