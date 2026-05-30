import Dexie, { type Table } from "dexie"
import type { Rule, RuleList } from "~core/types/rule"
import type { EntityCache } from "~core/types/entity"
import type { MatchLog } from "~core/types/match-log"

export class AppDB extends Dexie {
  ruleLists!: Table<RuleList, number>
  rules!: Table<Rule, number>
  entitiesCache!: Table<EntityCache, number>
  matchLogs!: Table<MatchLog, number>

  constructor() {
    super("youtubeFilterDB")

    this.version(1).stores({
      ruleLists: "++id, enabled, createdAt, updatedAt",
      rules:
        "++id, listId, type, targetNormalized, [type+targetNormalized], enabled, createdAt, updatedAt"
    })

    this.version(2).stores({
      ruleLists: "++id, enabled, createdAt, updatedAt",
      rules:
        "++id, listId, type, targetNormalized, [type+targetNormalized], enabled, createdAt, updatedAt",
      entitiesCache: "++id, videoId, channelId, lastSeenAt"
    })

    this.version(3).stores({
      ruleLists: "++id, enabled, createdAt, updatedAt",
      rules:
        "++id, listId, type, targetNormalized, [type+targetNormalized], enabled, createdAt, updatedAt",
      entitiesCache: "++id, videoId, channelId, lastSeenAt",
      matchLogs: "++id, videoId, ruleId, action, matchedAt"
    })
  }
}

export const db = new AppDB()