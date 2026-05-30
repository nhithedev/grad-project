import { db } from "~data/db/app-db"
import type { MatchLog } from "~core/types/match-log"

export class MatchLogRepository {
  async addLog(log: Omit<MatchLog, "id">): Promise<number> {
    return db.matchLogs.add(log as MatchLog)
  }

  async getRecent(limit = 200): Promise<MatchLog[]> {
    return db.matchLogs.orderBy("matchedAt").reverse().limit(limit).toArray()
  }

  async clearAll(): Promise<void> {
    await db.matchLogs.clear()
  }
}

export const matchLogRepository = new MatchLogRepository()
