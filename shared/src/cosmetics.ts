/**
 * Cosmetics system for Balda game
 * Themes, tiles, titles, and frames for player customization
 */

/**
 * Available theme types
 */
export type ThemeType = 'light' | 'dark' | 'blue' | 'green' | 'purple' | 'gold';

/**
 * Theme definition
 */
export interface Theme {
  id: ThemeType;
  name: string;
  backgroundColor: string;
  boardColor: string;
  cellColor: string;
  cellBorderColor: string;
  textColor: string;
  highlightColor: string;
  isPremium: boolean;
}

/**
 * Available tile types
 */
export type TileType = 'wood' | 'stone' | 'metal' | 'glass' | 'marble' | 'crystal';

/**
 * Tile skin definition
 */
export interface TileSkin {
  id: TileType;
  name: string;
  texture: string | null;
  color: string;
  borderColor: string;
  borderWidth: number;
  isPremium: boolean;
}

/**
 * Available title types
 */
export type TitleType = 'novice' | 'apprentice' | 'master' | 'grandmaster' | 'champion' | 'legend';

/**
 * Player title definition
 */
export interface PlayerTitle {
  id: TitleType;
  name: string;
  description: string;
  minRating: number;
  icon: string | null;
}

/**
 * Available frame types
 */
export type FrameType = 'none' | 'simple' | 'elegant' | 'royal' | 'diamond' | 'platinum';

/**
 * Player frame definition
 */
export interface PlayerFrame {
  id: FrameType;
  name: string;
  borderColor: string;
  borderWidth: number;
  glowColor: string | null;
  isPremium: boolean;
}

/**
 * Player cosmetics profile
 */
export interface CosmeticsProfile {
  theme: ThemeType;
  tileSkin: TileType;
  title: TitleType;
  frame: FrameType;
  unlockedThemes: ThemeType[];
  unlockedTiles: TileType[];
  unlockedTitles: TitleType[];
  unlockedFrames: FrameType[];
}

/**
 * Default themes
 */
export const DEFAULT_THEMES: Record<ThemeType, Theme> = {
  light: {
    id: 'light',
    name: 'Светлая',
    backgroundColor: '#f5f5f5',
    boardColor: '#ffffff',
    cellColor: '#e8f4f8',
    cellBorderColor: '#a0d8f3',
    textColor: '#1a1a2e',
    highlightColor: '#4cc9f0',
    isPremium: false,
  },
  dark: {
    id: 'dark',
    name: 'Тёмная',
    backgroundColor: '#1a1a2e',
    boardColor: '#16213e',
    cellColor: '#0f3460',
    cellBorderColor: '#e94560',
    textColor: '#f8f9fa',
    highlightColor: '#ff6b6b',
    isPremium: false,
  },
  blue: {
    id: 'blue',
    name: 'Голубая',
    backgroundColor: '#e6f7ff',
    boardColor: '#bae7ff',
    cellColor: '#91d5ff',
    cellBorderColor: '#69c0ff',
    textColor: '#002140',
    highlightColor: '#1890ff',
    isPremium: false,
  },
  green: {
    id: 'green',
    name: 'Зелёная',
    backgroundColor: '#f0fff4',
    boardColor: '#dcfce7',
    cellColor: '#bbf7d0',
    cellBorderColor: '#86e8a8',
    textColor: '#142818',
    highlightColor: '#22c55e',
    isPremium: true,
  },
  purple: {
    id: 'purple',
    name: 'Фиолетовая',
    backgroundColor: '#f5f3ff',
    boardColor: '#ede9fe',
    cellColor: '#ddd6fe',
    cellBorderColor: '#c4b5fd',
    textColor: '#3730a3',
    highlightColor: '#a855f7',
    isPremium: true,
  },
  gold: {
    id: 'gold',
    name: 'Золотая',
    backgroundColor: '#fffbeb',
    boardColor: '#fef3c7',
    cellColor: '#fde68a',
    cellBorderColor: '#f59e0b',
    textColor: '#78350f',
    highlightColor: '#d97706',
    isPremium: true,
  },
};

/**
 * Default tile skins
 */
