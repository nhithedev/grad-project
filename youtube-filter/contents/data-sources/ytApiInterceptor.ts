import type { DataSource, VideoData } from "./index"

interface YtRenderer {
  videoId?: string
  title?: { runs?: { text: string }[]; simpleText?: string }
  shortBylineText?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] }
  longBylineText?:  { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] }
}

interface LockupViewModel {
  contentId?: string
  contentType?: string
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string }
      metadata?: { contentMetadataViewModel?: { metadataRows?: Array<{ metadataParts?: Array<{ text?: { content?: string } }> }> } }
      image?: { decoratedAvatarViewModel?: { rendererContext?: { commandContext?: { onTap?: { innertubeCommand?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } } } } } }
    }
  }
}

function getText(obj?: { runs?: { text: string }[]; simpleText?: string }): string | undefined {
  if (!obj) return undefined
  if (obj.simpleText) return obj.simpleText.trim()
  return obj.runs?.map((r) => r.text).join("").trim() || undefined
}

function getChannelFromByline(
  byline?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string } } }[] }
): { channelName: string | undefined; channelId: string | undefined } {
  if (!byline?.runs) return { channelName: undefined, channelId: undefined }
  const channelName = byline.runs.map((r) => r.text).join("").trim() || undefined
  const idRun = byline.runs.find((r) => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC"))
  return { channelName, channelId: idRun?.navigationEndpoint?.browseEndpoint?.browseId }
}

function parseLockup(r: LockupViewModel): VideoData | null {
  const videoId = r.contentId
  if (!videoId || r.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null
  const title = r.metadata?.lockupMetadataViewModel?.title?.content
  const channelName = r.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || undefined
  const browseEndpoint = r.metadata?.lockupMetadataViewModel?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint
  const channelId = browseEndpoint?.browseId?.startsWith("UC") ? browseEndpoint.browseId : browseEndpoint?.canonicalBaseUrl || undefined
  return { videoId, title, channelName, channelId, url: `/watch?v=${videoId}` }
}

const CLASSIC_KEYS = ["compactVideoRenderer", "videoRenderer", "gridVideoRenderer"]

function walkForRenderers(obj: unknown, classic: YtRenderer[], lockups: LockupViewModel[], depth = 0) {
  if (depth > 12 || !obj || typeof obj !== "object") return
  if (Array.isArray(obj)) {
    for (const item of obj) walkForRenderers(item, classic, lockups, depth + 1)
    return
  }
  const record = obj as Record<string, unknown>
  if (record["lockupViewModel"]) lockups.push(record["lockupViewModel"] as LockupViewModel)
  for (const key of CLASSIC_KEYS) {
    if (record[key]) classic.push(record[key] as YtRenderer)
  }
  for (const [key, val] of Object.entries(record)) {
    if (key !== "lockupViewModel" && !CLASSIC_KEYS.includes(key)) walkForRenderers(val, classic, lockups, depth + 1)
  }
}

function parseBody(body: unknown): VideoData[] {
  const classic: YtRenderer[] = []
  const lockups: LockupViewModel[] = []
  walkForRenderers(body, classic, lockups)

  const map = new Map<string, VideoData>()
  const merge = (item: VideoData) => {
    const existing = map.get(item.videoId)
    map.set(item.videoId, existing
      ? { ...existing, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== "")) }
      : item
    )
  }

  for (const r of classic) {
    if (!r.videoId) continue
    const byline = r.shortBylineText ?? r.longBylineText
    const { channelName, channelId } = getChannelFromByline(byline)
    merge({ videoId: r.videoId, title: getText(r.title), channelName, channelId, url: `/watch?v=${r.videoId}` })
  }

  for (const r of lockups) {
    const item = parseLockup(r)
    if (item) merge(item)
  }

  return Array.from(map.values())
}

const pending = new Map<string, VideoData>()
let interceptInstalled = false

function installInterceptor() {
  if (interceptInstalled) return
  interceptInstalled = true

  const originalFetch = window.fetch.bind(window)
  window.fetch = async function (input, init) {
    const response = await originalFetch(input, init)
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
    if (url.includes("/youtubei/v1/next")) {
      response.clone().json().then((body: unknown) => {
        for (const item of parseBody(body)) {
          const existing = pending.get(item.videoId)
          pending.set(item.videoId, existing
            ? { ...existing, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== "")) }
            : item
          )
        }
        console.log(`[ytApiInterceptor] captured ${pending.size} total pending items`)
      }).catch(() => {})
    }
    return response
  }
}

export const ytApiInterceptorSource: DataSource = {
  name: "ytApiInterceptor",
  isAvailable() { return interceptInstalled },
  extract(): VideoData[] {
    const items = Array.from(pending.values())
    pending.clear()
    return items
  },
}

export function initYtApiInterceptor() {
  installInterceptor()
}
