import { getCandidateContainers, getPageType, parseVideoCard } from "~contents/youtube-parser"
import type { CacheEntitiesBatchPayload, CacheEntityPayload } from "~core/messages"
import { registerDataSource, extractAllVideoData } from "~contents/data-sources/index"
import { ytInitialDataSource } from "~contents/data-sources/ytInitialData"
import { ytApiInterceptorSource, initYtApiInterceptor } from "~contents/data-sources/ytApiInterceptor"

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
      pageType: candidate.pageType,
      url: candidate.url,
    })
  }

  const dataSourceItems = extractAllVideoData()
  for (const [, item] of dataSourceItems) {
    if (!item.title || seenVideoIds.has(item.videoId)) continue
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
    // Trigger highlights refresh sau khi cache đã được write xong
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
  registerDataSource(ytInitialDataSource)
  registerDataSource(ytApiInterceptorSource)
  initYtApiInterceptor()

  startObserver()
  scheduleScan()
  window.setTimeout(() => void scanAndCacheCandidates(), 1200)
}
