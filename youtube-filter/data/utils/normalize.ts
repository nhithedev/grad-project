export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

export function nowIso(): string {
  return new Date().toISOString()
}