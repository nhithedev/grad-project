import { describe, it, expect } from "vitest"
import { evaluate } from "~core/rule-engine"
import type { Rule } from "~core/types/rule"
import type { VideoCandidate } from "~core/types/candidate"
import type { Settings } from "~core/types/settings"
import { normalizeText } from "~data/utils/normalize"

// ─── factories ───────────────────────────────────────────────────────────────

const settings = (overrides?: Partial<Settings>): Settings => ({
  enabled: true,
  defaultAction: "flag",
  debugMode: false,
  matchScopes: [],
  activeProfileId: 1,
  ...overrides
})

const candidate = (overrides?: Partial<VideoCandidate>): VideoCandidate => ({
  videoId: "abc123",
  title: "MrBeast Gives Away $1,000,000",
  channelName: "MrBeast",
  channelId: "UCX6OQ3DkcsbYNE6H8uQQuVA",
  pageType: "home",
  ...overrides
})

let nextId = 1
const rule = (overrides: Partial<Rule> & { type: Rule["type"]; targetRaw: string; action: Rule["action"] }): Rule => ({
  id: nextId++,
  listId: 1,
  targetNormalized: normalizeText(overrides.targetRaw),
  enabled: true,
  note: "",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  ...overrides
})

// ─── extension disabled ───────────────────────────────────────────────────────

describe("extension disabled", () => {
  it("trả allow khi enabled=false dù có rule match", () => {
    const r = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings({ enabled: false }) })
    expect(result.action).toBe("allow")
    expect(result.reason).toBe("extension disabled")
  })
})

// ─── keyword rule ─────────────────────────────────────────────────────────────

