import { db } from "~data/db/app-db"
import { nowIso } from "~data/utils/normalize"
import type { Profile } from "~core/types/profile"

export class ProfilesRepository {
  async getAll(): Promise<Profile[]> {
    return db.profiles.orderBy("createdAt").toArray()
  }

  async create(name: string): Promise<number> {
    const now = nowIso()
    return db.profiles.add({ name: name.trim(), createdAt: now, updatedAt: now })
  }

  async update(id: number, name: string): Promise<void> {
    await db.profiles.update(id, { name: name.trim(), updatedAt: nowIso() })
  }

  async delete(id: number): Promise<void> {
    await db.transaction("rw", db.profiles, db.ruleLists, db.rules, async () => {
      const lists = await db.ruleLists.where("profileId").equals(id).toArray()
      const listIds = lists.map((l) => l.id!).filter(Boolean)
      for (const listId of listIds) {
        await db.rules.where("listId").equals(listId).delete()
      }
      await db.ruleLists.where("profileId").equals(id).delete()
      await db.profiles.delete(id)
    })
  }

  async ensureDefault(): Promise<number> {
    const existing = await db.profiles.toCollection().first()
    if (existing?.id) return existing.id
    return this.create("default")
  }
}

export const profilesRepository = new ProfilesRepository()
