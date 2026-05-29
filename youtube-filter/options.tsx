import { useEffect, useMemo, useState } from "react"
import type { Rule, RuleType } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type {
  CreateRulePayload,
  Message,
  MessageResponse,
  ToggleRulePayload,
  UpdateRulePayload
} from "~core/messages"

type RuleAction = "hide" | "flag"
type FilterType = "all" | RuleType

const RULE_TYPES: RuleType[] = ["keyword", "channelName", "channelId", "videoId"]

async function sendMessage<T = unknown>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>
  if (!response?.success) throw new Error(response?.error || "Unknown error")
  return response.data as T
}

async function refreshAllYouTubeTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
    await Promise.all(
      tabs.map((tab) => {
        if (!tab.id) return Promise.resolve()
        return chrome.tabs.sendMessage(tab.id, { type: "REFRESH_HIGHLIGHTS" }).catch(() => {})
      })
    )
  } catch {
    // no tabs permission or no tabs open
  }
}

function openDebugPanel() {
  const url = chrome.runtime.getURL("debug-panel.html")
  chrome.tabs.create({ url })
}

function getPlaceholderByType(type: RuleType) {
  switch (type) {
    case "keyword":     return "Ví dụ: game, prank, violent"
    case "channelName": return "Ví dụ: Some Channel"
    case "channelId":   return "Ví dụ: UCxxxxxxxxxxxxxxxxxxxxxx"
    case "videoId":     return "Ví dụ: dQw4w9WgXcQ"
    default:            return "Nhập giá trị rule"
  }
}

