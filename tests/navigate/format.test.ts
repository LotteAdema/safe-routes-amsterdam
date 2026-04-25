import { describe, it, expect } from 'vitest';
import { formatDistance, remainingDistance } from '@/lib/navigate/format';
import type { RouteStep } from '@/lib/routing/google-directions';

describe('formatDistance', () => {
  it('formats meters below 200 to nearest 10', () => {
    expect(formatDistance(84)).toBe('80 m');
    expect(formatDistance(180)).toBe('180 m');
  });

  it('formats meters 200–999 to nearest 100', () => {
    expect(formatDistance(340)).toBe('300 m');
    expect(formatDistance(840)).toBe('800 m');
  });

  it('rounds midpoints up (standard rounding)', () => {
    expect(formatDistance(350)).toBe('400 m');
    expect(formatDistance(95)).toBe('100 m');
  });

  it('formats 1000+ as km with one decimal', () => {
    expect(formatDistance(1200)).toBe('1.2 km');
    expect(formatDistance(5500)).toBe('5.5 km');
  });
});

describe('remainingDistance', () => {
  const steps: RouteStep[] = [
    { instruction: 'a', maneuver: 'straight', distanceM: 100, endLat: 0, endLng: 0 },
    { instruction: 'b', maneuver: 'turn-left', distanceM: 200, endLat: 0, endLng: 0 },
    { instruction: 'c', maneuver: 'straight', distanceM: 50, endLat: 0, endLng: 0 },
  ];

  it('sums all steps from the given index', () => {
    expect(remainingDistance(steps, 0)).toBe(350);
    expect(remainingDistance(steps, 1)).toBe(250);
    expect(remainingDistance(steps, 2)).toBe(50);
  });

  it('returns 0 for an out-of-bounds index', () => {
    expect(remainingDistance(steps, 10)).toBe(0);
  });
});
