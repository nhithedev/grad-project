import { db } from "~data/db/app-db"
import { normalizeText, nowIso } from "~data/utils/normalize"
import type { Rule, RuleAction, RuleList, RuleType } from "~core/types/rule"

export class RulesRepository {
  async ensureDefaultList(profileId?: number | null): Promise<number> {
    if (profileId != null) {
      const existing = await db.ruleLists.where("profileId").equals(profileId).first()
      if (existing?.id) return existing.id
      const now = nowIso()
      return db.ruleLists.add({
        profileId,
        name: "Danh sách mặc định",
        enabled: true,
        createdAt: now,
        updatedAt: now
      } as RuleList)
    }

    const existing = await db.ruleLists.toCollection().first()
    if (existing?.id) return existing.id

    const now = nowIso()
    return db.ruleLists.add({
      name: "Default Blocklist",
      description: "Default local rule list",
      enabled: true,
      createdAt: now,
      updatedAt: now
    } as RuleList)
  }

  async getAllLists(): Promise<RuleList[]> {
    return db.ruleLists.toArray()
  }

  async getAllRules(profileId?: number | null): Promise<Rule[]> {
    if (profileId != null) {
      const lists = await db.ruleLists.where("profileId").equals(profileId).toArray()
      if (lists.length === 0) return []
      const listIds = lists.map((l) => l.id!).filter(Boolean)
      const rules = await db.rules.where("listId").anyOf(listIds).toArray()
      return rules.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return db.rules.orderBy("updatedAt").reverse().toArray()
  }

  async getRulesByType(type: RuleType): Promise<Rule[]> {
    return db.rules.where("type").equals(type).toArray()
  }

  async createRule(input: {
    type: RuleType
    targetRaw: string
    action?: RuleAction
    note?: string
    profileId?: number | null
  }) {
    const listId = await this.ensureDefaultList(input.profileId)
    const normalized = normalizeText(input.targetRaw)

    const existing = await db.rules
      .where("[type+targetNormalized]")
      .equals([input.type, normalized])
      .first()

    if (existing?.id) {
      return existing.id
    }

    const now = nowIso()

    return db.rules.add({
      listId,
      type: input.type,
      targetRaw: input.targetRaw.trim(),
      targetNormalized: normalized,
      action: input.action ?? "hide",
      enabled: true,
      note: input.note,
      createdAt: now,
      updatedAt: now
    } as Rule)
  }

  async updateRule(id: number, patch: Partial<Rule>) {
    const nextPatch: Partial<Rule> = {
      ...patch,
      updatedAt: nowIso()
    }

    if (typeof patch.targetRaw === "string") {
      nextPatch.targetRaw = patch.targetRaw.trim()
      nextPatch.targetNormalized = normalizeText(patch.targetRaw)
    }

    return db.rules.update(id, nextPatch)
  }

  async setRuleEnabled(id: number, enabled: boolean) {
    return db.rules.update(id, {
      enabled,
      updatedAt: nowIso()
    })
  }

  async deleteRule(id: number) {
    return db.rules.delete(id)
  }
}

export const rulesRepository = new RulesRepository()