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
    if (fullUrl.pathname === "/watch") return fullUrl.searchParams.get("v")
    if (fullUrl.pathname.startsWith("/shorts/")) return fullUrl.pathname.split("/")[2] || null
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

/** Heuristic: "5:43" or "1:23:45" is a duration, not a title */
function looksLikeDuration(s: string): boolean {
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(s.trim())
}

/**
 * Resolve title anchor — supports both legacy ytd-* components and
 * the new yt-lockup-view-model layout used on home feed.
 */
function resolveTitleAnchor(el: Element): { anchor: HTMLAnchorElement; title: string } | null {
  // ── NEW: yt-lockup-view-model (home feed, 2024+) ─────────────────────────
  const lockupAnchor = el.querySelector<HTMLAnchorElement>("a.ytLockupMetadataViewModelTitle")
  if (lockupAnchor) {
    // Title is on the parent <h3 title="..."> or as aria-label on the anchor
    const h3 = lockupAnchor.closest("h3")
    const title =
      h3?.getAttribute("title")?.trim() ||
      lockupAnchor.getAttribute("aria-label")?.trim() ||
      lockupAnchor.textContent?.trim()
    if (title && !looksLikeDuration(title)) {
      return { anchor: lockupAnchor, title }
    }
  }

  // ── LEGACY: ytd-* components (search, watch sidebar, old home) ───────────
  const legacyAnchor =
    el instanceof HTMLAnchorElement ? el : (
      el.querySelector<HTMLAnchorElement>("a#video-title-link") ||
      el.querySelector<HTMLAnchorElement>("a#video-title") ||
      el.querySelector<HTMLAnchorElement>("#video-title-link") ||
      el.querySelector<HTMLAnchorElement>("#video-title") ||
      el.querySelector<HTMLAnchorElement>('a[href*="/watch?v="][title]') ||
      el.querySelector<HTMLAnchorElement>('a[href*="/watch?v="]') ||
      el.querySelector<HTMLAnchorElement>('a[href*="/shorts/"]')
    )

  if (!legacyAnchor) return null

  const title = [
    legacyAnchor.getAttribute("title")?.trim(),
    legacyAnchor.textContent?.trim(),
    legacyAnchor.getAttribute("aria-label")?.trim(),
  ].find((t) => t && !looksLikeDuration(t))

  if (!title) return null
  return { anchor: legacyAnchor, title }
}

// ─── Channel resolution ───────────────────────────────────────────────────────

/**
 * Trả về { channelName, channelId } từ container element.
 *
 * Collab channels (A & MrBeast): YouTube render nhiều anchor channel
 * trong cùng một metadata row — lấy tất cả và join lại.
 * Ví dụ: "Channel A & MrBeast" → keyword "mrbeast" vẫn match.
 */
function resolveChannelInfo(el: Element): { channelName: string | undefined; channelId: string | undefined } {
  // ── NEW lockup layout ──────────────────────────────────────────────────────
  // Lấy tất cả channel anchors trong metadata row (collab có nhiều anchor)
  const lockupAnchors = Array.from(
    el.querySelectorAll<HTMLAnchorElement>(
      "a.ytAttributedStringLink[href^='/@'], a.ytAttributedStringLink[href^='/channel/']"
    )
  )

  if (lockupAnchors.length > 0) {
    // Join tên tất cả channels, dedupe nếu trùng
    const names = lockupAnchors
      .map((a) => a.textContent?.trim())
      .filter((n): n is string => !!n)
    const unique = [...new Set(names)]
    const channelName = unique.join(" & ") || undefined

    // channelId lấy từ anchor đầu tiên có /channel/ href
    const idAnchor = lockupAnchors.find((a) => a.getAttribute("href")?.startsWith("/channel/"))
    const channelId = getChannelIdFromHref(idAnchor?.getAttribute("href"))

    return { channelName, channelId }
  }

  // ── LEGACY ytd-* components ────────────────────────────────────────────────
  const legacyAnchor =
    el.querySelector<HTMLAnchorElement>("#channel-name a") ||
    el.querySelector<HTMLAnchorElement>("ytd-channel-name a") ||
    el.querySelector<HTMLAnchorElement>('a[href^="/@"]') ||
    el.querySelector<HTMLAnchorElement>('a[href^="/channel/"]')

  if (!legacyAnchor) return { channelName: undefined, channelId: undefined }

  return {
    channelName: legacyAnchor.textContent?.trim() || undefined,
    channelId: getChannelIdFromHref(legacyAnchor.getAttribute("href")),
  }
}

// ─── Description resolution ───────────────────────────────────────────────────

function resolveDescription(el: Element): string | undefined {
  return (
    el.querySelector<HTMLElement>("yt-formatted-string.metadata-snippet-text")
      ?.textContent?.trim() || undefined
  )
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseVideoCard(el: Element): VideoCandidate | null {
  const pageType = getPageType()

  const resolved = resolveTitleAnchor(el)
  if (!resolved) {
    console.log("[Parser] skip null candidate — no title anchor", {
      pageType,
      tagName: el.tagName,
      html: (el as HTMLElement).outerHTML.slice(0, 300),
    })
    return null
  }

  const { anchor: titleAnchor, title: rawTitle } = resolved
  const href = titleAnchor.getAttribute("href")
  const videoId = getVideoIdFromUrl(href)

  if (!videoId) {
    console.log("[Parser] skip null candidate — no videoId", { pageType, href })
    return null
  }

  const { channelName, channelId } = resolveChannelInfo(el)

  return {
    videoId,
    title: rawTitle,
    channelName,
    channelId,
    description: resolveDescription(el),
    pageType,
    source: "dom",
    url: href ? new URL(href, location.origin).toString() : undefined,
    seenAt: nowIso(),
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
    // YouTube đã migrate watch sidebar sang yt-lockup-view-model bên trong ytd-item-section-renderer
    return Array.from(
      document.querySelectorAll(
        "#related yt-lockup-view-model, ytd-watch-next-secondary-results-renderer yt-lockup-view-model, #related ytd-compact-video-renderer"
      )
    )
  }

  return Array.from(
    document.querySelectorAll(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model"
    )
  )
}