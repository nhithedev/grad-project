import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*"],
  world: "MAIN",
  run_at: "document_start",
}

// Chạy trong main world — patch fetch + access Polymer JS properties
// Gửi raw data sang isolated world (parser.ts) qua postMessage

function sendRawData(data: unknown) {
  try {
    window.postMessage({ type: "__YT_POLYMER_DATA__", payload: JSON.stringify(data) }, "*")
  } catch (e) {
    console.warn("[polymer-bridge] postMessage failed:", e)
  }
}

// Intercept fetch trong MAIN world — bắt /youtubei/v1/next lazy-load sidebar
const _originalFetch = window.fetch
window.fetch = async function (...args: Parameters<typeof fetch>) {
  const response = await _originalFetch.apply(this, args)
  const url = args[0] instanceof Request ? args[0].url : String(args[0])
  if (url.includes("/youtubei/v1/next")) {
    response.clone().json().then((body: unknown) => {
      sendRawData(body)
      console.log("[polymer-bridge] intercepted /youtubei/v1/next")
    }).catch(() => {})
  }
  return response
}

// Đọc ytInitialData từ MAIN world (không accessible từ isolated world)
function trySendYtInitialData(): boolean {
  const ytData = (window as unknown as { ytInitialData?: unknown }).ytInitialData
  if (!ytData || typeof ytData !== "object") return false
  sendRawData(ytData)
  console.log("[polymer-bridge] sent ytInitialData")
  return true
}

// Đọc Polymer .data cho watch page sidebar — bỏ qua khi còn là array rỗng
function tryReadPolymerData(): boolean {
  const el = document.querySelector("ytd-watch-next-secondary-results-renderer") as (Element & { data?: unknown }) | null
  if (!el) return false
  const data = el.data
  if (!data || (Array.isArray(data) && data.length === 0)) return false
  sendRawData(data)
  console.log("[polymer-bridge] sent polymer .data")
  return true
}

function watchForData() {
  trySendYtInitialData()
  if (!tryReadPolymerData()) {
    const mo = new MutationObserver(() => {
      if (tryReadPolymerData()) mo.disconnect()
    })
    mo.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => tryReadPolymerData(), 500)
    setTimeout(() => tryReadPolymerData(), 1500)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", watchForData)
} else {
  watchForData()
}