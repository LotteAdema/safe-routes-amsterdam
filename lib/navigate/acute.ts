const TEN_MIN_MS = 10 * 60 * 1000;

export type AcuteReportLike = {
  id: string;
  severity: string;
  type: string;
  reported_at: string;
};

export function isNewHighAcute(report: AcuteReportLike, knownIds: Set<string>): boolean {
  return (
    report.severity === 'high' &&
    report.type === 'acute' &&
    Date.now() - new Date(report.reported_at).getTime() < TEN_MIN_MS &&
    !knownIds.has(report.id)
  );
}
