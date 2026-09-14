/** Display calendar dates without changing their stored value or timezone. */
export function formatScaffoldDate(value: string): string {
  const text = String(value ?? '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : text;
}
