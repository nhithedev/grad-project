import { db } from "~data/db/app-db"
import { nowIso } from "~data/utils/normalize"
import type { RuleList } from "~core/types/rule"

export class RuleListsRepository {
  async getByProfile(profileId: number): Promise<RuleList[]> {
    return db.ruleLists.where("profileId").equals(profileId).toArray()
  }

  async create(profileId: number, name: string): Promise<number> {
    const now = nowIso()
    return db.ruleLists.add({
      profileId,
      name: name.trim(),
      enabled: true,
      createdAt: now,
      updatedAt: now
    } as RuleList)
  }

  async delete(id: number): Promise<void> {
    await db.transaction("rw", db.ruleLists, db.rules, async () => {
      await db.rules.where("listId").equals(id).delete()
      await db.ruleLists.delete(id)
    })
  }

  async ensureForProfile(profileId: number): Promise<number> {
    const existing = await db.ruleLists.where("profileId").equals(profileId).first()
    if (existing?.id) return existing.id
    return this.create(profileId, "Danh sách mặc định")
  }
}

export const ruleListsRepository = new RuleListsRepository()
