import type { PlasmoCSConfig } from "plasmo"
import { getCandidateContainers, parseVideoCard, getPageType } from "~contents/youtube-parser"
import { initYouTubeParser } from "~contents/parser"
import type { Rule } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { EntityCache } from "~core/types/entity"
import { evaluate } from "~core/rule-engine"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*"]
}

// ─── CSS injection ────────────────────────────────────────────────────────────

const STYLE_ID = "yt-filter-styles"

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    .yt-filter-flagged {
      outline: 2px solid #f5a623 !important;
      outline-offset: 2px !important;
      position: relative !important;
    }
    .yt-filter-flagged::after {
      content: "⚑";
      position: absolute;
      top: 4px;
      right: 4px;
      background: #f5a623;
      color: #fff;
      font-size: 11px;
      line-height: 1;
      padding: 2px 5px;
      border-radius: 4px;
      z-index: 9999;
      pointer-events: none;
    }
    .yt-filter-hidden {
      display: none !important;
    }
    .yt-filter-reason {
      position: absolute;
      bottom: 4px;
      left: 4px;
      background: rgba(0,0,0,0.75);
      color: #fff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      z-index: 9999;
      pointer-events: none;
      max-width: 90%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Placeholder hiển thị thay cho video bị hide khi debugMode */
    .yt-filter-hide-placeholder {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      padding: 8px 12px;
      background: rgba(180, 0, 0, 0.08);
      border: 1px dashed rgba(180, 0, 0, 0.35);
      border-radius: 8px;
      color: rgba(180, 0, 0, 0.7);
      font-size: 11px;
      font-family: sans-serif;
      gap: 6px;
      margin-bottom: 4px;
    }
    .yt-filter-hide-placeholder::before {
      content: "🚫";
      font-size: 13px;
      flex-shrink: 0;
    }
  `
  document.head.appendChild(style)
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const FILTER_ATTR = "data-yt-filter"
const PLACEHOLDER_ATTR = "data-yt-filter-placeholder-for"

function getContainerElement(el: Element): Element {
  return (
    el.closest(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer"
    ) || el.closest("yt-lockup-view-model") || el
  )
}

function clearPreviousMarks(el: Element) {
  el.classList.remove("yt-filter-flagged", "yt-filter-hidden")
  el.removeAttribute(FILTER_ATTR)
  el.querySelector(".yt-filter-reason")?.remove()
}

function removePlaceholderFor(containerEl: Element) {
  const videoId = containerEl.getAttribute("data-yt-filter-video-id")
  if (videoId) {
    document.querySelector(`[${PLACEHOLDER_ATTR}="${videoId}"]`)?.remove()
  }
}

function insertHidePlaceholder(containerEl: Element, reason: string, videoId: string) {
  // Avoid duplicate
  if (document.querySelector(`[${PLACEHOLDER_ATTR}="${videoId}"]`)) return

  containerEl.setAttribute("data-yt-filter-video-id", videoId)

  const placeholder = document.createElement("div")
  placeholder.className = "yt-filter-hide-placeholder"
  placeholder.setAttribute(PLACEHOLDER_ATTR, videoId)
  placeholder.textContent = `Đã ẩn: ${reason}`

  containerEl.parentElement?.insertBefore(placeholder, containerEl)
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadRules(): Promise<Rule[]> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_ALL_RULES" })
    if (response?.success && Array.isArray(response.data)) return response.data as Rule[]
  } catch (err) {
    console.error("[Highlights] failed to load rules:", err)
  }
  return []
}

async function loadSettings(): Promise<Settings | null> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
    if (response?.success && response.data) return response.data as Settings
  } catch (err) {
    console.error("[Highlights] failed to load settings:", err)
  }
  return null
}

async function loadEntityCache(): Promise<Map<string, EntityCache>> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_PARSED_CANDIDATES" })
    if (response?.success && Array.isArray(response.data)) {
      return new Map((response.data as EntityCache[]).map((e) => [e.videoId, e]))
    }
  } catch (err) {
    console.error("[Highlights] failed to load entity cache:", err)
  }
  return new Map()
}

// ─── Main apply pass ──────────────────────────────────────────────────────────

async function applyHighlights() {
  const [rules, settings, entityCache] = await Promise.all([
    loadRules(),
    loadSettings(),
    loadEntityCache(),
  ])

  if (!settings) return
  document.querySelectorAll(`[${PLACEHOLDER_ATTR}]`).forEach((el) => el.remove())

  if (rules.length === 0 || !settings.enabled) {
    document.querySelectorAll("[data-yt-filter]").forEach((el) => clearPreviousMarks(el))
    return
  }

  const containers = getCandidateContainers()
  const pageType = getPageType()
  let flagCount = 0
  let hideCount = 0

  for (const el of containers) {
    let candidate = parseVideoCard(el)
    const containerEl = getContainerElement(el)

    if (!candidate) continue

    // ── Enrich từ entity cache ─────────────────────────────────────────────
    // Luôn enrich nếu cache có entry — bất kể page type
    const cached = entityCache.get(candidate.videoId)
    if (cached) {
      candidate = {
        ...candidate,
        channelName: candidate.channelName ?? cached.channelName,
        channelId: candidate.channelId ?? cached.channelId,
      }
    }

    // Trên watch page: chỉ skip nếu THỰC SỰ không có đủ data để evaluate
    // (thiếu cả channelName lẫn channelId — rule keyword/title vẫn có thể chạy)
    if (pageType === "watch" && !candidate.channelName && !candidate.channelId && !cached) {
      console.log("[Highlights] watch page cache miss — skip", { videoId: candidate.videoId })
      continue
    }

    removePlaceholderFor(containerEl)
    clearPreviousMarks(containerEl)

    const decision = evaluate({ candidate, rules, settings })

    if (decision.action === "flag") {
      containerEl.classList.add("yt-filter-flagged")
      containerEl.setAttribute(FILTER_ATTR, "flagged")
      flagCount++
    } else if (decision.action === "hide") {
      containerEl.classList.add("yt-filter-hidden")
      containerEl.setAttribute(FILTER_ATTR, "hidden")
      hideCount++
    }

    if (decision.action !== "allow") {
      const winnerRule = rules.find((r) => r.id === decision.matchedRuleIds[0])
      console.log("[Highlights] match:", {
        action: decision.action,
        reason: decision.reason,
        videoId: candidate.videoId,
        title: candidate.title,
        channel: candidate.channelName,
      })
      if (winnerRule?.id) {
        void chrome.runtime.sendMessage({
          type: "LOG_MATCH",
          payload: {
            videoId: candidate.videoId,
            title: candidate.title,
            channelName: candidate.channelName,
            ruleId: winnerRule.id,
            ruleType: winnerRule.type,
            ruleTarget: winnerRule.targetRaw,
            action: decision.action,
            reason: decision.reason,
          },
        })
      }
    }

    if (settings.debugMode) {
      if (decision.action === "flag") {
        // Toast bên trong container (vẫn visible vì không bị hide)
        const toast = document.createElement("div")
        toast.className = "yt-filter-reason"
        toast.textContent = `[flag] ${decision.reason}`
        ;(containerEl as HTMLElement).style.position = "relative"
        containerEl.appendChild(toast)
      } else if (decision.action === "hide") {
        // Container bị display:none — insert placeholder bên ngoài thay thế
        insertHidePlaceholder(containerEl, decision.reason, candidate.videoId)
      }
    }
  }

  console.log("[Highlights] applied:", { flagCount, hideCount, totalRules: rules.length })
}

// ─── Observer + debounce ─────────────────────────────────────────────────────

let highlightTimer: number | null = null

function scheduleHighlight() {
  if (highlightTimer) window.clearTimeout(highlightTimer)
  highlightTimer = window.setTimeout(() => void applyHighlights(), 600)
}

let lastUrl = location.href
let highlightObserver: MutationObserver | null = null

function startHighlightObserver() {
  if (highlightObserver) return

  highlightObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      window.setTimeout(() => void applyHighlights(), 900)
      window.setTimeout(() => void applyHighlights(), 1900)
    }
    scheduleHighlight()
  })

  highlightObserver.observe(document.body, { childList: true, subtree: true })
}

// ─── Init ─────────────────────────────────────────────────────────────────────

console.log("[Highlights] content script loaded")

injectStyles()
initYouTubeParser()
startHighlightObserver()

void applyHighlights()
window.setTimeout(() => void applyHighlights(), 1200)
window.setTimeout(() => void applyHighlights(), 2500)

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REFRESH_HIGHLIGHTS") {
    console.log("[Highlights] refresh requested")
    void applyHighlights()
    sendResponse({ success: true, data: { ok: true } })
    return true
  }
  return false
})