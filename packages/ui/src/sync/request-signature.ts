const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function requestSignature(items: Array<{ id: string }> | undefined): string {
  if (!items || items.length === 0) return ""
  return items
    .map((item) => item.id)
    .sort(cmp)
    .join("|")
}
