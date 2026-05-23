const HEADING_PATTERN = /^\s{0,3}#{1,2}\s+(.+?)\s*$/m;

export function extractPlanTitle(markdown: string): string {
  if (typeof markdown !== 'string' || markdown.length === 0) {
    return 'Implementation Plan';
  }
  const match = markdown.match(HEADING_PATTERN);
  const heading = match?.[1]?.trim();
  return heading && heading.length > 0 ? heading : 'Implementation Plan';
}
