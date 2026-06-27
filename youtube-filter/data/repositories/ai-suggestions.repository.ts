import { db } from "~data/db/app-db"
import type { AiSuggestion } from "~core/types/ai-suggestion"

export class AiSuggestionsRepository {
  async getAll(): Promise<AiSuggestion[]> {
    return db.aiSuggestions.where("status").equals("pending").reverse().sortBy("createdAt")
  }

  async getById(id: number): Promise<AiSuggestion | undefined> {
    return db.aiSuggestions.get(id)
  }

  async addBatch(suggestions: Omit<AiSuggestion, "id">[]): Promise<void> {
    await db.aiSuggestions.bulkAdd(suggestions as AiSuggestion[])
  }

  async resolve(id: number, status: "approved" | "dismissed"): Promise<void> {
    await db.aiSuggestions.update(id, { status })
  }

  async clearAll(): Promise<void> {
    await db.aiSuggestions.clear()
  }
}

export const aiSuggestionsRepository = new AiSuggestionsRepository()
