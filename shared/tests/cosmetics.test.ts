import { describe, it, expect, beforeEach } from 'vitest';
import {
  CosmeticsManager,
  createCosmeticsManager,
  DEFAULT_COSMETICS_PROFILE,
  DEFAULT_THEMES,
  DEFAULT_TILE_SKINS,
  DEFAULT_TITLES,
  DEFAULT_FRAMES,
  type ThemeType,
  type TileType,
  type TitleType,
  type FrameType,
} from '../src/cosmetics';

describe('cosmetics', () => {
  describe('CosmeticsManager', () => {
    let manager: CosmeticsManager;

    beforeEach(() => {
      manager = createCosmeticsManager();
    });

    describe('constructor', () => {
      it('creates with default profile', () => {
        expect(manager).toBeInstanceOf(CosmeticsManager);
        const profile = manager.getProfile();
        expect(profile.theme).toBe(DEFAULT_COSMETICS_PROFILE.theme);
        expect(profile.tileSkin).toBe(DEFAULT_COSMETICS_PROFILE.tileSkin);
        expect(profile.title).toBe(DEFAULT_COSMETICS_PROFILE.title);
        expect(profile.frame).toBe(DEFAULT_COSMETICS_PROFILE.frame);
      });

      it('accepts custom profile', () => {
        const customManager = createCosmeticsManager({
          theme: 'dark',
          tileSkin: 'stone',
        });
        expect(customManager.getProfile().theme).toBe('dark');
        expect(customManager.getProfile().tileSkin).toBe('stone');
      });
    });

    describe('getTheme', () => {
      it('returns current theme', () => {
        const theme = manager.getTheme();
        expect(theme).toEqual(DEFAULT_THEMES.light);
      });

      it('returns theme by id', () => {
        manager.setTheme('dark');
        const theme = manager.getTheme();
        expect(theme).toEqual(DEFAULT_THEMES.dark);
      });
    });

    describe('getTileSkin', () => {
      it('returns current tile skin', () => {
        const tile = manager.getTileSkin();
        expect(tile).toEqual(DEFAULT_TILE_SKINS.wood);
      });

      it('returns tile skin by id', () => {
        manager.setTileSkin('stone');
        const tile = manager.getTileSkin();
        expect(tile).toEqual(DEFAULT_TILE_SKINS.stone);
      });
    });

    describe('getTitle', () => {
      it('returns current title', () => {
        const title = manager.getTitle();
        expect(title).toEqual(DEFAULT_TITLES.novice);
      });

      it('returns title by id', () => {
        manager.unlockTitle('apprentice');
        manager.setTitle('apprentice', 1000);
        const title = manager.getTitle();
        expect(title).toEqual(DEFAULT_TITLES.apprentice);
      });
    });

    describe('getFrame', () => {
      it('returns current frame', () => {
        const frame = manager.getFrame();
        expect(frame).toEqual(DEFAULT_FRAMES.none);
      });

      it('returns frame by id', () => {
        manager.setFrame('simple');
        const frame = manager.getFrame();
        expect(frame).toEqual(DEFAULT_FRAMES.simple);
      });
    });

    describe('setTheme', () => {
      it('sets theme if unlocked', () => {
        const result = manager.setTheme('blue');
        expect(result).toBe(true);
        expect(manager.getProfile().theme).toBe('blue');
      });

      it('fails to set locked theme', () => {
        const result = manager.setTheme('gold');
        expect(result).toBe(false);
        expect(manager.getProfile().theme).toBe('light');
      });
    });

    describe('setTileSkin', () => {
      it('sets tile skin if unlocked', () => {
        const result = manager.setTileSkin('stone');
        expect(result).toBe(true);
        expect(manager.getProfile().tileSkin).toBe('stone');
      });

      it('fails to set locked tile skin', () => {
        const result = manager.setTileSkin('crystal');
        expect(result).toBe(false);
        expect(manager.getProfile().tileSkin).toBe('wood');
      });
    });

    describe('setTitle', () => {
      it('sets title if unlocked and rating sufficient', () => {
        manager.unlockTitle('apprentice');
        const result = manager.setTitle('apprentice', 1000);
        expect(result).toBe(true);
        expect(manager.getProfile().title).toBe('apprentice');
      });

      it('fails to set title if rating insufficient', () => {
        manager.unlockTitle('master');
        const result = manager.setTitle('master', 1000);
        expect(result).toBe(false);
        expect(manager.getProfile().title).toBe('novice');
      });

      it('fails to set locked title', () => {
        const result = manager.setTitle('champion', 3000);
        expect(result).toBe(false);
      });
    });

    describe('setFrame', () => {
      it('sets frame if unlocked', () => {
        const result = manager.setFrame('simple');
        expect(result).toBe(true);
        expect(manager.getProfile().frame).toBe('simple');
      });

      it('fails to set locked frame', () => {
        const result = manager.setFrame('diamond');
        expect(result).toBe(false);
        expect(manager.getProfile().frame).toBe('none');
      });
    });

    describe('unlock methods', () => {
      it('unlocks theme', () => {
        manager.unlockTheme('green');
        expect(manager.getProfile().unlockedThemes).toContain('green');
      });

      it('unlocks tile skin', () => {
        manager.unlockTile('metal');
        expect(manager.getProfile().unlockedTiles).toContain('metal');
      });

      it('unlocks title', () => {
        manager.unlockTitle('master');
        expect(manager.getProfile().unlockedTitles).toContain('master');
      });

      it('unlocks frame', () => {
        manager.unlockFrame('royal');
        expect(manager.getProfile().unlockedFrames).toContain('royal');
      });

      it('does not duplicate unlocks', () => {
        manager.unlockTheme('blue');
        manager.unlockTheme('blue');
        const count = manager.getProfile().unlockedThemes.filter((t) => t === 'blue').length;
        expect(count).toBe(1);
      });
    });

    describe('getAvailable methods', () => {
      it('returns available themes', () => {
        const themes = manager.getAvailableThemes();
        expect(themes.length).toBeGreaterThanOrEqual(2);
        expect(themes.map((t) => t.id)).toContain('light');
      });

      it('returns available tiles', () => {
        const tiles = manager.getAvailableTiles();
        expect(tiles.length).toBeGreaterThanOrEqual(1);
        expect(tiles.map((t) => t.id)).toContain('wood');
      });

      it('returns available titles', () => {
        const titles = manager.getAvailableTitles();
        expect(titles.length).toBeGreaterThanOrEqual(1);
        expect(titles.map((t) => t.id)).toContain('novice');
      });

      it('returns available frames', () => {
        const frames = manager.getAvailableFrames();
        expect(frames.length).toBeGreaterThanOrEqual(1);
        expect(frames.map((t) => t.id)).toContain('none');
      });
    });

    describe('getTitleByRating', () => {
      it('returns novice for low rating', () => {
        const title = manager.getTitleByRating(0);
        expect(title).toBe('novice');
      });

      it('returns apprentice for medium rating', () => {
        const title = manager.getTitleByRating(600);
        expect(title).toBe('apprentice');
      });

      it('returns master for higher rating', () => {
        const title = manager.getTitleByRating(1500);
        expect(title).toBe('master');
      });

      it('returns grandmaster for high rating', () => {
        const title = manager.getTitleByRating(2000);
        expect(title).toBe('grandmaster');
      });

      it('returns champion for very high rating', () => {
        const title = manager.getTitleByRating(2300);
        expect(title).toBe('champion');
      });

      it('returns legend for highest rating', () => {
        const title = manager.getTitleByRating(3000);
        expect(title).toBe('legend');
      });
    });

    describe('updateTitlesByRating', () => {
      it('updates title based on rating', () => {
        manager.updateTitlesByRating(1000);
        expect(manager.getProfile().title).toBe('apprentice');
      });

      it('auto-unlocks titles based on rating', () => {
        manager.updateTitlesByRating(2000);
        expect(manager.getProfile().unlockedTitles).toContain('master');
        expect(manager.getProfile().unlockedTitles).toContain('grandmaster');
      });
    });

    describe('export/import', () => {
      it('exports profile', () => {
        const exported = manager.export();
        expect(exported).toEqual(manager.getProfile());
      });

      it('imports profile', () => {
        manager.import({ theme: 'dark', tileSkin: 'stone' });
        expect(manager.getProfile().theme).toBe('dark');
        expect(manager.getProfile().tileSkin).toBe('stone');
      });
    });

    describe('reset', () => {
      it('resets to defaults', () => {
        manager.setTheme('dark');
        manager.setTileSkin('stone');
        manager.unlockTheme('green');
        manager.reset();

        const profile = manager.getProfile();
        expect(profile.theme).toBe(DEFAULT_COSMETICS_PROFILE.theme);
        expect(profile.tileSkin).toBe(DEFAULT_COSMETICS_PROFILE.tileSkin);
        expect(profile.unlockedThemes).toEqual(DEFAULT_COSMETICS_PROFILE.unlockedThemes);
      });
    });
  });

  describe('DEFAULT_THEMES', () => {
    it('has all theme types', () => {
      const themeTypes: ThemeType[] = ['light', 'dark', 'blue', 'green', 'purple', 'gold'];
      themeTypes.forEach((type) => {
        expect(DEFAULT_THEMES[type]).toBeDefined();
        expect(DEFAULT_THEMES[type].id).toBe(type);
      });
    });
  });

  describe('DEFAULT_TILE_SKINS', () => {
    it('has all tile types', () => {
      const tileTypes: TileType[] = ['wood', 'stone', 'metal', 'glass', 'marble', 'crystal'];
      tileTypes.forEach((type) => {
        expect(DEFAULT_TILE_SKINS[type]).toBeDefined();
        expect(DEFAULT_TILE_SKINS[type].id).toBe(type);
      });
    });
  });

  describe('DEFAULT_TITLES', () => {
    it('has all title types', () => {
      const titleTypes: TitleType[] = ['novice', 'apprentice', 'master', 'grandmaster', 'champion', 'legend'];
      titleTypes.forEach((type) => {
        expect(DEFAULT_TITLES[type]).toBeDefined();
        expect(DEFAULT_TITLES[type].id).toBe(type);
      });
    });

    it('has correct minRating progression', () => {
      const titles = Object.values(DEFAULT_TITLES);
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i].minRating).toBeGreaterThan(titles[i - 1].minRating);
      }
    });
  });

  describe('DEFAULT_FRAMES', () => {
    it('has all frame types', () => {
      const frameTypes: FrameType[] = ['none', 'simple', 'elegant', 'royal', 'diamond', 'platinum'];
      frameTypes.forEach((type) => {
        expect(DEFAULT_FRAMES[type]).toBeDefined();
        expect(DEFAULT_FRAMES[type].id).toBe(type);
      });
    });
  });

  describe('DEFAULT_COSMETICS_PROFILE', () => {
    it('has default values', () => {
      expect(DEFAULT_COSMETICS_PROFILE.theme).toBe('light');
      expect(DEFAULT_COSMETICS_PROFILE.tileSkin).toBe('wood');
      expect(DEFAULT_COSMETICS_PROFILE.title).toBe('novice');
      expect(DEFAULT_COSMETICS_PROFILE.frame).toBe('none');
      expect(DEFAULT_COSMETICS_PROFILE.unlockedThemes).toContain('light');
      expect(DEFAULT_COSMETICS_PROFILE.unlockedTiles).toContain('wood');
      expect(DEFAULT_COSMETICS_PROFILE.unlockedTitles).toContain('novice');
      expect(DEFAULT_COSMETICS_PROFILE.unlockedFrames).toContain('none');
    });
  });
});
