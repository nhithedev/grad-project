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

function matchesRule(rule: Rule, candidate: VideoCandidate): string | null {
  const target = rule.targetNormalized

  switch (rule.type) {
    case "videoId":
      return normalizeText(candidate.videoId) === target ? "videoId" : null
    case "channelId":
      return candidate.channelId && normalizeText(candidate.channelId) === target ? "channelId" : null
    case "channelName":
      return candidate.channelName && normalizeText(candidate.channelName).includes(target) ? "channelName" : null
    case "keyword": {
      if (normalizeText(candidate.title).includes(target)) return "title"
      if (candidate.channelName && normalizeText(candidate.channelName).includes(target)) return "channelName"
      if (candidate.description && normalizeText(candidate.description).includes(target)) return "description"
      return null
    }
    case "regex": {
      try {
        const re = new RegExp(rule.targetRaw, "i")
        if (re.test(candidate.title ?? "")) return "title"
        if (re.test(candidate.channelName ?? "")) return "channelName"
        if (re.test(candidate.description ?? "")) return "description"
      } catch {}
      return null
    }
    default:
      return null
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
    const matched = enabledRules
      .map((r) => ({ rule: r, field: matchesRule(r, candidate) }))
      .filter((x) => x.rule.type === ruleType && x.field !== null)
    if (matched.length === 0) continue

    const hideMatch = matched.find((x) => x.rule.action === "hide")
    const winner = hideMatch ?? matched[0]
    const action = winner.rule.action as "hide" | "flag"
    const reason = `${ruleType}:${winner.rule.targetRaw} (${winner.field})`

    return {
      action,
      reason,
      matchedRuleIds: matched.map((x) => x.rule.id),
    }
  }

  return { action: "allow", reason: "", matchedRuleIds: [] }
}
