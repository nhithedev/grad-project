import type { PlasmoCSConfig } from "plasmo"
import { getCandidateContainers, getPageType, parseVideoCard } from "~contents/youtube-parser"
import { initYouTubeParser } from "~contents/parser"
import type { Rule } from "~core/types/rule"
import { normalizeText } from "~data/utils/normalize"

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
  `
  document.head.appendChild(style)
}

// ─── Rule matching ────────────────────────────────────────────────────────────

function matchesRule(
  rule: Rule,
  candidate: { title: string; channelName?: string; channelId?: string; videoId: string }
): boolean {
  if (!rule.enabled) return false

  const target = rule.targetNormalized

  switch (rule.type) {
    case "keyword":
      return (
        normalizeText(candidate.title).includes(target) ||
        (candidate.channelName ? normalizeText(candidate.channelName).includes(target) : false)
      )
    case "channelName":
      return candidate.channelName
        ? normalizeText(candidate.channelName).includes(target)
        : false
    case "channelId":
      return candidate.channelId
        ? normalizeText(candidate.channelId) === target
        : false
    case "videoId":
      return normalizeText(candidate.videoId) === target
    default:
      return false
  }
}

function getBestAction(
  rules: Rule[],
  candidate: { title: string; channelName?: string; channelId?: string; videoId: string }
): "hide" | "flag" | null {
  let hasFlagged = false

  for (const rule of rules) {
    if (!matchesRule(rule, candidate)) continue
    if (rule.action === "hide") return "hide"   // hide beats flag
    if (rule.action === "flag") hasFlagged = true
  }

  return hasFlagged ? "flag" : null
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

const FILTER_ATTR = "data-yt-filter"

function getContainerElement(el: Element): Element {
  // For watch page we get <a> tags — climb to the card wrapper
  return (
    el.closest(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"
    ) || el
  )
}

function clearPreviousMarks(el: Element) {
  el.classList.remove("yt-filter-flagged", "yt-filter-hidden")
  el.removeAttribute(FILTER_ATTR)
}

// ─── Main apply pass ──────────────────────────────────────────────────────────

async function loadRules(): Promise<Rule[]> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_ALL_RULES" })
    if (response?.success && Array.isArray(response.data)) {
      return response.data as Rule[]
    }
  } catch (err) {
    console.error("[Highlights] failed to load rules:", err)
  }
  return []
}

async function applyHighlights() {
  const rules = await loadRules()

  if (rules.length === 0) {
    // No rules — clear any leftover marks and exit
    document
      .querySelectorAll("[data-yt-filter]")
      .forEach((el) => clearPreviousMarks(el))
    return
  }

  const containers = getCandidateContainers()
  let flagCount = 0
  let hideCount = 0

  for (const el of containers) {
    const candidate = parseVideoCard(el)
    const containerEl = getContainerElement(el)

    // Always clear first so stale marks don't linger after rule changes
    clearPreviousMarks(containerEl)

    if (!candidate) continue

    const action = getBestAction(rules, candidate)

    if (action === "flag") {
      containerEl.classList.add("yt-filter-flagged")
      containerEl.setAttribute(FILTER_ATTR, "flagged")
      flagCount++
    } else if (action === "hide") {
      containerEl.classList.add("yt-filter-hidden")
      containerEl.setAttribute(FILTER_ATTR, "hidden")
      hideCount++
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
      // Page navigation — wait for YouTube SPA to settle
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
initYouTubeParser()    // cache entities as before
startHighlightObserver()

// Initial scan — stagger to catch YouTube's lazy render
void applyHighlights()
window.setTimeout(() => void applyHighlights(), 1200)
window.setTimeout(() => void applyHighlights(), 2500)

// Listen for rule changes from popup/options
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REFRESH_HIGHLIGHTS") {
    console.log("[Highlights] refresh requested")
    void applyHighlights()
    sendResponse({ success: true, data: { ok: true } })
    return true
  }
  return false
})