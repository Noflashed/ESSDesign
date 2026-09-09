// Derived from ESSApp/src/utils/scaffTagQrLabelToken.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
export function extractScaffTagQrLabelToken(scannedValue: string): string | null {
  const trimmed = String(scannedValue || '').trim();
  const uuidPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
  const shortCodePattern = '[A-Za-z0-9_-]{11}';
  const labelCodePattern = `(?:${uuidPattern}|${shortCodePattern})`;
  const standaloneMatch = trimmed.match(new RegExp(`^(${uuidPattern})$`, 'i'));
  if (standaloneMatch) {
    return standaloneMatch[1].toLowerCase();
  }
  const standaloneShortCodeMatch = trimmed.match(new RegExp(`^(${shortCodePattern})$`));
  if (standaloneShortCodeMatch) {
    return standaloneShortCodeMatch[1];
  }

  // Native camera scanners can return URLs with encoded slashes, fragments,
  // invisible spacing, or other text around them. Match the permanent /q/
  // route directly instead of depending on React Native's URL implementation.
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Keep the original value when it contains an incomplete escape sequence.
  }
  const routeMatch = decoded.match(new RegExp(`(?:^|[\\s/:])q/(${labelCodePattern})(?:$|[?#/\\s])`, 'i'));
  if (!routeMatch?.[1]) {
    return null;
  }
  return new RegExp(`^${uuidPattern}$`, 'i').test(routeMatch[1])
    ? routeMatch[1].toLowerCase()
    : routeMatch[1];
}
