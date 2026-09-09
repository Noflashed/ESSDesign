// Derived from ESSApp/src/utils/projectDataEmail.ts; regenerate with scripts/sync-ios-scaffold-forms.py.
type RecipientWithEmail = {
  email?: string | null;
};

export function collectProjectDataRecipientEmails(
  internalRecipients: RecipientWithEmail[],
  externalEmails: string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  [...internalRecipients.map(recipient => recipient.email), ...externalEmails]
    .forEach(value => {
      const email = (value || '').trim().toLowerCase();
      if (!email || seen.has(email)) {
        return;
      }
      seen.add(email);
      result.push(email);
    });

  return result;
}

export function projectDataPdfFileName(label: string): string {
  const safeLabel = label
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
    .trim();
  return `${safeLabel || 'ESS Project Data Form'}.pdf`;
}
