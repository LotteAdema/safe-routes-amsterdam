export type ReportLite = {
  id: string;
  type: 'acute' | 'environmental';
  severity: 'low' | 'medium' | 'high';
  reportedAt: Date;
  distanceMeters: number;
  summary: string;
  /** 0..1 — share of "yes" responses to "did you feel this too?" */
  agreeRatio: number;
};

export type ScoredReport = ReportLite & { score: number };

export type ScoreResult = {
  /** Lower is safer. Already normalized by route length. */
  safetyScore: number;
  scored: ScoredReport[];
};

const SEVERITY_W: Record<ReportLite['severity'], number> = { low: 1, medium: 3, high: 10 };
const TYPE_W: Record<ReportLite['type'], number> = { environmental: 1, acute: 4 };

/** Acute: half-life ≈ 50h (e^(-72/72) = 0.37). Environmental: never decays. */
function timeDecay(report: ReportLite, now: Date): number {
  if (report.type === 'environmental') return 1.0;
  const hours = (now.getTime() - report.reportedAt.getTime()) / 3_600_000;
  return Math.exp(-hours / 72);
}

/** 1 / (1 + (d/30)^2) — falloff with distance, smooth, 1.0 at 0m, 0.5 at 30m. */
function distanceFalloff(distanceMeters: number): number {
  const x = distanceMeters / 30;
  return 1 / (1 + x * x);
}

export function scoreReports(args: {
  nearby: ReportLite[];
  routeLengthKm: number;
  now?: Date;
}): ScoreResult {
  const now = args.now ?? new Date();
  const scored: ScoredReport[] = args.nearby.map((r) => {
    const base = SEVERITY_W[r.severity] * TYPE_W[r.type];
    const decay = timeDecay(r, now);
    const dist = distanceFalloff(r.distanceMeters);
    const fb = 1 + 0.5 * r.agreeRatio;
    return { ...r, score: base * decay * dist * fb };
  });
  const sum = scored.reduce((acc, s) => acc + s.score, 0);
  const safetyScore = args.routeLengthKm > 0 ? sum / args.routeLengthKm : sum;
  return { safetyScore, scored };
}
