const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Format calendar dates without interpreting them in the device's time zone. */
export function formatDayLabourDate(value: string): string {
  const trimmed = value.trim();
  const display = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!display && !iso) {
    return value;
  }
  const [day, month, year] = display
    ? [Number(display[1]), Number(display[2]), Number(display[3])]
    : [Number(iso![3]), Number(iso![2]), Number(iso![1])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return value;
  }
  return `${WEEKDAYS[date.getUTCDay()]} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
}
