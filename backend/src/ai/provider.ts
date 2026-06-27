export type RuleType = "keyword" | "channelName" | "channelId" | "videoId" | "regex"
export type RuleAction = "hide" | "flag"

export interface ClassifyInput {
  videoId: string
  title: string
  channelName?: string
  channelId?: string
  existingRules: Array<{ type: RuleType; targetRaw: string; action: RuleAction }>
}

export interface ClassifyOutput {
  action: "hide" | "flag" | "allow" | "uncertain"
  reason: string
  confidence: number
}

export interface MatchLogEntry {
  videoId: string
  title: string
  channelName?: string
  ruleType: string
  ruleTarget: string
  action: "hide" | "flag"
  reason: string
}

export interface SuggestedRule {
  type: RuleType
  targetRaw: string
  action: RuleAction
  reason: string
}

export interface SuggestInput {
  recentLogs: MatchLogEntry[]
  existingRules: Array<{ type: RuleType; targetRaw: string; action: RuleAction }>
}

export interface SuggestOutput {
  suggestions: SuggestedRule[]
}

export interface AiProvider {
  classify(input: ClassifyInput): Promise<ClassifyOutput>
  suggest(input: SuggestInput): Promise<SuggestOutput>
}
