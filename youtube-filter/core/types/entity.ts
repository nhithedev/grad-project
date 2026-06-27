import type { YouTubePageType } from "~core/types/candidate"

export interface EntityCache {
  id?: number
  videoId: string
  channelId?: string
  channelName?: string
  title?: string
  description?: string
  pageType?: YouTubePageType
  url?: string
  lastSeenAt: string
}