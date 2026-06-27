export interface ReviewItem {
  id?: number
  videoId: string
  title?: string
  channelName?: string
  channelId?: string
  aiReason?: string
  aiConfidence?: number
  addedAt: string
  addedBy: "ai" | "user"
  status: "pending" | "approved" | "dismissed"
}
