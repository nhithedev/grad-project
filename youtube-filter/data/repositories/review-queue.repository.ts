import { db } from "~data/db/app-db"
import type { ReviewItem } from "~core/types/review-item"

export class ReviewQueueRepository {
  async getAll(): Promise<ReviewItem[]> {
    return db.reviewQueue.where("status").equals("pending").reverse().sortBy("addedAt")
  }

  async add(item: Omit<ReviewItem, "id">): Promise<number> {
    return db.reviewQueue.add(item as ReviewItem)
  }

  async resolve(id: number, status: "approved" | "dismissed"): Promise<void> {
    await db.reviewQueue.update(id, { status })
  }

  async clearAll(): Promise<void> {
    await db.reviewQueue.clear()
  }
}

export const reviewQueueRepository = new ReviewQueueRepository()
