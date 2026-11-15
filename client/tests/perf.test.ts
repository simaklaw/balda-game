import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDeviceInfo,
  getPerformanceConfig,
  isLandscape,
  isLowEndDevice,
  shouldReduceMotion,
  invalidateDeviceInfo,
} from '../src/perf';

vi.stubGlobal('window', {
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 2,
});

vi.stubGlobal('navigator', {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  hardwareConcurrency: 4,
  maxTouchPoints: 0,
  deviceMemory: 8,
});

describe('perf', () => {
  beforeEach(() => {
    invalidateDeviceInfo();
  });

  describe('getDeviceInfo', () => {
    it('detects desktop device correctly', () => {
      const info = getDeviceInfo();
      expect(info.isMobile).toBe(false);
      expect(info.isLowEnd).toBe(false);
      expect(info.isLandscape).toBe(true);
      expect(info.devicePixelRatio).toBe(2);
      expect(info.width).toBe(1024);
      expect(info.height).toBe(768);
    });

    it('detects portrait orientation', () => {
      vi.stubGlobal('window', {
        innerWidth: 375,
        innerHeight: 812,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      
      const info = getDeviceInfo();
      expect(info.isLandscape).toBe(false);
    });

    it('detects mobile device', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        hardwareConcurrency: 2,
        maxTouchPoints: 5,
        deviceMemory: 4,
      });
      invalidateDeviceInfo();
      
      const info = getDeviceInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isLowEnd).toBe(true);
    });

    it('detects low-end Android device', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Linux; Android 10; SM-A105FN)',
        hardwareConcurrency: 4,
        maxTouchPoints: 5,
        deviceMemory: 2,
      });
      invalidateDeviceInfo();
      
      const info = getDeviceInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isLowEnd).toBe(true);
    });
  });

  describe('getPerformanceConfig', () => {
    it('returns low-end config for mobile', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        hardwareConcurrency: 2,
        maxTouchPoints: 5,
        deviceMemory: 4,
      });
      invalidateDeviceInfo();
      
      const config = getPerformanceConfig();
      expect(config.antialias).toBe(false);
      expect(config.resolution).toBeCloseTo(1.5, 0.1);
      expect(config.reduceMotion).toBe(true);
    });

    it('returns high-end config for desktop', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        deviceMemory: 16,
      });
      vi.stubGlobal('window', {
        innerWidth: 1920,
        innerHeight: 1080,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      
      const config = getPerformanceConfig();
      expect(config.antialias).toBe(true);
      expect(config.resolution).toBe(2);
      expect(config.reduceMotion).toBe(false);
    });
  });

  describe('isLandscape', () => {
    it('returns true for landscape', () => {
      vi.stubGlobal('window', {
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      expect(isLandscape()).toBe(true);
    });

    it('returns false for portrait', () => {
      vi.stubGlobal('window', {
        innerWidth: 375,
        innerHeight: 812,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      expect(isLandscape()).toBe(false);
    });
  });

  describe('isLowEndDevice', () => {
    it('returns false for high-end desktop', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        deviceMemory: 16,
      });
      invalidateDeviceInfo();
      expect(isLowEndDevice()).toBe(false);
    });

    it('returns true for low-end mobile', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        hardwareConcurrency: 2,
        maxTouchPoints: 5,
        deviceMemory: 4,
      });
      invalidateDeviceInfo();
      expect(isLowEndDevice()).toBe(true);
    });
  });

  describe('shouldReduceMotion', () => {
    it('returns true for low-end device', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
        hardwareConcurrency: 2,
        maxTouchPoints: 5,
        deviceMemory: 4,
      });
      invalidateDeviceInfo();
      expect(shouldReduceMotion()).toBe(true);
    });

    it('returns false for high-end device', () => {
      vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        deviceMemory: 16,
      });
      vi.stubGlobal('window', {
        innerWidth: 1920,
        innerHeight: 1080,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      expect(shouldReduceMotion()).toBe(false);
    });
  });

  describe('invalidateDeviceInfo', () => {
    it('clears cached device info', () => {
      vi.stubGlobal('window', {
        innerWidth: 1024,
        innerHeight: 768,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      const info1 = getDeviceInfo();
      vi.stubGlobal('window', {
        innerWidth: 2048,
        innerHeight: 1536,
        devicePixelRatio: 2,
      });
      invalidateDeviceInfo();
      const info2 = getDeviceInfo();
      expect(info1.width).toBe(1024);
      expect(info2.width).toBe(2048);
    });
  });
});
