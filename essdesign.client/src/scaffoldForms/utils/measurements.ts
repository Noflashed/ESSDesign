// Derived from ESSApp/src/utils/measurements.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
/** Add metres to numeric dimensions for display only; never rewrite stored values. */
export function formatMetres(value: string | number | null | undefined): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  // Preserve legacy values with units (including mm/ft) and notes such as N/A.
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? `${text.replace(/\.$/, '')}m` : text;
}
