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

export interface ParsedYouTubeUrl {
  type: "videoId" | "channelId" | "channelName"
  value: string
}

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Bare @handle
  if (trimmed.startsWith("@")) {
    const handle = trimmed.slice(1).replace(/\/.*/, "").trim()
    if (handle) return { type: "channelName", value: handle }
  }

  let url: URL
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    url = new URL(withProtocol)
  } catch {
    return null
  }

  const hostname = url.hostname.replace(/^www\./, "")
  const parts = url.pathname.split("/").filter(Boolean)

  if (hostname === "youtu.be" && parts[0]) {
    return { type: "videoId", value: parts[0] }
  }

  if (hostname !== "youtube.com") return null

  // /watch?v=xxx
  const v = url.searchParams.get("v")
  if (v) return { type: "videoId", value: v }

  // /shorts/xxx
  if (parts[0] === "shorts" && parts[1]) return { type: "videoId", value: parts[1] }

  // /channel/UCxxx
  if (parts[0] === "channel" && parts[1]) return { type: "channelId", value: parts[1] }

  // /@handle
  if (parts[0]?.startsWith("@")) return { type: "channelName", value: parts[0].slice(1) }

  // /c/customname
  if (parts[0] === "c" && parts[1]) return { type: "channelName", value: parts[1] }

  return null
}