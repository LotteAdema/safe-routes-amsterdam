import { describe, it, expect } from 'vitest';
import { decodePolyline } from '@/lib/routing/decode-polyline';

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    // Google docs example: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" → 3 points
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual([38.5, -120.2]);
    expect(points[1]).toEqual([40.7, -120.95]);
    expect(points[2]).toEqual([43.252, -126.453]);
  });

  it('returns empty for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
