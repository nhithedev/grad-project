import type { EntityCache } from "~core/types/entity"

// ─── Interface chung cho mọi data source ─────────────────────────────────────

export interface VideoData {
  videoId: string
  title?: string
  channelName?: string
  channelId?: string
  url?: string
}

export interface DataSource {
  /** Tên source để debug */
  name: string
  /** Có data không — để skip nếu không applicable */
  isAvailable(): boolean
  /** Trả về tất cả video data source này có thể cung cấp */
  extract(): VideoData[]
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

const sources: DataSource[] = []

export function registerDataSource(source: DataSource) {
  if (!sources.find((s) => s.name === source.name)) {
    sources.push(source)
  }
}

/**
 * Chạy tất cả sources, merge kết quả theo videoId.
 * Source đăng ký trước có priority thấp hơn source đăng ký sau
 * (sau override trước nếu có thêm field).
 */
export function extractAllVideoData(): Map<string, VideoData> {
  const result = new Map<string, VideoData>()

  for (const source of sources) {
    if (!source.isAvailable()) continue

    try {
      const items = source.extract()
      for (const item of items) {
        const existing = result.get(item.videoId)
        result.set(item.videoId, existing
          ? {
              ...existing,
              ...Object.fromEntries(
                Object.entries(item).filter(([, v]) => v !== undefined && v !== null && v !== "")
              ),
            }
          : item
        )
      }
      console.log(`[DataSources] ${source.name}: extracted ${items.length} items`)
    } catch (err) {
      console.warn(`[DataSources] ${source.name} failed:`, err)
    }
  }

  return result
}