export default function OptionsPage() {
  const [rules, setRules]               = useState<Rule[]>([])
  const [settings, setSettings]         = useState<Settings | null>(null)
  const [type, setType]                 = useState<RuleType>("keyword")
  const [targetRaw, setTargetRaw]       = useState("")
  const [action, setAction]             = useState<RuleAction>("hide")
  const [filterType, setFilterType]     = useState<FilterType>("all")
  const [editingId, setEditingId]       = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [error, setError]               = useState("")
  const [loading, setLoading]           = useState(true)

  useEffect(() => { void loadInitial() }, [])

  async function loadInitial() {
    try {
      const [loadedRules, loadedSettings] = await Promise.all([
        sendMessage<Rule[]>({ type: "GET_ALL_RULES" }),
        sendMessage<Settings>({ type: "GET_SETTINGS" })
      ])
      setRules(loadedRules)
      setSettings(loadedSettings)
    } finally {
      setLoading(false)
    }
  }

  function validateRuleInput(currentType: RuleType, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return "Giá trị rule không được để trống."
    if (currentType === "videoId"   && trimmed.length < 6)  return "videoId có vẻ quá ngắn."
    if (currentType === "channelId" && trimmed.length < 10) return "channelId có vẻ chưa đúng."
    return ""
  }

  async function handleCreateRule() {
    const err = validateRuleInput(type, targetRaw)
    if (err) { setError(err); return }
    setError("")
    const payload: CreateRulePayload = { type, targetRaw: targetRaw.trim(), action }
    const updatedRules = await sendMessage<Rule[]>({ type: "CREATE_RULE", payload })
    setRules(updatedRules)
    setTargetRaw("")
    await refreshAllYouTubeTabs()
  }

  async function handleDelete(id?: number) {
    if (!id) return
    const updatedRules = await sendMessage<Rule[]>({ type: "DELETE_RULE", payload: id })
    setRules(updatedRules)
    await refreshAllYouTubeTabs()
  }

  async function handleToggleRule(rule: Rule) {
    if (!rule.id) return
    const payload: ToggleRulePayload = { id: rule.id, enabled: !rule.enabled }
    const updatedRules = await sendMessage<Rule[]>({ type: "SET_RULE_ENABLED", payload })
    setRules(updatedRules)
    await refreshAllYouTubeTabs()
  }

  function startEdit(rule: Rule) {
    if (!rule.id) return
    setEditingId(rule.id)
    setEditingValue(rule.targetRaw)
  }

  async function saveEdit() {
    if (!editingId) return
    const currentRule = rules.find((r) => r.id === editingId)
    const err = validateRuleInput(currentRule?.type ?? "keyword", editingValue)
    if (err) { setError(err); return }
    setError("")
    const payload: UpdateRulePayload = { id: editingId, patch: { targetRaw: editingValue.trim() } }
    const updatedRules = await sendMessage<Rule[]>({ type: "UPDATE_RULE", payload })
    setRules(updatedRules)
    setEditingId(null)
    setEditingValue("")
    await refreshAllYouTubeTabs()
  }

  async function handleToggleEnabled() {
    if (!settings) return
    const updated = await sendMessage<Settings>({
      type: "SAVE_SETTINGS",
      payload: { enabled: !settings.enabled }
    })
    setSettings(updated)
    await refreshAllYouTubeTabs()
  }

  async function handleToggleDebugMode() {
    if (!settings) return
    const updated = await sendMessage<Settings>({
      type: "SAVE_SETTINGS",
      payload: { debugMode: !settings.debugMode }
    })
    setSettings(updated)
  }

  async function handleChangeDefaultAction(nextAction: RuleAction) {
    const updated = await sendMessage<Settings>({
      type: "SAVE_SETTINGS",
      payload: { defaultAction: nextAction }
    })
    setSettings(updated)
  }

  const visibleRules = useMemo(
    () => filterType === "all" ? rules : rules.filter((r) => r.type === filterType),
    [rules, filterType]
  )

  if (loading) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Loading...</div>
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24, fontFamily: "sans-serif" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>YouTube Filter — Options</h1>
        <button
          onClick={openDebugPanel}
          style={{ padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
          🔍 Debug Panel
        </button>
      </div>

      {/* Settings */}
      <section style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Extension settings</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => void handleToggleEnabled()}>
            {settings?.enabled ? "Disable extension" : "Enable extension"}
          </button>
          <button onClick={() => void handleToggleDebugMode()}>
            {settings?.debugMode ? "Disable debug" : "Enable debug"}
          </button>
          <label>
            Default action:
            <select
              value={settings?.defaultAction ?? "hide"}
              onChange={(e) => void handleChangeDefaultAction(e.target.value as RuleAction)}
              style={{ marginLeft: 8, padding: 6 }}>
              <option value="hide">hide</option>
              <option value="flag">flag</option>
            </select>
          </label>
        </div>
        <div style={{ color: "#555", fontSize: 13 }}>
          <div>enabled: {String(settings?.enabled)}</div>
          <div>debugMode: {String(settings?.debugMode)}</div>
          <div>defaultAction: {settings?.defaultAction}</div>
        </div>
      </section>

      {/* Add rule */}
      <section style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Add rule</h2>
        <div style={{ display: "grid", gap: 8 }}>
          <label>
            Type<br />
            <select value={type} onChange={(e) => setType(e.target.value as RuleType)} style={{ width: "100%", padding: 8 }}>
              {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Target<br />
            <input
              value={targetRaw}
              onChange={(e) => setTargetRaw(e.target.value)}
              placeholder={getPlaceholderByType(type)}
              style={{ width: "100%", padding: 8 }}
            />
          </label>
          <label>
            Action<br />
            <select value={action} onChange={(e) => setAction(e.target.value as RuleAction)} style={{ width: "100%", padding: 8 }}>
              <option value="hide">hide</option>
              <option value="flag">flag</option>
            </select>
          </label>
          {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
          <button onClick={() => void handleCreateRule()} style={{ width: 180, padding: 10 }}>
            Add rule
          </button>
        </div>
      </section>

      {/* Rules list */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Rules</h2>
          <label>
            Filter:
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as FilterType)} style={{ marginLeft: 8, padding: 6 }}>
              <option value="all">all</option>
              {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Type</th>
              <th align="left">Target</th>
              <th align="left">Action</th>
              <th align="left">Enabled</th>
              <th align="left">Updated</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRules.map((rule) => (
              <tr key={rule.id} style={{ borderTop: "1px solid #ddd" }}>
                <td style={{ padding: "8px 0" }}>{rule.type}</td>
                <td>
                  {editingId === rule.id ? (
                    <input
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void saveEdit()}
                      style={{ width: "100%", padding: 6 }}
                    />
                  ) : rule.targetRaw}
                </td>
                <td>{rule.action}</td>
                <td>{rule.enabled ? "yes" : "no"}</td>
                <td style={{ fontSize: 12, color: "#888" }}>{rule.updatedAt}</td>
                <td>
                  {editingId === rule.id ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => void saveEdit()}>Save</button>
                      <button onClick={() => { setEditingId(null); setEditingValue(""); setError("") }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => startEdit(rule)}>Edit</button>
                      <button onClick={() => void handleToggleRule(rule)}>
                        {rule.enabled ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => void handleDelete(rule.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}