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
    background: #0f0f0f;
    color: #e8e6e0;
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
    border-bottom: 1px solid #222;
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
    font-size: 13px; font-weight: 600; color: #e8e6e0; letter-spacing: -0.2px;
  }
  .header-actions { display: flex; gap: 6px; align-items: center; }

  /* pill toggle */
  .pill-toggle {
    display: flex;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
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
    color: #666;
  }
  .pill-btn.active-on  { background: #1a3a1a; color: #4ade80; }
  .pill-btn.active-off { background: #3a1a1a; color: #f87171; }

  /* icon button */
  .icon-btn {
    width: 28px; height: 28px;
    background: #1a1a1a; border: 1px solid #2a2a2a;
    border-radius: 7px; cursor: pointer; color: #888;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; transition: all 0.15s;
  }
  .icon-btn:hover { background: #222; color: #e8e6e0; border-color: #333; }
  .icon-btn.debug-on { background: #1a2a3a; color: #60a5fa; border-color: #1e3a5a; }

  /* status bar */
  .status-bar {
    padding: 8px 16px;
    border-bottom: 1px solid #1a1a1a;
    font-size: 11px;
    color: #555;
    font-family: 'DM Mono', monospace;
    display: flex; gap: 12px;
  }
  .status-item { display: flex; gap: 4px; }
  .status-val { color: #888; }

  /* add rule */
  .add-section {
    padding: 12px 16px;
    border-bottom: 1px solid #1a1a1a;
  }
  .add-row { display: flex; gap: 6px; }
  .add-input {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    background: #161616;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    padding: 7px 10px;
    color: #e8e6e0;
    outline: none;
    transition: border-color 0.15s;
  }
  .add-input::placeholder { color: #444; }
  .add-input:focus { border-color: #ff3d3d44; }
  .add-input:focus { box-shadow: 0 0 0 2px #ff3d3d14; }

  .action-toggle {
    display: flex;
    background: #161616;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    overflow: hidden;
  }
  .act-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 0 9px;
    background: transparent; color: #555;
    transition: all 0.15s;
  }
  .act-btn.sel-hide { background: #2a1414; color: #f87171; }
  .act-btn.sel-flag { background: #2a2210; color: #fbbf24; }

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
  .add-btn:disabled { background: #2a1414; color: #663333; cursor: default; }

  /* rules list */
  .rules-section { max-height: 240px; overflow-y: auto; }
  .rules-section::-webkit-scrollbar { width: 3px; }
  .rules-section::-webkit-scrollbar-track { background: transparent; }
  .rules-section::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }

  .empty-state {
    padding: 24px 16px;
    text-align: center;
    color: #444;
    font-size: 12px;
  }

  .rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid #161616;
    transition: background 0.1s;
  }
  .rule-row:hover { background: #141414; }
  .rule-row.disabled { opacity: 0.4; }

  .rule-type-badge {
    font-family: 'DM Mono', monospace;
    font-size: 9px; font-weight: 500;
    color: #444; background: #1a1a1a;
    border: 1px solid #252525;
    padding: 2px 5px; border-radius: 3px;
    flex-shrink: 0; letter-spacing: 0.03em;
  }

  .rule-target {
    flex: 1;
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    color: #ccc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    font-size: 10px; font-weight: 500;
    padding: 2px 6px; border-radius: 4px;
    flex-shrink: 0; font-family: 'DM Sans', sans-serif;
  }
  .badge-hide { background: #2a1414; color: #f87171; }
  .badge-flag { background: #2a2210; color: #fbbf24; }

  .rule-action-btn {
    width: 22px; height: 22px;
    background: transparent; border: 1px solid #2a2a2a;
    border-radius: 5px; cursor: pointer;
    color: #555; font-size: 11px;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; flex-shrink: 0;
  }
  .rule-action-btn:hover { background: #2a2a2a; color: #e8e6e0; }
  .rule-action-btn.del:hover { background: #2a1414; color: #f87171; border-color: #3a1a1a; }

  /* footer */
  .footer {
    padding: 10px 16px;
    border-top: 1px solid #1a1a1a;
    display: flex; justify-content: space-between; align-items: center;
  }
  .footer-link {
    font-size: 11px; color: #555; cursor: pointer;
    background: none; border: none; font-family: 'DM Sans', sans-serif;
    transition: color 0.15s;
  }
  .footer-link:hover { color: #e8e6e0; }
  .rules-count { font-size: 11px; color: #444; font-family: 'DM Mono', monospace; }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  .rule-row { animation: fadeIn 0.15s ease; }
`

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
        <div style={{ width: 320, padding: 24, textAlign: "center", fontFamily: "DM Sans, sans-serif", color: "#444", fontSize: 12 }}>
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
              title={settings?.debugMode ? "Debug ON" : "Debug OFF"}
              onClick={() => void toggleDebug()}
            >
              {settings?.debugMode ? "⬡" : "⬡"}
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

        {/* Add rule */}
        <div className="add-section">
          <div className="add-row">
            <input
              ref={inputRef}
              className="add-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addRule()}
              placeholder="keyword…"
            />
            <div className="action-toggle">
              <button
                className={`act-btn ${newAction === "hide" ? "sel-hide" : ""}`}
                onClick={() => setNewAction("hide")}
                title="hide"
              >H</button>
              <button
                className={`act-btn ${newAction === "flag" ? "sel-flag" : ""}`}
                onClick={() => setNewAction("flag")}
                title="flag"
              >F</button>
            </div>
            <button className="add-btn" onClick={() => void addRule()} disabled={!input.trim()}>
              Add
            </button>
          </div>
        </div>

        {/* Rules */}
        <div className="rules-section">
          {rules.length === 0 ? (
            <div className="empty-state">no rules yet</div>
          ) : (
            rules.map((rule) => (
              <div key={rule.id} className={`rule-row ${rule.enabled ? "" : "disabled"}`}>
                <span className="rule-type-badge">{rule.type === "channelName" ? "ch" : rule.type === "channelId" ? "id" : rule.type === "videoId" ? "vid" : "kw"}</span>
                <span className="rule-target" title={rule.targetRaw}>{rule.targetRaw}</span>
                <span className={`badge ${rule.action === "hide" ? "badge-hide" : "badge-flag"}`}>
                  {rule.action}
                </span>
                <button
                  className="rule-action-btn"
                  title={rule.enabled ? "disable" : "enable"}
                  onClick={() => void toggleRule(rule)}
                >
                  {rule.enabled ? "●" : "○"}
                </button>
                <button
                  className="rule-action-btn del"
                  title="delete"
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
            manage rules →
          </button>
          <span className="rules-count">{rules.length} rules</span>
        </div>

      </div>
    </>
  )
}