export const DEFAULT_TILE_SKINS: Record<TileType, TileSkin> = {
  wood: {
    id: 'wood',
    name: 'Дерево',
    texture: 'wood',
    color: '#deb887',
    borderColor: '#8b4513',
    borderWidth: 2,
    isPremium: false,
  },
  stone: {
    id: 'stone',
    name: 'Камень',
    texture: 'stone',
    color: '#808080',
    borderColor: '#696969',
    borderWidth: 2,
    isPremium: false,
  },
  metal: {
    id: 'metal',
    name: 'Металл',
    texture: 'metal',
    color: '#c0c0c0',
    borderColor: '#808080',
    borderWidth: 1,
    isPremium: true,
  },
  glass: {
    id: 'glass',
    name: 'Стекло',
    texture: 'glass',
    color: '#e0ffff',
    borderColor: '#00ced1',
    borderWidth: 1,
    isPremium: true,
  },
  marble: {
    id: 'marble',
    name: 'Мрамор',
    texture: 'marble',
    color: '#f8f8ff',
    borderColor: '#d8bfd8',
    borderWidth: 2,
    isPremium: true,
  },
  crystal: {
    id: 'crystal',
    name: 'Кристалл',
    texture: 'crystal',
    color: '#e6e6fa',
    borderColor: '#9370db',
    borderWidth: 2,
    isPremium: true,
  },
};

/**
 * Default player titles
 */
export const DEFAULT_TITLES: Record<TitleType, PlayerTitle> = {
  novice: {
    id: 'novice',
    name: 'Новичок',
    description: 'Начало пути',
    minRating: 0,
    icon: null,
  },
  apprentice: {
    id: 'apprentice',
    name: 'Ученик',
    description: 'Первые успехи',
    minRating: 500,
    icon: null,
  },
  master: {
    id: 'master',
    name: 'Мастер',
    description: 'Опытный игрок',
    minRating: 1200,
    icon: null,
  },
  grandmaster: {
    id: 'grandmaster',
    name: 'Гроссмейстер',
    description: 'Эксперт игры',
    minRating: 1800,
    icon: null,
  },
  champion: {
    id: 'champion',
    name: 'Чемпион',
    description: 'Победитель турниров',
    minRating: 2200,
    icon: null,
  },
  legend: {
    id: 'legend',
    name: 'Легенда',
    description: 'Живая легенда Балды',
    minRating: 2500,
    icon: null,
  },
};

/**
 * Default player frames
 */
export const DEFAULT_FRAMES: Record<FrameType, PlayerFrame> = {
  none: {
    id: 'none',
    name: 'Нет рамки',
    borderColor: 'transparent',
    borderWidth: 0,
    glowColor: null,
    isPremium: false,
  },
  simple: {
    id: 'simple',
    name: 'Простая',
    borderColor: '#808080',
    borderWidth: 2,
    glowColor: null,
    isPremium: false,
  },
  elegant: {
    id: 'elegant',
    name: 'Элегантная',
    borderColor: '#c0c0c0',
    borderWidth: 3,
    glowColor: null,
    isPremium: true,
  },
  royal: {
    id: 'royal',
    name: 'Королевская',
    borderColor: '#ffd700',
    borderWidth: 4,
    glowColor: '#ffd700',
    isPremium: true,
  },
  diamond: {
    id: 'diamond',
    name: 'Алмазная',
    borderColor: '#00bfff',
    borderWidth: 3,
    glowColor: '#00bfff',
    isPremium: true,
  },
  platinum: {
    id: 'platinum',
    name: 'Платиновая',
    borderColor: '#e5e4e2',
    borderWidth: 4,
    glowColor: '#ffffff',
    isPremium: true,
  },
};

/**
 * Default cosmetics profile
 */
export const DEFAULT_COSMETICS_PROFILE: CosmeticsProfile = {
  theme: 'light',
  tileSkin: 'wood',
  title: 'novice',
  frame: 'none',
  unlockedThemes: ['light', 'dark', 'blue'],
  unlockedTiles: ['wood', 'stone'],
  unlockedTitles: ['novice'],
  unlockedFrames: ['none', 'simple'],
};

/**
 * Cosmetics manager
 */
export class CosmeticsManager {
  private profile: CosmeticsProfile;

  constructor(profile: Partial<CosmeticsProfile> = {}) {
    this.profile = { ...DEFAULT_COSMETICS_PROFILE, ...profile };
  }

  /**
   * Get current theme
   */
  getTheme(): Theme {
    return DEFAULT_THEMES[this.profile.theme];
  }

  /**
   * Get current tile skin
   */
  getTileSkin(): TileSkin {
    return DEFAULT_TILE_SKINS[this.profile.tileSkin];
  }

