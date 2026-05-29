import type { VideoCandidate, YouTubePageType } from "~core/types/candidate"
import { nowIso } from "~data/utils/normalize"

export function getPageType(): YouTubePageType {
  const path = location.pathname

  if (path === "/") return "home"
  if (path.startsWith("/results")) return "search"
  if (path.startsWith("/watch")) return "watch"

  return "unknown"
}

export function getVideoIdFromUrl(url?: string | null) {
  if (!url) return null

  try {
    const fullUrl = new URL(url, location.origin)

    if (fullUrl.pathname === "/watch") {
      return fullUrl.searchParams.get("v")
    }

    if (fullUrl.pathname.startsWith("/shorts/")) {
      return fullUrl.pathname.split("/")[2] || null
    }
  } catch {
    return null
  }

  return null
}

export function getChannelIdFromHref(href?: string | null) {
  if (!href) return undefined
  if (href.startsWith("/channel/")) return href.split("/")[2]
  return undefined
}

// ─── Title resolution ─────────────────────────────────────────────────────────

function resolveTitleAnchor(el: Element): HTMLAnchorElement | null {
  if (el instanceof HTMLAnchorElement) {
    return el
  }

  return (
    el.querySelector<HTMLAnchorElement>("a#video-title-link") ||
    el.querySelector<HTMLAnchorElement>("a#video-title") ||
    el.querySelector<HTMLAnchorElement>("#video-title-link") ||
    el.querySelector<HTMLAnchorElement>("#video-title") ||
    el.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]')
  )
}

/**
 * For watch page: the container element is an <a href="/watch?v=..."> anchor
 * whose text content is the video duration, not the title.
 * The actual title lives in a sibling/child element with id="video-title"
 * or aria-label on the anchor itself, or in ytd-compact-video-renderer.
 */
function resolveTitleForWatchAnchor(anchor: HTMLAnchorElement): string | undefined {
  // 1. aria-label on the anchor is often the full title
  const ariaLabel = anchor.getAttribute("aria-label")?.trim()
  if (ariaLabel && !looksLikeDuration(ariaLabel)) return ariaLabel

  // 2. Climb to the closest card wrapper and look for #video-title
  const card = anchor.closest(
    "ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, ytd-grid-video-renderer"
  )
  if (card) {
    const titleEl =
      card.querySelector<HTMLElement>("#video-title") ||
      card.querySelector<HTMLElement>("span#video-title") ||
      card.querySelector<HTMLElement>('a[id="video-title"]')
    const t = titleEl?.getAttribute("title")?.trim() || titleEl?.textContent?.trim()
    if (t && !looksLikeDuration(t)) return t
  }

  // 3. Check title attribute on anchor (sometimes present)
  const attrTitle = anchor.getAttribute("title")?.trim()
  if (attrTitle && !looksLikeDuration(attrTitle)) return attrTitle

  return undefined
}

/** Heuristic: "5:43" or "1:23:45" is a duration, not a title */
function looksLikeDuration(s: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.trim())
}

// ─── Scope root ───────────────────────────────────────────────────────────────

function resolveScopeRoot(el: Element): Element {
  if (el instanceof HTMLAnchorElement) {
    return (
      el.closest(
        "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"
      ) ||
      el.parentElement ||
      el
    )
  }
  return el
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseVideoCard(el: Element): VideoCandidate | null {
  const pageType = getPageType()

  // ── Watch page: el is an <a href="/watch?v=..."> ──────────────────────────
  if (pageType === "watch" && el instanceof HTMLAnchorElement) {
    const href = el.getAttribute("href")
    const videoId = getVideoIdFromUrl(href)
    if (!videoId) return null

    const rawTitle = resolveTitleForWatchAnchor(el)
    if (!rawTitle) {
      console.log("[Parser] skip watch candidate — no title", { href })
      return null
    }

    // Channel info: look in the card wrapper
    const card = el.closest(
      "ytd-compact-video-renderer, ytd-playlist-panel-video-renderer, ytd-grid-video-renderer"
    )
    const channelAnchor = card?.querySelector<HTMLAnchorElement>(
      '#channel-name a, a[href^="/@"], a[href^="/channel/"]'
    )
    const channelName = channelAnchor?.textContent?.trim() || undefined
    const channelId = getChannelIdFromHref(channelAnchor?.getAttribute("href"))

    return {
      videoId,
      title: rawTitle,
      channelName,
      channelId,
      pageType,
      source: "dom",
      url: href ? new URL(href, location.origin).toString() : undefined,
      seenAt: nowIso()
    }
  }

  // ── Home / search pages ───────────────────────────────────────────────────
  const scopeRoot = resolveScopeRoot(el)
  const titleAnchor = resolveTitleAnchor(scopeRoot)

  const rawTitle =
    titleAnchor?.getAttribute("title")?.trim() ||
    titleAnchor?.textContent?.trim() ||
    titleAnchor?.getAttribute("aria-label")?.trim()

  const href = titleAnchor?.getAttribute("href")
  const videoId = getVideoIdFromUrl(href)

  if (!rawTitle || !videoId) {
    console.log("[Parser] skip null candidate", {
      pageType,
      tagName: el.tagName,
      title: rawTitle,
      href,
      html: (scopeRoot as HTMLElement).outerHTML.slice(0, 400)
    })
    return null
  }

  const channelAnchor =
    scopeRoot.querySelector<HTMLAnchorElement>("#channel-name a") ||
    scopeRoot.querySelector<HTMLAnchorElement>('a[href^="/@"]') ||
    scopeRoot.querySelector<HTMLAnchorElement>('a[href^="/channel/"]')

  const channelName = channelAnchor?.textContent?.trim() || undefined
  const channelId = getChannelIdFromHref(channelAnchor?.getAttribute("href"))

  return {
    videoId,
    title: rawTitle,
    channelName,
    channelId,
    pageType,
    source: "dom",
    url: href ? new URL(href, location.origin).toString() : undefined,
    seenAt: nowIso()
  }
}

// ─── Container selectors ──────────────────────────────────────────────────────

export function getCandidateContainers(): Element[] {
  const pageType = getPageType()

  if (pageType === "home") {
    return Array.from(
      document.querySelectorAll("ytd-rich-item-renderer, ytd-grid-video-renderer")
    )
  }

  if (pageType === "search") {
    return Array.from(document.querySelectorAll("ytd-video-renderer"))
  }

  if (pageType === "watch") {
    return Array.from(
      document.querySelectorAll(
        "#related a[href*='/watch?v='], ytd-watch-next-secondary-results-renderer a[href*='/watch?v=']"
      )
    )
  }

  return Array.from(
    document.querySelectorAll(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer"
    )
  )
}