import "./styles/popup.css"
import { useEffect, useRef, useState } from "react"
import type { Rule } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { Profile } from "~core/types/profile"
import type { Message, MessageResponse, CreateRulePayload, SetActiveProfilePayload } from "~core/messages"

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
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [input, setInput] = useState("")
  const [newAction, setNewAction] = useState<"hide" | "flag">("hide")
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    try {
      const [s, r, p] = await Promise.all([
        send<Settings>({ type: "GET_SETTINGS" }),
        send<Rule[]>({ type: "GET_ALL_RULES" }),
        send<Profile[]>({ type: "GET_PROFILES" }),
      ])
      setSettings(s)
      setRules(r)
      setNewAction(s.defaultAction ?? "hide")
      setProfiles(p)
    } finally {
      setLoading(false)
    }
  }

  async function changeProfile(profileId: number | null) {
    const payload: SetActiveProfilePayload = { profileId }
    const updatedSettings = await send<Settings>({ type: "SET_ACTIVE_PROFILE", payload })
    setSettings(updatedSettings)
    const updatedRules = await send<Rule[]>({ type: "GET_ALL_RULES" })
    setRules(updatedRules)
    await refreshTabs()
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

  async function changeAction(rule: Rule) {
    if (!rule.id) return
    const action = rule.action === "hide" ? "flag" : "hide"
    const updated = await send<Rule[]>({ type: "UPDATE_RULE", payload: { id: rule.id, patch: { action } } })
    setRules(updated)
    await refreshTabs()
  }

  async function deleteRule(id?: number) {
    if (!id) return
    const updated = await send<Rule[]>({ type: "DELETE_RULE", payload: { id } })
    setRules(updated)
    await refreshTabs()
  }

  if (loading) {
    return <div className="loading-state">loading…</div>
  }

  const enabledCount = rules.filter((r) => r.enabled).length

  return (
    <>
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

        {/* Profile selector */}
        {profiles.length > 0 && (
          <div className="profile-bar">
            <span className="profile-bar-label">Hồ sơ</span>
            <select
              className="profile-select"
              value={settings?.activeProfileId ?? ""}
              onChange={(e) => {
                const val = e.target.value
                void changeProfile(val === "" ? null : Number(val))
              }}
            >
              <option value="">— không chọn —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

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
                <button
                  className={`badge ${rule.action === "hide" ? "badge-hide" : "badge-flag"}`}
                  title={`Đổi sang ${rule.action === "hide" ? "flag" : "ẩn"}`}
                  onClick={() => void changeAction(rule)}
                  style={{ border: "none", cursor: "pointer", padding: "2px 6px" }}
                >
                  {rule.action === "hide" ? "ẩn" : "⚑"}
                </button>
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
