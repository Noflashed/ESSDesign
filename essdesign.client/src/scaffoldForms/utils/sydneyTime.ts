// Derived from ESSApp/src/utils/sydneyTime.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export const SYDNEY_TIME_ZONE = 'Australia/Sydney';

export type SydneyDateTimeParts = {
  isoDate: string;
  displayDate: string;
  displayTime: string;
  instant: string;
};

const datePartsFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: SYDNEY_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function formatterPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find(part => part.type === type)?.value ?? '';
}

export function getSydneyDateTimeParts(date = new Date()): SydneyDateTimeParts {
  const parts = datePartsFormatter.formatToParts(date);
  const day = formatterPart(parts, 'day');
  const month = formatterPart(parts, 'month');
  const year = formatterPart(parts, 'year');
  return {
    isoDate: `${year}-${month}-${day}`,
    displayDate: `${day}/${month}/${year}`,
    displayTime: timeFormatter.format(date).toLowerCase(),
    instant: date.toISOString(),
  };
}

export function sydneyTodayIsoDate(): string {
  return getSydneyDateTimeParts().isoDate;
}

export function sydneyTodayDisplayDate(): string {
  return getSydneyDateTimeParts().displayDate;
}

export function sydneyNowDisplayDateTime(): string {
  const parts = getSydneyDateTimeParts();
  return `${parts.displayDate} ${parts.displayTime}`;
}

export function sydneyCalendarDate(date = new Date()): Date {
  const {isoDate} = getSydneyDateTimeParts(date);
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatSydneyDateTime(value: string): string {
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }
  const parsed = new Date(value);
  if (!trimmed || Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}
