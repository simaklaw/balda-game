import { describe, it, expect, vi } from 'vitest';
import { safeInsets, parseInset } from '../src/ui/safeArea';

describe('safeArea - landscape', () => {
  describe('parseInset', () => {
    it('parses pixel values', () => {
      expect(parseInset('12px')).toBe(12);
    });

    it('parses zero', () => {
      expect(parseInset('0px')).toBe(0);
    });

    it('returns 0 for empty string', () => {
      expect(parseInset('')).toBe(0);
    });

    it('returns 0 for calc expressions', () => {
      expect(parseInset('calc(100% - 10px)')).toBe(0);
    });

    it('returns 0 for env expressions', () => {
      expect(parseInset('env(safe-area-inset-top, 0px)')).toBe(0);
    });

    it('returns 0 for negative values', () => {
      expect(parseInset('-5px')).toBe(0);
    });

    it('parses decimal values', () => {
      expect(parseInset('16.5px')).toBe(16.5);
    });
  });

  describe('safeInsets', () => {
    it('reads inset values from computed style', () => {
      const mockStyle = {
        getPropertyValue: (prop: string): string => {
          const values: Record<string, string> = {
            '--safe-top': '12px',
            '--safe-bottom': '20px',
            '--safe-left': '0px',
            '--safe-right': '0px',
          };
          return values[prop] ?? '';
        },
      };
      
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => mockStyle);
      
      const insets = safeInsets();
      expect(insets.top).toBe(12);
      expect(insets.bottom).toBe(20);
      expect(insets.left).toBe(0);
      expect(insets.right).toBe(0);
    });

    it('returns zero insets when no values set', () => {
      const mockStyle = {
        getPropertyValue: () => '',
      };
      
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => mockStyle);
      
      const insets = safeInsets();
      expect(insets.top).toBe(0);
      expect(insets.bottom).toBe(0);
      expect(insets.left).toBe(0);
      expect(insets.right).toBe(0);
    });

    it('returns zero insets on error', () => {
      vi.stubGlobal('document', {
        documentElement: {},
      });
      vi.stubGlobal('getComputedStyle', () => {
        throw new Error('No document');
      });
      
      const insets = safeInsets();
      expect(insets.top).toBe(0);
      expect(insets.bottom).toBe(0);
      expect(insets.left).toBe(0);
      expect(insets.right).toBe(0);
    });
  });
});
