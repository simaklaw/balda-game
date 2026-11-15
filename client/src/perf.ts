/**
 * Performance optimization module for detecting device capabilities
 * and adjusting rendering settings accordingly.
 */

/**
 * Performance configuration for PixiJS application
 */
export interface PerformanceConfig {
  /** Enable antialiasing */
  antialias: boolean;
  /** Device pixel ratio multiplier (capped) */
  resolution: number;
  /** Auto-adjust density */
  autoDensity: boolean;
  /** Use texture atlas for batching */
  useTextureAtlas: boolean;
  /** Reduce motion for low-end devices */
  reduceMotion: boolean;
}

/**
 * Device information for performance detection
 */
export interface DeviceInfo {
  isMobile: boolean;
  isLowEnd: boolean;
  isLandscape: boolean;
  devicePixelRatio: number;
  width: number;
  height: number;
  memory: number | null;
  hardwareConcurrency: number | null;
}

/**
 * Cached device info
 */
let deviceInfoCache: DeviceInfo | null = null;

/**
 * Get current device information
 */
export function getDeviceInfo(): DeviceInfo {
  if (deviceInfoCache !== null) return deviceInfoCache;

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const devicePixelRatio = window.devicePixelRatio || 1;

  // Detect low-end devices
  let isLowEnd = false;

  if (isMobile) {
    const totalMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    const hardwareConcurrency = navigator.hardwareConcurrency || 0;

    // Low-end mobile criteria:
    // - <= 2GB RAM
    // - <= 2 CPU cores
    // - Low device pixel ratio on small screens
    if (totalMemory !== undefined && totalMemory <= 2) {
      isLowEnd = true;
    } else if (hardwareConcurrency <= 2) {
      isLowEnd = true;
    } else if (devicePixelRatio < 2 && width <= 720) {
      isLowEnd = true;
    }

    // Specific low-end device detection
    const lowEndDevices = [
      'SM-A', // Samsung Galaxy A series (budget)
      'SM-J', // Samsung Galaxy J series (budget)
      'Redmi',
      'Moto',
      'Infinix',
      'Tecno',
      'Nokia',
      'HUAWEI Y',
      'Galaxy A0',
      'Galaxy M0',
    ];

    const userAgent = navigator.userAgent;
    for (const device of lowEndDevices) {
      if (userAgent.includes(device)) {
        isLowEnd = true;
        break;
      }
    }
  } else {
    // Desktop low-end criteria
    const hardwareConcurrency = navigator.hardwareConcurrency || 0;
    if (hardwareConcurrency <= 2) {
      isLowEnd = true;
    }
  }

  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
  const hardwareConcurrency = navigator.hardwareConcurrency ?? null;

  deviceInfoCache = {
    isMobile,
    isLowEnd,
    isLandscape,
    devicePixelRatio,
    width,
    height,
    memory,
    hardwareConcurrency,
  };

  return deviceInfoCache;
}

/**
 * Get performance configuration based on device capabilities
 */
export function getPerformanceConfig(): PerformanceConfig {
  const info = getDeviceInfo();

  // For low-end devices: disable antialias, lower resolution, disable texture atlas
  if (info.isLowEnd) {
    return {
      antialias: false,
      resolution: Math.min(info.devicePixelRatio, 1.5),
      autoDensity: true,
      useTextureAtlas: false,
      reduceMotion: true,
    };
  }

  // For mobile devices (not low-end): moderate settings
  if (info.isMobile) {
    return {
      antialias: true,
      resolution: Math.min(info.devicePixelRatio, 2),
      autoDensity: true,
      useTextureAtlas: true,
      reduceMotion: false,
    };
  }

  // Desktop: best quality
  return {
    antialias: true,
    resolution: Math.min(info.devicePixelRatio, 2),
    autoDensity: true,
    useTextureAtlas: true,
    reduceMotion: false,
  };
}

/**
 * Check if device is in landscape orientation
 */
export function isLandscape(): boolean {
  return getDeviceInfo().isLandscape;
}

/**
 * Check if device is low-end
 */
export function isLowEndDevice(): boolean {
  return getDeviceInfo().isLowEnd;
}

/**
 * Check if motion should be reduced
 */
export function shouldReduceMotion(): boolean {
  return getPerformanceConfig().reduceMotion;
}

/**
 * Invalidate cached device info (call on resize)
 */
export function invalidateDeviceInfo(): void {
  deviceInfoCache = null;
}

/**
 * Handler for window resize
 */
export function onResize(): void {
  invalidateDeviceInfo();
}
