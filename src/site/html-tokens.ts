/** Replace build-time placeholders in `index.docs.html`. */
export function applySiteTokens(
  html: string,
  version: string,
  dateModified: string,
): string {
  return html
    .replaceAll("__KIT_VERSION__", version)
    .replaceAll("__DATE_MODIFIED__", dateModified);
}
