export interface MatchLog {
  id?: number
  videoId: string
  title: string
  channelName?: string
  ruleId: number
  ruleType: string
  ruleTarget: string
  action: "hide" | "flag"
  reason: string
  matchedAt: string
}
