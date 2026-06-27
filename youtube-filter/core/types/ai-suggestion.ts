import type { RuleType, RuleAction } from "~core/types/rule"

export interface AiSuggestion {
  id?: number
  type: RuleType
  targetRaw: string
  action: RuleAction
  aiReason: string
  status: "pending" | "approved" | "dismissed"
  createdAt: string
}
