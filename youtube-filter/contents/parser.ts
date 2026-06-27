import { getCandidateContainers, getPageType, parseVideoCard } from "~contents/youtube-parser"
import type { CacheEntitiesBatchPayload, CacheEntityPayload } from "~core/messages"
import { registerDataSource, extractAllVideoData } from "~contents/data-sources/index"
import type { DataSource, VideoData } from "~contents/data-sources/index"

// ─── ytPolymerSource — inline để tránh Plasmo tách bundle ─────────────────────
// Plasmo chỉ bundle đúng các file được import trực tiếp vào content script entry.
// File riêng trong data-sources/ bị tách thành chunk độc lập không được inject.

interface PolymerYtRenderer {
  videoId?: string
  title?: { runs?: { text: string }[]; simpleText?: string }
  shortBylineText?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
  longBylineText?:  { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
}

interface PolymerLockupViewModel {
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

function polymerGetText(obj?: { runs?: { text: string }[]; simpleText?: string }): string | undefined {
  if (!obj) return undefined
  if (obj.simpleText) return obj.simpleText.trim()
  return obj.runs?.map((r) => r.text).join("").trim() || undefined
}

function polymerGetChannel(
  byline?: { runs?: { text: string; navigationEndpoint?: { browseEndpoint?: { browseId?: string; canonicalBaseUrl?: string } } }[] }
): { channelName: string | undefined; channelId: string | undefined } {
  if (!byline?.runs) return { channelName: undefined, channelId: undefined }
  const channelName = byline.runs.map((r) => r.text).join("").trim() || undefined
  const idRun = byline.runs.find((r) => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("UC"))
  return { channelName, channelId: idRun?.navigationEndpoint?.browseEndpoint?.browseId || undefined }
}

function polymerParseLockup(r: PolymerLockupViewModel): VideoData | null {
  const videoId = r.contentId
  if (!videoId || r.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null
  const meta = r.metadata?.lockupMetadataViewModel
  const title = meta?.title?.content
  const channelName = meta?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || undefined
  const browseEndpoint = meta?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.browseEndpoint
  const channelId = browseEndpoint?.browseId?.startsWith("UC") ? browseEndpoint.browseId : browseEndpoint?.canonicalBaseUrl || undefined
  return { videoId, title, channelName, channelId, url: `/watch?v=${videoId}` }
}

const POLYMER_CLASSIC_KEYS = ["compactVideoRenderer", "videoRenderer", "gridVideoRenderer", "reelItemRenderer"]

function polymerWalk(obj: unknown, classic: PolymerYtRenderer[], lockups: PolymerLockupViewModel[], depth = 0) {
  if (depth > 16 || !obj || typeof obj !== "object") return
  if (Array.isArray(obj)) { for (const item of obj) polymerWalk(item, classic, lockups, depth + 1); return }
  const record = obj as Record<string, unknown>
  if (record["lockupViewModel"]) lockups.push(record["lockupViewModel"] as PolymerLockupViewModel)
  for (const key of POLYMER_CLASSIC_KEYS) { if (record[key]) classic.push(record[key] as PolymerYtRenderer) }
  for (const [key, val] of Object.entries(record)) {
    if (key !== "lockupViewModel" && !POLYMER_CLASSIC_KEYS.includes(key)) polymerWalk(val, classic, lockups, depth + 1)
  }
}

// Accumulate raw data chunks gửi từ main world qua postMessage
const polymerDataCache: unknown[] = []

function extractPolymerData(): VideoData[] {
  if (!polymerDataCache.length) return []

  const map = new Map<string, VideoData>()
  const merge = (item: VideoData) => {
    const existing = map.get(item.videoId)
    map.set(item.videoId, existing
      ? { ...existing, ...Object.fromEntries(Object.entries(item).filter(([, v]) => v != null && v !== "")) }
      : item)
  }

  for (const chunk of polymerDataCache) {
const classic: PolymerYtRenderer[] = []
    const lockups: PolymerLockupViewModel[] = []
    polymerWalk(chunk, classic, lockups)
    for (const r of classic) {
      if (!r.videoId) continue
      const byline = r.shortBylineText ?? r.longBylineText
      const { channelName, channelId } = polymerGetChannel(byline)
      merge({ videoId: r.videoId, title: polymerGetText(r.title), channelName, channelId, url: `/watch?v=${r.videoId}` })
    }
    for (const r of lockups) {
      const item = polymerParseLockup(r)
      if (item) merge(item)
    }
  }

  console.log(`[ytPolymer] extracted ${map.size} items from ${polymerDataCache.length} chunks`)
  return Array.from(map.values())
}

const ytPolymerSource: DataSource = {
  name: "ytPolymer",
  isAvailable() { return polymerDataCache.length > 0 },
  extract() { return extractPolymerData() },
}

function initPolymerWatcher() {
  window.addEventListener("message", (e) => {
    if (e.data?.type !== "__YT_POLYMER_DATA__") return
    try {
      polymerDataCache.push(JSON.parse(e.data.payload) as unknown)
      console.log("[ytPolymer] received data from main world, chunk", polymerDataCache.length)
      void scanAndCacheCandidates()
    } catch (err) {
      console.warn("[ytPolymer] failed to parse data:", err)
    }
  })
}

// ─── Parser state ─────────────────────────────────────────────────────────────

let observer: MutationObserver | null = null
let debounceTimer: number | null = null
let lastUrl = location.href

async function scanAndCacheCandidates() {
  const pageType = getPageType()
  const containers = getCandidateContainers()
  const seenVideoIds = new Set<string>()
  const entities: CacheEntityPayload[] = []

  for (const el of containers) {
    const candidate = parseVideoCard(el)
    if (!candidate || seenVideoIds.has(candidate.videoId)) continue
    seenVideoIds.add(candidate.videoId)
    entities.push({
      videoId: candidate.videoId,
      channelId: candidate.channelId,
      channelName: candidate.channelName,
      title: candidate.title,
      description: candidate.description,
      pageType: candidate.pageType,
      url: candidate.url,
    })
  }

  const dataSourceItems = extractAllVideoData()
  for (const [, item] of dataSourceItems) {
    if (!item.title) continue
    if (seenVideoIds.has(item.videoId)) {
      // Merge channelName/channelId vào entry đã có từ DOM nếu DOM bị thiếu
      const existing = entities.find((e) => e.videoId === item.videoId)
      if (existing) {
        if (!existing.channelName && item.channelName) existing.channelName = item.channelName
        if (!existing.channelId && item.channelId) existing.channelId = item.channelId
      }
      continue
    }
    seenVideoIds.add(item.videoId)
    entities.push({
      videoId: item.videoId,
      channelId: item.channelId,
      channelName: item.channelName,
      title: item.title,
      pageType,
      url: item.url,
    })
  }

  if (entities.length === 0) return

  try {
    const payload: CacheEntitiesBatchPayload = { entities }
    await chrome.runtime.sendMessage({ type: "CACHE_ENTITIES_BATCH", payload })
    void chrome.runtime.sendMessage({ type: "REFRESH_HIGHLIGHTS" })
  } catch (err) {
    console.error("[Parser] batch cache failed:", err)
  }

  console.log("[Parser] scan:", { pageType, entities: entities.length })
}

function scheduleScan() {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => void scanAndCacheCandidates(), 500)
}

function handlePotentialNavigation() {
  if (location.href !== lastUrl) {
    lastUrl = location.href
    scheduleScan()
    window.setTimeout(() => void scanAndCacheCandidates(), 800)
    window.setTimeout(() => void scanAndCacheCandidates(), 1800)
  }
}

function startObserver() {
  if (!document.body || observer) return
  observer = new MutationObserver(() => {
    handlePotentialNavigation()
    scheduleScan()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

export function initYouTubeParser() {
  registerDataSource(ytPolymerSource)

  initPolymerWatcher()

  startObserver()
  scheduleScan()
  window.setTimeout(() => void scanAndCacheCandidates(), 1200)
}