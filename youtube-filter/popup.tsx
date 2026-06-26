import { useEffect, useRef, useState } from "react"
import type { Rule } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { Message, MessageResponse, CreateRulePayload } from "~core/messages"

// ─── messaging ────────────────────────────────────────────────────────────────

async function send<T = unknown>(message: Message): Promise<T> {
  const res = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>
  if (!res?.success) throw new Error(res?.error || "Unknown error")
  return res.data as T
}

async function refreshTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
    await Promise.all(
      tabs.map((t) =>
        t.id
          ? chrome.tabs.sendMessage(t.id, { type: "REFRESH_HIGHLIGHTS" }).catch(() => {})
          : Promise.resolve()
      )
    )
  } catch {}
}

// ─── styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    background: #ffffff;
    color: #111111;
    width: 320px;
    min-height: 100px;
  }

  .root {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px 12px;
    border-bottom: 1px solid #ebebeb;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .logo-mark {
    width: 22px; height: 22px;
    background: #ff3d3d;
    border-radius: 5px;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600; color: #fff; letter-spacing: -0.5px;
    flex-shrink: 0;
  }
  .logo-text {
    font-size: 13px; font-weight: 600; color: #111111; letter-spacing: -0.2px;
  }
  .header-actions { display: flex; gap: 6px; align-items: center; }

  /* pill toggle */
  .pill-toggle {
    display: flex;
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 20px;
    padding: 2px;
    gap: 2px;
  }
  .pill-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; font-weight: 500;
    border: none; cursor: pointer;
    border-radius: 16px;
    padding: 4px 10px;
    transition: all 0.15s;
    background: transparent;
    color: #999999;
  }
  .pill-btn.active-on  { background: #f0faf4; color: #16a34a; }
  .pill-btn.active-off { background: #fff0f0; color: #dc2626; }

  /* icon button */
  .icon-btn {
    width: 28px; height: 28px;
    background: #f5f5f5; border: 1px solid #e0e0e0;
    border-radius: 7px; cursor: pointer; color: #888888;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; transition: all 0.15s;
  }
  .icon-btn:hover { background: #ebebeb; color: #333333; border-color: #d0d0d0; }
  .icon-btn.debug-on { background: #eff6ff; color: #3b82f6; border-color: #bfdbfe; }

  /* status bar */
  .status-bar {
    padding: 8px 16px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 11px;
    color: #aaaaaa;
    font-family: 'DM Mono', monospace;
    display: flex; gap: 12px;
    background: #fafafa;
  }
  .status-item { display: flex; gap: 4px; }
  .status-val { color: #555555; }

  /* add rule */
  .add-section {
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
  }
  .add-row { display: flex; gap: 6px; }
  .add-input {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    background: #f7f7f7;
    border: 1px solid #e0e0e0;
    border-radius: 7px;
    padding: 7px 10px;
    color: #111111;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .add-input::placeholder { color: #cccccc; }
  .add-input:focus { border-color: #ff3d3d88; box-shadow: 0 0 0 2px #ff3d3d14; }

  .action-toggle {
    display: flex;
    background: #f7f7f7;
    border: 1px solid #e0e0e0;
    border-radius: 7px;
    overflow: hidden;
  }
  .act-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 0 9px;
    background: transparent; color: #bbbbbb;
    transition: all 0.15s;
  }
  .act-btn.sel-hide { background: #fff0f0; color: #dc2626; }
  .act-btn.sel-flag { background: #fffbeb; color: #d97706; }

  .add-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    background: #ff3d3d;
    color: #fff; border: none;
    border-radius: 7px; padding: 0 12px;
    cursor: pointer; transition: background 0.15s;
    white-space: nowrap;
  }
  .add-btn:hover { background: #e83535; }
  .add-btn:disabled { background: #f5d0d0; color: #cc9999; cursor: default; }

  /* rules list */
  .rules-section { max-height: 240px; overflow-y: auto; }
  .rules-section::-webkit-scrollbar { width: 3px; }
  .rules-section::-webkit-scrollbar-track { background: transparent; }
  .rules-section::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }

  .empty-state {
    padding: 24px 16px;
    text-align: center;
    color: #cccccc;
    font-size: 12px;
  }

  .rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid #f5f5f5;
    transition: background 0.1s;
  }
  .rule-row:hover { background: #fafafa; }
  .rule-row.disabled { opacity: 0.4; }

  .rule-type-badge {
    font-family: 'DM Mono', monospace;
    font-size: 9px; font-weight: 500;
    color: #aaaaaa; background: #f3f3f3;
    border: 1px solid #e8e8e8;
    padding: 2px 5px; border-radius: 3px;
    flex-shrink: 0; letter-spacing: 0.03em;
  }

  .rule-target {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #333333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 10px; font-weight: 500;
    padding: 2px 6px; border-radius: 4px;
    flex-shrink: 0; font-family: 'DM Sans', sans-serif;
  }
  .badge-hide { background: #fff0f0; color: #dc2626; }
  .badge-flag { background: #fffbeb; color: #d97706; }

  .rule-action-btn {
    width: 22px; height: 22px;
    background: transparent; border: 1px solid #e5e5e5;
    border-radius: 5px; cursor: pointer;
    color: #cccccc; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .rule-action-btn:hover { background: #f0f0f0; color: #555555; border-color: #d0d0d0; }
  .rule-action-btn.del:hover { background: #fff0f0; color: #dc2626; border-color: #ffd4d4; }

  /* footer */
  .footer {
    padding: 10px 16px;
    border-top: 1px solid #f0f0f0;
    display: flex; justify-content: space-between; align-items: center;
    background: #fafafa;
  }
  .footer-link {
    font-size: 11px; color: #999999; cursor: pointer;
    background: none; border: none; font-family: 'DM Sans', sans-serif;
    transition: color 0.15s;
  }
  .footer-link:hover { color: #333333; }
  .rules-count { font-size: 11px; color: #cccccc; font-family: 'DM Mono', monospace; }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .rule-row { animation: fadeIn 0.15s ease; }
`

// ─── helpers ─────────────────────────────────────────────────────────────────

function typeBadge(type: string) {
  if (type === "channelName") return "ch"
  if (type === "channelId") return "id"
  if (type === "videoId") return "vid"
  if (type === "regex") return "re"
  return "kw"
}

// ─── component ────────────────────────────────────────────────────────────────

export default function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [input, setInput] = useState("")
  const [newAction, setNewAction] = useState<"hide" | "flag">("hide")
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    try {
      const [s, r] = await Promise.all([
        send<Settings>({ type: "GET_SETTINGS" }),
        send<Rule[]>({ type: "GET_ALL_RULES" }),
      ])
      setSettings(s)
      setRules(r)
      setNewAction(s.defaultAction ?? "hide")
    } finally {
      setLoading(false)
    }
  }

  async function toggleEnabled() {
    if (!settings) return
    const s = await send<Settings>({ type: "SAVE_SETTINGS", payload: { enabled: !settings.enabled } })
    setSettings(s)
    await refreshTabs()
  }

  async function toggleDebug() {
    if (!settings) return
    const s = await send<Settings>({ type: "SAVE_SETTINGS", payload: { debugMode: !settings.debugMode } })
    setSettings(s)
  }

  async function addRule() {
    const trimmed = input.trim()
    if (!trimmed) return
    const payload: CreateRulePayload = { type: "keyword", targetRaw: trimmed, action: newAction }
    const updated = await send<Rule[]>({ type: "CREATE_RULE", payload })
    setRules(updated)
    setInput("")
    inputRef.current?.focus()
    await refreshTabs()
  }

  async function toggleRule(rule: Rule) {
    if (!rule.id) return
    const updated = await send<Rule[]>({ type: "SET_RULE_ENABLED", payload: { id: rule.id, enabled: !rule.enabled } })
    setRules(updated)
  }

  async function deleteRule(id?: number) {
    if (!id) return
    const updated = await send<Rule[]>({ type: "DELETE_RULE", payload: id })
    setRules(updated)
    await refreshTabs()
  }

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div style={{ width: 320, padding: 24, textAlign: "center", fontFamily: "DM Sans, sans-serif", color: "#aaaaaa", fontSize: 12 }}>
          loading…
        </div>
      </>
    )
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <>
      <style>{css}</style>
      <div className="root">

        {/* Header */}
        <div className="header">
          <div className="logo">
            <div className="logo-mark">YF</div>
            <span className="logo-text">YT Filter</span>
          </div>
          <div className="header-actions">
            <button
              className={`icon-btn ${settings?.debugMode ? "debug-on" : ""}`}
              title={settings?.debugMode ? "Debug bật" : "Debug tắt"}
              onClick={() => void toggleDebug()}
            >
              ⬡
            </button>
            <div className="pill-toggle">
              <button
                className={`pill-btn ${settings?.enabled ? "active-on" : ""}`}
                onClick={() => void toggleEnabled()}
              >
                {settings?.enabled ? "on" : "–"}
              </button>
              <button
                className={`pill-btn ${!settings?.enabled ? "active-off" : ""}`}
                onClick={() => void toggleEnabled()}
              >
                {!settings?.enabled ? "off" : "–"}
              </button>
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="status-bar">
          <div className="status-item">
            <span>rules</span>
            <span className="status-val">{rules.length}</span>
          </div>
          <div className="status-item">
            <span>active</span>
            <span className="status-val">{enabledCount}</span>
          </div>
          <div className="status-item">
            <span>debug</span>
            <span className="status-val">{settings?.debugMode ? "on" : "off"}</span>
          </div>
        </div>

        {/* Add keyword rule */}
        <div className="add-section">
          <div className="add-row">
            <input
              ref={inputRef}
              className="add-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addRule()}
              placeholder="từ khóa…"
            />
            <div className="action-toggle">
              <button
                className={`act-btn ${newAction === "hide" ? "sel-hide" : ""}`}
                onClick={() => setNewAction("hide")}
                title="ẩn"
              >H</button>
              <button
                className={`act-btn ${newAction === "flag" ? "sel-flag" : ""}`}
                onClick={() => setNewAction("flag")}
                title="đánh dấu"
              >F</button>
            </div>
            <button className="add-btn" onClick={() => void addRule()} disabled={!input.trim()}>
              Thêm
            </button>
          </div>
        </div>

        {/* Rules */}
        <div className="rules-section">
          {rules.length === 0 ? (
            <div className="empty-state">chưa có rules</div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className={`rule-row ${rule.enabled ? "" : "disabled"}`}>
                <span className="rule-type-badge">{typeBadge(rule.type)}</span>
                <span className="rule-target" title={rule.targetRaw}>{rule.targetRaw}</span>
                <span className={`badge ${rule.action === "hide" ? "badge-hide" : "badge-flag"}`}>
                  {rule.action === "hide" ? "ẩn" : "⚑"}
                </span>
                <button
                  className="rule-action-btn"
                  title={rule.enabled ? "tắt" : "bật"}
                  onClick={() => void toggleRule(rule)}
                >
                  {rule.enabled ? "●" : "○"}
                </button>
                <button
                  className="rule-action-btn del"
                  title="xóa"
                  onClick={() => void deleteRule(rule.id)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="footer">
          <button className="footer-link" onClick={() => chrome.runtime.openOptionsPage()}>
            quản lý rules →
          </button>
          <span className="rules-count">{rules.length} rules</span>
        </div>

      </div>
    </>
  )
}
