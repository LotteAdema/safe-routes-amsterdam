import { describe, it, expect } from 'vitest';
import { isNewHighAcute } from '@/lib/navigate/acute';

const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000 + 1000).toISOString();
const elevenMinutesAgo = new Date(Date.now() - 11 * 60 * 1000).toISOString();

const knownIds = new Set<string>();

describe('isNewHighAcute', () => {
  it('returns true for a fresh high acute report not in known set', () => {
    expect(
      isNewHighAcute({ id: 'a', severity: 'high', type: 'acute', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(true);
  });

  it('returns false if id is already in known set', () => {
    const known = new Set(['a']);
    expect(
      isNewHighAcute({ id: 'a', severity: 'high', type: 'acute', reported_at: tenMinutesAgo }, known),
    ).toBe(false);
  });

  it('returns false if severity is not high', () => {
    expect(
      isNewHighAcute({ id: 'b', severity: 'medium', type: 'acute', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(false);
  });

  it('returns false if type is not acute', () => {
    expect(
      isNewHighAcute({ id: 'c', severity: 'high', type: 'environmental', reported_at: tenMinutesAgo }, knownIds),
    ).toBe(false);
  });

  it('returns false if reported more than 10 minutes ago', () => {
    expect(
      isNewHighAcute({ id: 'd', severity: 'high', type: 'acute', reported_at: elevenMinutesAgo }, knownIds),
    ).toBe(false);
  });
});
