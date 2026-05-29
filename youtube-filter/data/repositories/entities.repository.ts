import { db } from "~data/db/app-db"
import { nowIso } from "~data/utils/normalize"
import type { EntityCache } from "~core/types/entity"

export class EntitiesRepository {
  async upsertEntity(entity: Omit<EntityCache, "id" | "lastSeenAt">) {
    const existing = await db.entitiesCache.where("videoId").equals(entity.videoId).first()

    if (existing?.id) {
      await db.entitiesCache.update(existing.id, {
        ...entity,
        lastSeenAt: nowIso()
      })
      return existing.id
    }

    return db.entitiesCache.add({
      ...entity,
      lastSeenAt: nowIso()
    })
  }

  async getAll() {
    return db.entitiesCache.orderBy("lastSeenAt").reverse().toArray()
  }

  async clearAll() {
    return db.entitiesCache.clear()
  }
}

export const entitiesRepository = new EntitiesRepository()