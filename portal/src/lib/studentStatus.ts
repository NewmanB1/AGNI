export type StudentStatus = 'on-track' | 'moderate' | 'struggling' | 'unknown';

/** Derive student status from mastery percentage. */
export function computeStatus(masteryPct: number, hasLessons: boolean): StudentStatus {
  if (!hasLessons) return 'unknown';
  if (masteryPct >= 60) return 'on-track';
  if (masteryPct >= 30) return 'moderate';
  return 'struggling';
}

/** Map status to display color. */
export function statusColor(status: string): string {
  if (status === 'on-track') return '#4ade80';
  if (status === 'moderate') return '#ffaa00';
  if (status === 'struggling') return '#ff5252';
  return '#666';
}

/** Map status to a human label; pass `tr` for i18n, omit for English. */
export function statusLabel(status: string, tr?: (key: string) => string): string {
  if (tr) {
    if (status === 'on-track') return tr('status.on_track');
    if (status === 'moderate') return tr('status.moderate');
    if (status === 'struggling') return tr('status.struggling');
  } else {
    if (status === 'on-track') return 'On Track';
    if (status === 'moderate') return 'Moderate';
    if (status === 'struggling') return 'Struggling';
  }
  return 'Unknown';
}

/** Human-friendly "in X days" / "now" / "tomorrow" for review timestamps. */
export function formatDaysUntil(timestamp: number): string {
  const days = Math.ceil((timestamp - Date.now()) / 86400000);
  if (days <= 0) return 'now';
  if (days === 1) return 'tomorrow';
  return 'in ' + days + ' days';
}
