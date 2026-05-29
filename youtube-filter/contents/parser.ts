import { getCandidateContainers, getPageType, parseVideoCard } from "~contents/youtube-parser"
import type { CacheEntityPayload } from "~core/messages"

let observer: MutationObserver | null = null
let debounceTimer: number | null = null
let lastUrl = location.href

async function cacheEntity(payload: CacheEntityPayload) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "CACHE_ENTITY",
      payload
    })

    console.log("[Parser] CACHE_ENTITY response:", response)
  } catch (error) {
    console.error("[Parser] CACHE_ENTITY failed:", error)
  }
}

async function scanAndCacheCandidates() {
  const pageType = getPageType()
  const containers = getCandidateContainers()

  let parsedCount = 0
  let skippedNullCandidate = 0
  let skippedDuplicate = 0

  const seenVideoIds = new Set<string>()

  for (const el of containers) {
    const candidate = parseVideoCard(el)

    if (!candidate) {
      skippedNullCandidate++
      continue
    }

    if (seenVideoIds.has(candidate.videoId)) {
      skippedDuplicate++
      continue
    }

    seenVideoIds.add(candidate.videoId)

    await cacheEntity({
      videoId: candidate.videoId,
      channelId: candidate.channelId,
      channelName: candidate.channelName,
      title: candidate.title,
      pageType: candidate.pageType,
      url: candidate.url
    })

    parsedCount++
  }

  console.log("[Parser] scan summary:", {
    pageType,
    total: containers.length,
    parsedCount,
    skippedNullCandidate,
    skippedDuplicate,
    uniqueVideoIds: seenVideoIds.size
  })
}

function scheduleScan() {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer)
  }

  debounceTimer = window.setTimeout(() => {
    void scanAndCacheCandidates()
  }, 500)
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
  if (!document.body || observer) {
    return
  }

  observer = new MutationObserver(() => {
    handlePotentialNavigation()
    scheduleScan()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

export function initYouTubeParser() {
  startObserver()
  scheduleScan()
  window.setTimeout(() => void scanAndCacheCandidates(), 1200)
}