describe("keyword rule", () => {
  it("match title → flag", () => {
    const r = rule({ type: "keyword", targetRaw: "mrbeast", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("keyword:mrbeast (title)")
  })

  it("match channelName", () => {
    const r = rule({ type: "keyword", targetRaw: "mrbeast", action: "flag" })
    const c = candidate({ title: "Some Other Video", channelName: "MrBeast" })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("keyword:mrbeast (channelName)")
  })

  it("match description snippet (search page)", () => {
    const r = rule({ type: "keyword", targetRaw: "million", action: "flag" })
    const c = candidate({ title: "Random Title", channelName: "SomeChannel", description: "Giving away a million dollars" })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("keyword:million (description)")
  })

  it("không match khi không có trong title/channel/description", () => {
    const r = rule({ type: "keyword", targetRaw: "pewdiepie", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })

  it("case-insensitive matching", () => {
    const r = rule({ type: "keyword", targetRaw: "MRBEAST", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
  })

  it("partial match trong title", () => {
    const r = rule({ type: "keyword", targetRaw: "beast", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("keyword:beast (title)")
  })
})

// ─── channelName rule ─────────────────────────────────────────────────────────

describe("channelName rule", () => {
  it("match tên kênh chính xác (có chứa)", () => {
    const r = rule({ type: "channelName", targetRaw: "MrBeast", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("hide")
    expect(result.reason).toBe("channelName:MrBeast (channelName)")
  })

  it("không match khi channelName undefined", () => {
    const r = rule({ type: "channelName", targetRaw: "MrBeast", action: "hide" })
    const c = candidate({ channelName: undefined })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })

  it("không match title hay description — chỉ channelName", () => {
    const r = rule({ type: "channelName", targetRaw: "mrbeast", action: "hide" })
    // title chứa "mrbeast" nhưng channelName khác
    const c = candidate({ title: "MrBeast reaction", channelName: "Reaction Channel" })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })
})

// ─── channelId rule ───────────────────────────────────────────────────────────

describe("channelId rule", () => {
  it("match channelId chính xác", () => {
    const r = rule({ type: "channelId", targetRaw: "UCX6OQ3DkcsbYNE6H8uQQuVA", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("hide")
    expect(result.reason).toBe("channelId:UCX6OQ3DkcsbYNE6H8uQQuVA (channelId)")
  })

  it("không match khi channelId undefined", () => {
    const r = rule({ type: "channelId", targetRaw: "UCX6OQ3DkcsbYNE6H8uQQuVA", action: "hide" })
    const c = candidate({ channelId: undefined })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })

  it("không match channelId sai", () => {
    const r = rule({ type: "channelId", targetRaw: "UCxxxxxxxxxxxxxxxxxxxxxxx", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })
})

// ─── videoId rule ─────────────────────────────────────────────────────────────

describe("videoId rule", () => {
  it("match videoId chính xác", () => {
    const r = rule({ type: "videoId", targetRaw: "abc123", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("hide")
    expect(result.reason).toBe("videoId:abc123 (videoId)")
  })

  it("không match videoId sai", () => {
    const r = rule({ type: "videoId", targetRaw: "xyz999", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })
})

// ─── regex rule ───────────────────────────────────────────────────────────────

describe("regex rule", () => {
  it("match pattern trong title", () => {
    const r = rule({ type: "regex", targetRaw: "\\$\\d+", action: "flag" })
    // title: "MrBeast Gives Away $1,000,000"
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("regex:\\$\\d+ (title)")
  })

  it("match pattern trong channelName", () => {
    const r = rule({ type: "regex", targetRaw: "^mr", action: "flag" })
    // title không bắt đầu bằng "mr" để chắc chắn match channelName
    const c = candidate({ title: "Top 10 Viral Moments", channelName: "MrBeast" })
    const result = evaluate({ candidate: c, rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toBe("regex:^mr (channelName)")
  })

  it("không crash khi regex pattern không hợp lệ", () => {
    const r = rule({ type: "regex", targetRaw: "[invalid(", action: "hide" })
    expect(() => evaluate({ candidate: candidate(), rules: [r], settings: settings() })).not.toThrow()
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })

  it("case-insensitive (flag i)", () => {
    const r = rule({ type: "regex", targetRaw: "MRBEAST", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("flag")
  })
})

// ─── priority: hide thắng flag cùng type ─────────────────────────────────────

describe("priority: hide thắng flag trong cùng ruleType", () => {
  it("2 keyword rules — hide thắng flag", () => {
    const flagRule = rule({ type: "keyword", targetRaw: "mrbeast", action: "flag" })
    const hideRule = rule({ type: "keyword", targetRaw: "gives away", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [flagRule, hideRule], settings: settings() })
    expect(result.action).toBe("hide")
  })

  it("matchedRuleIds chứa cả 2 khi cùng type match", () => {
    const r1 = rule({ type: "keyword", targetRaw: "mrbeast", action: "flag" })
    const r2 = rule({ type: "keyword", targetRaw: "gives away", action: "hide" })
    const result = evaluate({ candidate: candidate(), rules: [r1, r2], settings: settings() })
    expect(result.matchedRuleIds).toContain(r1.id)
    expect(result.matchedRuleIds).toContain(r2.id)
  })
})

// ─── priority: type cao hơn thắng type thấp hơn ──────────────────────────────

describe("priority: videoId > channelId > channelName > regex > keyword", () => {
  it("videoId thắng keyword dù keyword action là hide", () => {
    const kwHide = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide" })
    const vidFlag = rule({ type: "videoId", targetRaw: "abc123", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [kwHide, vidFlag], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toContain("videoId:")
  })

  it("channelId thắng keyword", () => {
    const kwHide = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide" })
    const chFlag = rule({ type: "channelId", targetRaw: "UCX6OQ3DkcsbYNE6H8uQQuVA", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [kwHide, chFlag], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toContain("channelId:")
  })

  it("channelName thắng keyword", () => {
    const kwHide = rule({ type: "keyword", targetRaw: "beast", action: "hide" })
    const cnFlag = rule({ type: "channelName", targetRaw: "MrBeast", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [kwHide, cnFlag], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toContain("channelName:")
  })

  it("regex thắng keyword", () => {
    const kwHide = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide" })
    const reFlag = rule({ type: "regex", targetRaw: "mr.*", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [kwHide, reFlag], settings: settings() })
    expect(result.action).toBe("flag")
    expect(result.reason).toContain("regex:")
  })
})

// ─── disabled rule bị bỏ qua ─────────────────────────────────────────────────

describe("disabled rule", () => {
  it("rule disabled không được apply", () => {
    const r = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide", enabled: false })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    expect(result.action).toBe("allow")
  })

  it("chỉ rule enabled mới được apply khi có cả enabled và disabled", () => {
    const disabled = rule({ type: "keyword", targetRaw: "mrbeast", action: "hide", enabled: false })
    const enabled = rule({ type: "keyword", targetRaw: "gives away", action: "flag", enabled: true })
    const result = evaluate({ candidate: candidate(), rules: [disabled, enabled], settings: settings() })
    expect(result.action).toBe("flag")
  })
})

// ─── reason string format ─────────────────────────────────────────────────────

describe("reason string format", () => {
  it("format: type:targetRaw (field)", () => {
    const r = rule({ type: "keyword", targetRaw: "MrBeast", action: "flag" })
    const result = evaluate({ candidate: candidate(), rules: [r], settings: settings() })
    // targetRaw giữ nguyên, không normalize
    expect(result.reason).toBe("keyword:MrBeast (title)")
  })

  it("reason rỗng khi allow", () => {
    const result = evaluate({ candidate: candidate(), rules: [], settings: settings() })
    expect(result.action).toBe("allow")
    expect(result.reason).toBe("")
  })

  it("matchedRuleIds rỗng khi allow", () => {
    const result = evaluate({ candidate: candidate(), rules: [], settings: settings() })
    expect(result.matchedRuleIds).toEqual([])
  })
})
