import type { Rule } from "~core/types/rule"
import type { VideoCandidate } from "~core/types/candidate"
import type { Settings } from "~core/types/settings"
import { normalizeText } from "~data/utils/normalize"

export interface Decision {
  action: "allow" | "flag" | "hide"
  reason: string
  matchedRuleIds: number[]
}

export interface EngineInput {
  candidate: VideoCandidate
  rules: Rule[]
  settings: Settings
  externalSignals?: null // reserved for backend/AI signals in v2+
}

// Priority order: higher index = evaluated first
const TYPE_PRIORITY = ["keyword", "regex", "channelName", "channelId", "videoId"] as const

function matchesRule(rule: Rule, candidate: VideoCandidate): boolean {
  const target = rule.targetNormalized

  switch (rule.type) {
    case "videoId":
      return normalizeText(candidate.videoId) === target
    case "channelId":
      return candidate.channelId ? normalizeText(candidate.channelId) === target : false
    case "channelName":
      return candidate.channelName
        ? normalizeText(candidate.channelName).includes(target)
        : false
    case "keyword":
      return (
        normalizeText(candidate.title).includes(target) ||
        (candidate.channelName ? normalizeText(candidate.channelName).includes(target) : false) ||
        (candidate.description ? normalizeText(candidate.description).includes(target) : false)
      )
    case "regex": {
      try {
        const re = new RegExp(rule.targetRaw, "i")
        return re.test(candidate.title ?? "") || re.test(candidate.channelName ?? "") || re.test(candidate.description ?? "")
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

export function evaluate(input: EngineInput): Decision {
  const { candidate, rules, settings } = input

  if (!settings.enabled) {
    return { action: "allow", reason: "extension disabled", matchedRuleIds: [] }
  }

  const enabledRules = rules.filter((r) => r.enabled)

  // Evaluate by priority: videoId first, keyword last
  for (const ruleType of [...TYPE_PRIORITY].reverse()) {
    const matching = enabledRules.filter((r) => r.type === ruleType && matchesRule(r, candidate))
    if (matching.length === 0) continue

    const hideRule = matching.find((r) => r.action === "hide")
    const winner = hideRule ?? matching[0]
    const action = winner.action as "hide" | "flag"
    const reason = `${ruleType}:${winner.targetRaw}`

    return {
      action,
      reason,
      matchedRuleIds: matching.map((r) => r.id),
    }
  }

  return { action: "allow", reason: "", matchedRuleIds: [] }
}
