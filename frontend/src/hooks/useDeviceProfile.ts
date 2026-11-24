import { useEffect, useState } from 'react';

import type { BreakpointTier, DeviceOrientation, DeviceProfile } from '../models/ui';

function resolveBreakpoint(width: number): BreakpointTier {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1920) return 'desktop';
  return 'ultrawide';
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '16:9';
  const divisor = gcd(Math.round(width), Math.round(height));
  const w = Math.round(width / divisor);
  const h = Math.round(height / divisor);
  if (w > 32 || h > 32) {
    return `${(width / height).toFixed(2)}:1`;
  }
  return `${w}:${h}`;
}

function readDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') {
    return {
      width: 1440,
      height: 900,
      breakpoint: 'desktop',
      orientation: 'landscape',
      pixelRatio: 1,
      aspectRatio: '16:10',
      isTouch: false,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const orientation: DeviceOrientation = width >= height ? 'landscape' : 'portrait';
  const isTouch =
    'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  return {
    width,
    height,
    breakpoint: resolveBreakpoint(width),
    orientation,
    pixelRatio: Number((window.devicePixelRatio || 1).toFixed(2)),
    aspectRatio: formatAspectRatio(width, height),
    isTouch,
  };
}

export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => readDeviceProfile());

  useEffect(() => {
    const update = () => setProfile(readDeviceProfile());
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return profile;
}
