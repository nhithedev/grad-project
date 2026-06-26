import type { DataSource, VideoData } from "./index"

interface YtRenderer {
  videoId?: string
  title?: { runs?: { text: string }[]; simpleText?: string }
  shortBylineText?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
  longBylineText?:  { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
}

// lockupViewModel shape (watch sidebar)
interface LockupViewModel {
  contentId?: string
  contentType?: string
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string }
      metadata?: {
        contentMetadataViewModel?: {
          metadataRows?: Array<{
            metadataParts?: Array<{ text?: { content?: string } }>
          }>
        }
      }
      image?: {
        decoratedAvatarViewModel?: {
          rendererContext?: {
            commandContext?: {
              onTap?: {
                innertubeCommand?: {
                  browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string }
                }
              }
            }
          }
        }
      }
    }
  }
}

function getText(obj?: { runs?: { text: string }[]; simpleText?: string }): string | undefined {
  if (!obj) return undefined
  if (obj.simpleText) return obj.simpleText.trim()
  return obj.runs?.map((r) => r.text).join("").trim() || undefined
}

function getChannelNamesFromByline(
  byline?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
): { channelName: string | undefined; channelId: string | undefined } {
  if (!byline?.runs) return { channelName: undefined, channelId: undefined }
  const channelName = byline.runs.map((r) => r.text).join("").trim() || undefined
  const idRun = byline.runs.find((r) => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC"))
  const channelId = idRun?.navigationEndpoint?.browseEndpoint?.browseId || undefined
  return { channelName, channelId }
}

function parseLockupViewModel(r: LockupViewModel): VideoData | null {
  const videoId = r.contentId
  if (!videoId || r.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null

  const title = r.metadata?.lockupMetadataViewModel?.title?.content
  const firstRow = r.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
  const channelName = firstRow?.metadataParts?.[0]?.text?.content || undefined
  const browseEndpoint = r.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel
    ?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint
  const channelId = browseEndpoint?.browseId?.startsWith("UC") ? browseEndpoint.browseId : browseEndpoint?.canonicalBaseUrl || undefined

  return { videoId, title, channelName, channelId, url: `/watch?v=${videoId}` }
}

const CLASSIC_KEYS = ["compactVideoRenderer", "videoRenderer", "gridVideoRenderer", "reelItemRenderer"]

function walkForRenderers(
  obj: unknown,
  classic: YtRenderer[],
  lockups: LockupViewModel[],
  depth = 0
) {
  // Tăng depth limit lên 16 để không miss renderer trên watch page
  // (ytInitialData của watch page có cấu trúc sâu hơn home/search)
  if (depth > 16 || !obj || typeof obj !== "object") return
  if (Array.isArray(obj)) {
    for (const item of obj) walkForRenderers(item, classic, lockups, depth + 1)
    return
  }
  const record = obj as Record<string, unknown>
  if (record["lockupViewModel"]) {
    lockups.push(record["lockupViewModel"] as LockupViewModel)
  }
  for (const key of CLASSIC_KEYS) {
    if (record[key]) classic.push(record[key] as YtRenderer)
  }
  for (const [key, val] of Object.entries(record)) {
    if (key !== "lockupViewModel" && !CLASSIC_KEYS.includes(key)) {
      walkForRenderers(val, classic, lockups, depth + 1)
    }
  }
}

export const ytInitialDataSource: DataSource = {
  name: "ytInitialData",

  isAvailable() {
    return typeof (window as unknown as { ytInitialData?: unknown }).ytInitialData === "object"
  },

  extract(): VideoData[] {
    const raw = (window as unknown as { ytInitialData?: unknown }).ytInitialData
    if (!raw) return []

    const classic: YtRenderer[] = []
    const lockups: LockupViewModel[] = []
    walkForRenderers(raw, classic, lockups)

    const map = new Map<string, VideoData>()

    for (const r of classic) {
      if (!r.videoId) continue
      const byline = r.shortBylineText ?? r.longBylineText
      const { channelName, channelId } = getChannelNamesFromByline(byline)
      const handle = byline?.runs?.find((run) => run.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl)
        ?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl?.replace("/", "") || undefined
      const item: VideoData = {
        videoId: r.videoId,
        title: getText(r.title),
        channelName,
        channelId: channelId ?? handle,
        url: `/watch?v=${r.videoId}`,
      }
      const existing = map.get(item.videoId)
      map.set(item.videoId, existing ? { ...existing, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== "")) } : item)
    }

    for (const r of lockups) {
      const item = parseLockupViewModel(r)
      if (!item) continue
      const existing = map.get(item.videoId)
      map.set(item.videoId, existing ? { ...existing, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== "")) } : item)
    }

    return Array.from(map.values())
  },
}