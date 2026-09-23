/** Default project heading, retaining any manually entered form heading. */
export function clientProjectName(
  client: string,
  project: string,
  existing?: string,
): string {
  if (existing?.trim() && existing.trim() !== project.trim()) {
    return existing;
  }
  return [client.trim(), project.trim()].filter(Boolean).join(' - ');
}