  /**
   * Get current title
   */
  getTitle(): PlayerTitle {
    return DEFAULT_TITLES[this.profile.title];
  }

  /**
   * Get current frame
   */
  getFrame(): PlayerFrame {
    return DEFAULT_FRAMES[this.profile.frame];
  }

  /**
   * Get full profile
   */
  getProfile(): CosmeticsProfile {
    return { ...this.profile };
  }

  /**
   * Set theme
   */
  setTheme(theme: ThemeType): boolean {
    if (this.profile.unlockedThemes.includes(theme)) {
      this.profile.theme = theme;
      return true;
    }
    return false;
  }

  /**
   * Set tile skin
   */
  setTileSkin(tile: TileType): boolean {
    if (this.profile.unlockedTiles.includes(tile)) {
      this.profile.tileSkin = tile;
      return true;
    }
    return false;
  }

  /**
   * Set title (only if rating allows)
   */
  setTitle(title: TitleType, rating: number): boolean {
    const titleDef = DEFAULT_TITLES[title];
    if (this.profile.unlockedTitles.includes(title) && rating >= titleDef.minRating) {
      this.profile.title = title;
      return true;
    }
    return false;
  }

  /**
   * Set frame
   */
  setFrame(frame: FrameType): boolean {
    if (this.profile.unlockedFrames.includes(frame)) {
      this.profile.frame = frame;
      return true;
    }
    return false;
  }

  /**
   * Unlock theme
   */
  unlockTheme(theme: ThemeType): void {
    if (!this.profile.unlockedThemes.includes(theme)) {
      this.profile.unlockedThemes.push(theme);
    }
  }

  /**
   * Unlock tile skin
   */
  unlockTile(tile: TileType): void {
    if (!this.profile.unlockedTiles.includes(tile)) {
      this.profile.unlockedTiles.push(tile);
    }
  }

  /**
   * Unlock title
   */
  unlockTitle(title: TitleType): void {
    if (!this.profile.unlockedTitles.includes(title)) {
      this.profile.unlockedTitles.push(title);
    }
  }

  /**
   * Unlock frame
   */
  unlockFrame(frame: FrameType): void {
    if (!this.profile.unlockedFrames.includes(frame)) {
      this.profile.unlockedFrames.push(frame);
    }
  }

  /**
   * Get available themes
   */
  getAvailableThemes(): Theme[] {
    return this.profile.unlockedThemes.map((id) => DEFAULT_THEMES[id]);
  }

  /**
   * Get available tile skins
   */
  getAvailableTiles(): TileSkin[] {
    return this.profile.unlockedTiles.map((id) => DEFAULT_TILE_SKINS[id]);
  }

  /**
   * Get available titles
   */
  getAvailableTitles(): PlayerTitle[] {
    return this.profile.unlockedTitles.map((id) => DEFAULT_TITLES[id]);
  }

  /**
   * Get available frames
   */
  getAvailableFrames(): PlayerFrame[] {
    return this.profile.unlockedFrames.map((id) => DEFAULT_FRAMES[id]);
  }

  /**
   * Get title by rating
   */
  getTitleByRating(rating: number): TitleType {
    const titles = Object.values(DEFAULT_TITLES)
      .sort((a, b) => b.minRating - a.minRating)
      .find((t) => rating >= t.minRating);
    return titles?.id ?? 'novice';
  }

  /**
   * Update titles based on rating
   */
  updateTitlesByRating(rating: number): void {
    const newTitle = this.getTitleByRating(rating);
    if (newTitle !== this.profile.title) {
      this.profile.title = newTitle;
    }

    // Auto-unlock titles based on rating
    for (const titleId of Object.keys(DEFAULT_TITLES) as TitleType[]) {
      const title = DEFAULT_TITLES[titleId];
      if (rating >= title.minRating && !this.profile.unlockedTitles.includes(titleId)) {
        this.profile.unlockedTitles.push(titleId);
      }
    }
  }

  /**
   * Export profile for storage
   */
  export(): CosmeticsProfile {
    return { ...this.profile };
  }

  /**
   * Import profile from storage
   */
  import(data: Partial<CosmeticsProfile>): void {
    this.profile = { ...this.profile, ...data };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.profile = { ...DEFAULT_COSMETICS_PROFILE };
  }
}

/**
 * Create a new cosmetics manager
 */
export function createCosmeticsManager(profile?: Partial<CosmeticsProfile>): CosmeticsManager {
  return new CosmeticsManager(profile);
}
