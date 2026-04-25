import type { RouteStep } from '@/lib/routing/google-directions';

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  if (meters >= 200) return `${Math.round(meters / 100) * 100} m`;
  return `${Math.round(meters / 10) * 10} m`;
}

export function remainingDistance(steps: RouteStep[], fromIdx: number): number {
  return steps.slice(fromIdx).reduce((sum, s) => sum + s.distanceM, 0);
}
