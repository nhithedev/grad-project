import Dexie, { type Table } from "dexie"
import type { Rule, RuleList } from "~core/types/rule"
import type { EntityCache } from "~core/types/entity"
import type { MatchLog } from "~core/types/match-log"
import type { Profile } from "~core/types/profile"
import type { ReviewItem } from "~core/types/review-item"
import type { AiSuggestion } from "~core/types/ai-suggestion"

export class AppDB extends Dexie {
  profiles!: Table<Profile, number>
  ruleLists!: Table<RuleList, number>
  rules!: Table<Rule, number>
  entitiesCache!: Table<EntityCache, number>
  matchLogs!: Table<MatchLog, number>
  reviewQueue!: Table<ReviewItem, number>
  aiSuggestions!: Table<AiSuggestion, number>

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

    this.version(4).stores({
      profiles: "++id, name, createdAt, updatedAt",
      ruleLists: "++id, profileId, enabled, createdAt, updatedAt",
      rules:
        "++id, listId, type, targetNormalized, [type+targetNormalized], enabled, createdAt, updatedAt",
      entitiesCache: "++id, videoId, channelId, lastSeenAt",
      matchLogs: "++id, videoId, ruleId, action, matchedAt"
    })

    this.version(5).stores({
      profiles: "++id, name, createdAt, updatedAt",
      ruleLists: "++id, profileId, enabled, createdAt, updatedAt",
      rules:
        "++id, listId, type, targetNormalized, [type+targetNormalized], enabled, createdAt, updatedAt",
      entitiesCache: "++id, videoId, channelId, lastSeenAt",
      matchLogs: "++id, videoId, ruleId, action, matchedAt",
      reviewQueue: "++id, videoId, status, addedAt, addedBy",
      aiSuggestions: "++id, status, createdAt"
    })
  }
}

export const db = new AppDB()