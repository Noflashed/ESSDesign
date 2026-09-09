// Derived from ESSApp/src/utils/scaffoldLifecycle.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export type ScaffoldLifecycleStatus = 'awaiting-qr' | 'active' | 'dismantled';

export type ScaffoldLifecycleSource = {
  status?: ScaffoldLifecycleStatus | string;
  activatedAt?: string;
  dismantledAt?: string;
};

export type ScaffoldLifecycle = {
  status: ScaffoldLifecycleStatus;
  startedAt: string;
  stoppedAt: string;
};

function validTimestamp(value?: string): string {
  const trimmed = value?.trim() || '';
  return trimmed && Number.isFinite(Date.parse(trimmed)) ? trimmed : '';
}

export function resolveScaffoldLifecycle(
  source?: ScaffoldLifecycleSource | null,
  qrAssignedAt?: string,
): ScaffoldLifecycle {
  const startedAt = validTimestamp(source?.activatedAt) || validTimestamp(qrAssignedAt);
  const stoppedAt = validTimestamp(source?.dismantledAt);

  if (source?.status === 'dismantled' || stoppedAt) {
    return {status: 'dismantled', startedAt, stoppedAt};
  }
  if (source?.status === 'active' || startedAt) {
    return {status: 'active', startedAt, stoppedAt: ''};
  }
  return {status: 'awaiting-qr', startedAt: '', stoppedAt: ''};
}

export function formatScaffoldElapsedTime(startedAt: string, stoppedAt = '', nowMs = Date.now()): string {
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) {
    return 'Not started';
  }

  const parsedStopMs = Date.parse(stoppedAt);
  const endMs = Number.isFinite(parsedStopMs) ? parsedStopMs : nowMs;
  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}
