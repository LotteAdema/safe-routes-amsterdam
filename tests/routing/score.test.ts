import { describe, it, expect } from 'vitest';
import { scoreReports, type ReportLite } from '@/lib/routing/score';

const now = new Date('2026-04-25T12:00:00Z');
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe('scoreReports', () => {
  it('returns 0 when no reports are nearby', () => {
    const result = scoreReports({ nearby: [], routeLengthKm: 1.5, now });
    expect(result.safetyScore).toBe(0);
    expect(result.scored).toHaveLength(0);
  });

  it('weights acute-high reports more than environmental-low', () => {
    const acute: ReportLite = {
      id: 'a',
      type: 'acute',
      severity: 'high',
      reportedAt: minutesAgo(60),
      distanceMeters: 10,
      summary: 'followed',
      agreeRatio: 0,
    };
    const env: ReportLite = {
      id: 'e',
      type: 'environmental',
      severity: 'low',
      reportedAt: minutesAgo(60),
      distanceMeters: 10,
      summary: 'dim',
      agreeRatio: 0,
    };
    const r = scoreReports({ nearby: [acute, env], routeLengthKm: 1, now });
    const ac = r.scored.find((s) => s.id === 'a')!;
    const en = r.scored.find((s) => s.id === 'e')!;
    expect(ac.score).toBeGreaterThan(en.score * 5);
  });

  it('decays acute reports over time but not environmental', () => {
    const fresh: ReportLite = {
      id: 'f',
      type: 'acute',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const old: ReportLite = {
      ...fresh,
      id: 'o',
      reportedAt: minutesAgo(72 * 60),
    };
    const r = scoreReports({ nearby: [fresh, old], routeLengthKm: 1, now });
    const f = r.scored.find((s) => s.id === 'f')!;
    const o = r.scored.find((s) => s.id === 'o')!;
    expect(o.score).toBeLessThan(f.score / 2);
  });

  it('falls off with distance', () => {
    const close: ReportLite = {
      id: 'c',
      type: 'acute',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 5,
      summary: '',
      agreeRatio: 0,
    };
    const far: ReportLite = {
      ...close,
      id: 'f',
      distanceMeters: 30,
    };
    const r = scoreReports({ nearby: [close, far], routeLengthKm: 1, now });
    const c = r.scored.find((s) => s.id === 'c')!;
    const fr = r.scored.find((s) => s.id === 'f')!;
    expect(c.score).toBeGreaterThan(fr.score);
  });

  it('amplifies score when feedback agrees', () => {
    const noFeedback: ReportLite = {
      id: 'n',
      type: 'environmental',
      severity: 'medium',
      reportedAt: minutesAgo(0),
      distanceMeters: 10,
      summary: '',
      agreeRatio: 0,
    };
    const agreed: ReportLite = { ...noFeedback, id: 'a', agreeRatio: 1.0 };
    const r = scoreReports({ nearby: [noFeedback, agreed], routeLengthKm: 1, now });
    const n = r.scored.find((s) => s.id === 'n')!;
    const a = r.scored.find((s) => s.id === 'a')!;
    expect(a.score).toBeCloseTo(n.score * 1.5, 5);
  });

  it('normalizes by route length', () => {
    const reports: ReportLite[] = [
      {
        id: 'r',
        type: 'acute',
        severity: 'high',
        reportedAt: minutesAgo(0),
        distanceMeters: 10,
        summary: '',
        agreeRatio: 0,
      },
    ];
    const short = scoreReports({ nearby: reports, routeLengthKm: 1, now });
    const long = scoreReports({ nearby: reports, routeLengthKm: 5, now });
    expect(long.safetyScore).toBeCloseTo(short.safetyScore / 5, 5);
  });
});
