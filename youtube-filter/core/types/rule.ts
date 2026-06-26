export type RuleType = "keyword" | "channelName" | "channelId" | "videoId" | "regex"
export type RuleAction = "hide" | "flag"

export interface RuleList {
  id?: number
  profileId?: number
  name: string
  description?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Rule {
  id?: number
  listId: number
  type: RuleType
  targetRaw: string
  targetNormalized: string
  action: RuleAction
  enabled: boolean
  note?: string
  createdAt: string
  updatedAt: string
}