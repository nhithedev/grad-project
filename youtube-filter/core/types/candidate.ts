export type YouTubePageType = "home" | "search" | "watch" | "unknown"

export interface VideoCandidate {
  videoId: string
  title: string
  channelName?: string
  channelId?: string
  pageType: YouTubePageType
  source: "dom"
  url?: string
  seenAt: string
}