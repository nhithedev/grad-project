import { useEffect, useState } from "react"
import type { Rule } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { Message, MessageResponse } from "~core/messages"

async function sendMessage<T = unknown>(message: Message): Promise<T> {
  const response = (await chrome.runtime.sendMessage(message)) as MessageResponse<T>

  if (!response?.success) {
    throw new Error(response?.error || "Unknown error")
  }

  return response.data as T
}

export default function Popup() {
  const [input, setInput] = useState("")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadInitial()
  }, [])

  async function loadInitial() {
    try {
      const [loadedSettings, loadedRules] = await Promise.all([
        sendMessage<Settings>({ type: "GET_SETTINGS" }),
        sendMessage<Rule[]>({ type: "GET_RULES_BY_TYPE", payload: { type: "keyword" } })
      ])

      setSettings(loadedSettings)
      setRules(loadedRules)
    } finally {
      setLoading(false)
    }
  }

  async function refreshHighlights() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) return

    try {
      await chrome.tabs.sendMessage(tab.id, { type: "REFRESH_HIGHLIGHTS" })
    } catch (error) {
      console.warn("[Popup] refreshHighlights failed", error)
    }
  }

  async function handleToggleEnabled() {
    if (!settings) return

    const updated = await sendMessage<Settings>({
      type: "SAVE_SETTINGS",
      payload: {
        enabled: !settings.enabled
      }
    })

    setSettings(updated)
    await refreshHighlights()
  }

  async function handleToggleDebugMode() {
    if (!settings) return

    const updated = await sendMessage<Settings>({
      type: "SAVE_SETTINGS",
      payload: {
        debugMode: !settings.debugMode
      }
    })

    setSettings(updated)
  }

  async function handleAddKeywordRule() {
    const trimmed = input.trim()

    if (!trimmed) return

    const updatedRules = await sendMessage<Rule[]>({
      type: "CREATE_RULE",
      payload: {
        type: "keyword",
        targetRaw: trimmed,
        action: settings?.defaultAction ?? "hide"
      }
    })

    setRules(updatedRules.filter((rule) => rule.type === "keyword"))
    setInput("")
    await refreshHighlights()
  }

  async function handleDeleteRule(id?: number) {
    if (!id) return

    const updatedRules = await sendMessage<Rule[]>({
      type: "DELETE_RULE",
      payload: id
    })

    setRules(updatedRules.filter((rule) => rule.type === "keyword"))
    await refreshHighlights()
  }

  if (loading) {
    return <div style={{ width: 340, padding: 16, fontFamily: "sans-serif" }}>Loading...</div>
  }

  return (
    <div style={{ width: 340, padding: 16, fontFamily: "sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          padding: 8,
          background: settings?.enabled ? "#e8f5e9" : "#ffebee",
          borderRadius: 4
        }}>
        <span style={{ fontWeight: "bold" }}>
          {settings?.enabled ? "✅ Đang bật" : "⛔ Đã tắt"}
        </span>

        <button onClick={() => void handleToggleEnabled()}>
          {settings?.enabled ? "Tắt" : "Bật"}
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          padding: 8,
          background: settings?.debugMode ? "#fff8e1" : "#f5f5f5",
          borderRadius: 4
        }}>
        <span>Debug mode: {settings?.debugMode ? "ON" : "OFF"}</span>
        <button onClick={() => void handleToggleDebugMode()}>
          {settings?.debugMode ? "Tắt debug" : "Bật debug"}
        </button>
      </div>

      <h2 style={{ marginTop: 0 }}>Quick keyword rules</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleAddKeywordRule()}
          placeholder="Nhập keyword..."
          style={{ flex: 1, padding: "4px 8px" }}
        />
        <button onClick={() => void handleAddKeywordRule()}>Thêm</button>
      </div>

      {rules.length === 0 ? (
        <p style={{ color: "#888", fontSize: 13 }}>Chưa có keyword rule nào.</p>
      ) : (
        <ul style={{ padding: 0, listStyle: "none", margin: 0 }}>
          {rules.map((rule) => (
            <li
              key={rule.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                padding: "6px 8px",
                background: "#f5f5f5",
                borderRadius: 4
              }}>
              <span style={{ flex: 1 }}>{rule.targetRaw}</span>
              <button onClick={() => void handleDeleteRule(rule.id)}>Xóa</button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          onClick={() => {
            chrome.runtime.openOptionsPage()
          }}>
          Mở Options Page
        </button>
      </div>
    </div>
  )
}