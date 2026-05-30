import { useEffect, useMemo, useRef, useState } from "react"
import type { Rule, RuleType, RuleAction } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type {
  CreateRulePayload,
  Message,
  MessageResponse,
  ToggleRulePayload,
  UpdateRulePayload,
} from "~core/messages"

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

// ─── constants ────────────────────────────────────────────────────────────────

const RULE_TYPES: RuleType[] = ["keyword", "channelName", "channelId", "videoId"]
type FilterType = "all" | RuleType

const TYPE_LABEL: Record<RuleType, string> = {
  keyword: "Keyword",
  channelName: "Channel name",
  channelId: "Channel ID",
  videoId: "Video ID",
}

const TYPE_PLACEHOLDER: Record<RuleType, string> = {
  keyword: "e.g. gaming, prank",
  channelName: "e.g. MrBeast",
  channelId: "e.g. UCxxxxxxxxxxxxxxxxxxxxxx",
  videoId: "e.g. dQw4w9WgXcQ",
}

function validateRule(type: RuleType, value: string): string {
  const t = value.trim()
  if (!t) return "Không được để trống."
  if (type === "videoId" && t.length < 6) return "videoId có vẻ quá ngắn."
  if (type === "channelId" && t.length < 10) return "channelId chưa đúng định dạng."
  return ""
}

// ─── styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: 'DM Sans', sans-serif;
    background: #0c0c0c;
    color: #e0ddd6;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }

  /* layout */
  .layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: #111;
    border-right: 1px solid #1e1e1e;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 20px 18px 16px;
    border-bottom: 1px solid #1e1e1e;
    display: flex; align-items: center; gap: 10px;
  }
  .sidebar-logo-mark {
    width: 28px; height: 28px;
    background: #ff3d3d;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff; letter-spacing: -0.5px;
    flex-shrink: 0;
  }
  .sidebar-logo-text { font-size: 14px; font-weight: 600; letter-spacing: -0.3px; }
  .sidebar-logo-sub { font-size: 10px; color: #555; font-family: 'DM Mono', monospace; }

  .sidebar-section { padding: 16px 12px 8px; }
  .sidebar-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    color: #444; text-transform: uppercase; padding: 0 6px; margin-bottom: 4px;
  }

  .filter-btn {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; background: none; border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; color: #666; cursor: pointer;
    padding: 7px 8px; border-radius: 7px;
    transition: all 0.12s; text-align: left;
  }
  .filter-btn:hover { background: #1a1a1a; color: #ccc; }
  .filter-btn.active { background: #1e1e1e; color: #e0ddd6; font-weight: 500; }
  .filter-count {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #444; background: #1a1a1a;
    padding: 1px 6px; border-radius: 4px;
  }
  .filter-btn.active .filter-count { color: #666; }

  .sidebar-settings { margin-top: auto; padding: 16px 12px; border-top: 1px solid #1e1e1e; }

  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 6px; border-radius: 6px; cursor: pointer;
    transition: background 0.12s;
  }
  .setting-row:hover { background: #1a1a1a; }
  .setting-label { font-size: 13px; color: #888; }
  .setting-label.active { color: #e0ddd6; }

  /* toggle switch */
  .switch { position: relative; width: 36px; height: 20px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch-track {
    position: absolute; inset: 0;
    background: #2a2a2a; border-radius: 20px;
    transition: background 0.2s; cursor: pointer;
  }
  .switch-track::after {
    content: '';
    position: absolute;
    left: 3px; top: 3px;
    width: 14px; height: 14px;
    background: #555; border-radius: 50%;
    transition: all 0.2s;
  }
  .switch input:checked + .switch-track { background: #ff3d3d22; }
  .switch input:checked + .switch-track::after { background: #ff3d3d; transform: translateX(16px); }
  .switch.green input:checked + .switch-track { background: #4ade8022; }
  .switch.green input:checked + .switch-track::after { background: #4ade80; }

  /* main */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .topbar {
    padding: 16px 24px;
    border-bottom: 1px solid #1a1a1a;
    display: flex; align-items: center; justify-content: space-between;
    background: #0c0c0c;
    position: sticky; top: 0; z-index: 10;
  }
  .topbar-title { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; }
  .topbar-sub { font-size: 12px; color: #555; font-family: 'DM Mono', monospace; margin-top: 1px; }
  .topbar-actions { display: flex; gap: 8px; align-items: center; }

  .btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    border: 1px solid #2a2a2a;
    background: #161616; color: #888;
    border-radius: 7px; padding: 6px 12px;
    cursor: pointer; transition: all 0.15s;
    white-space: nowrap;
  }
  .btn:hover { background: #1e1e1e; color: #e0ddd6; border-color: #333; }
  .btn-primary { background: #ff3d3d; color: #fff; border-color: #ff3d3d; }
  .btn-primary:hover { background: #e83535; border-color: #e83535; color: #fff; }
  .btn-ghost { background: transparent; border-color: transparent; }

  /* add form */
  .add-form {
    padding: 20px 24px;
    border-bottom: 1px solid #1a1a1a;
    display: grid;
    gap: 12px;
  }
  .form-row { display: flex; gap: 10px; align-items: flex-start; }
  .form-col { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 11px; color: #555; font-weight: 500; letter-spacing: 0.03em; }

  .select, .input {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    background: #161616;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    padding: 8px 10px;
    color: #e0ddd6;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .select { cursor: pointer; }
  .select:focus, .input:focus {
    border-color: #ff3d3d44;
    box-shadow: 0 0 0 2px #ff3d3d10;
  }
  .input::placeholder { color: #333; }
  .input.grow { flex: 1; }

  .action-seg {
    display: flex;
    background: #161616;
    border: 1px solid #2a2a2a;
    border-radius: 7px;
    overflow: hidden;
  }
  .seg-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 8px 14px;
    background: transparent; color: #555;
    transition: all 0.15s;
  }
  .seg-btn + .seg-btn { border-left: 1px solid #2a2a2a; }
  .seg-btn.sel-hide { background: #2a1414; color: #f87171; }
  .seg-btn.sel-flag { background: #2a2210; color: #fbbf24; }

  .error-msg { font-size: 12px; color: #f87171; }

  /* table */
  .table-wrap { flex: 1; overflow-y: auto; }
  .table-wrap::-webkit-scrollbar { width: 4px; }
  .table-wrap::-webkit-scrollbar-track { background: transparent; }
  .table-wrap::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }

  table { width: 100%; border-collapse: collapse; }

  thead th {
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    color: #444; text-transform: uppercase;
    padding: 10px 16px;
    text-align: left;
    background: #0e0e0e;
    border-bottom: 1px solid #1a1a1a;
    position: sticky; top: 0;
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid #141414;
    transition: background 0.1s;
  }
  tbody tr:hover { background: #111; }
  tbody tr.row-disabled { opacity: 0.38; }

  td {
    padding: 11px 16px;
    vertical-align: middle;
    font-size: 13px;
  }

  .td-type {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #555;
    white-space: nowrap;
  }

  .td-target {
    font-family: 'DM Mono', monospace;
    font-size: 12px; color: #ccc;
    max-width: 260px;
  }
  .td-target.editing { padding: 6px 16px; }
  .edit-input {
    font-family: 'DM Mono', monospace;
    font-size: 12px; width: 100%;
    background: #1a1a1a; border: 1px solid #ff3d3d44;
    border-radius: 6px; padding: 6px 8px;
    color: #e0ddd6; outline: none;
    box-shadow: 0 0 0 2px #ff3d3d10;
  }

  /* inline action toggle */
  .action-pill {
    display: inline-flex;
    align-items: center;
    gap: 0;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid #2a2a2a;
  }
  .ap-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 10px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 3px 7px;
    background: transparent; color: #444;
    transition: all 0.12s;
  }
  .ap-btn + .ap-btn { border-left: 1px solid #2a2a2a; }
  .ap-btn.ap-hide.ap-active { background: #2a1414; color: #f87171; }
  .ap-btn.ap-flag.ap-active { background: #2a2210; color: #fbbf24; }

  .td-date {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #333;
    white-space: nowrap;
  }

  .td-actions { white-space: nowrap; }
  .row-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; color: #555;
    background: none; border: 1px solid #222;
    border-radius: 5px; padding: 4px 8px;
    cursor: pointer; transition: all 0.12s;
    margin-right: 4px;
  }
  .row-btn:hover { background: #1e1e1e; color: #ccc; border-color: #333; }
  .row-btn.save { color: #4ade80; border-color: #1a3a1a; }
  .row-btn.save:hover { background: #1a3a1a; }
  .row-btn.del:hover { background: #2a1414; color: #f87171; border-color: #3a1a1a; }

  /* empty */
  .empty-table {
    padding: 60px 24px;
    text-align: center;
    color: #333;
    font-size: 13px;
  }
  .empty-table strong { display: block; font-size: 15px; color: #444; margin-bottom: 6px; }

  /* status strip */
  .status-strip {
    padding: 8px 24px;
    border-top: 1px solid #1a1a1a;
    display: flex; gap: 16px;
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #444;
    background: #0c0c0c;
  }
  .ss-item { display: flex; gap: 5px; }
  .ss-val { color: #666; }

  /* import/export feedback */
  .import-status { font-size: 11px; color: #4ade80; }
  .import-status.error { color: #f87171; }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: none; }
  }
  tbody tr { animation: slideIn 0.15s ease; }
`

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "2-digit" })
  } catch {
    return iso.slice(0, 10)
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  const [rules, setRules]               = useState<Rule[]>([])
  const [settings, setSettings]         = useState<Settings | null>(null)
  const [loading, setLoading]           = useState(true)

  // add form
  const [newType, setNewType]           = useState<RuleType>("keyword")
  const [newTarget, setNewTarget]       = useState("")
  const [newAction, setNewAction]       = useState<RuleAction>("hide")
  const [formError, setFormError]       = useState("")

  // filter
  const [filter, setFilter]             = useState<FilterType>("all")

  // editing
  const [editId, setEditId]             = useState<number | null>(null)
  const [editValue, setEditValue]       = useState("")

  // import/export
  const [importMsg, setImportMsg]       = useState("")
  const [importErr, setImportErr]       = useState(false)
  const importRef                       = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    try {
      const [r, s] = await Promise.all([
        send<Rule[]>({ type: "GET_ALL_RULES" }),
        send<Settings>({ type: "GET_SETTINGS" }),
      ])
      setRules(r)
      setSettings(s)
      setNewAction(s.defaultAction ?? "hide")
    } finally {
      setLoading(false)
    }
  }

  // ── settings ──────────────────────────────────────────────────────────────

  async function saveSettings(patch: Partial<Settings>) {
    const updated = await send<Settings>({ type: "SAVE_SETTINGS", payload: patch })
    setSettings(updated)
    if ("enabled" in patch) await refreshTabs()
  }

  // ── rule CRUD ─────────────────────────────────────────────────────────────

  async function createRule() {
    const err = validateRule(newType, newTarget)
    if (err) { setFormError(err); return }
    setFormError("")
    const payload: CreateRulePayload = { type: newType, targetRaw: newTarget.trim(), action: newAction }
    const updated = await send<Rule[]>({ type: "CREATE_RULE", payload })
    setRules(updated)
    setNewTarget("")
    await refreshTabs()
  }

  async function deleteRule(id?: number) {
    if (!id) return
    const updated = await send<Rule[]>({ type: "DELETE_RULE", payload: id })
    setRules(updated)
    await refreshTabs()
  }

  async function toggleEnabled(rule: Rule) {
    if (!rule.id) return
    const payload: ToggleRulePayload = { id: rule.id, enabled: !rule.enabled }
    const updated = await send<Rule[]>({ type: "SET_RULE_ENABLED", payload })
    setRules(updated)
    await refreshTabs()
  }

  async function changeAction(rule: Rule, action: RuleAction) {
    if (!rule.id || rule.action === action) return
    const payload: UpdateRulePayload = { id: rule.id, patch: { action } }
    const updated = await send<Rule[]>({ type: "UPDATE_RULE", payload })
    setRules(updated)
    await refreshTabs()
  }

  async function saveEdit() {
    if (!editId) return
    const rule = rules.find((r) => r.id === editId)
    const err = validateRule(rule?.type ?? "keyword", editValue)
    if (err) { setFormError(err); return }
    setFormError("")
    const payload: UpdateRulePayload = { id: editId, patch: { targetRaw: editValue.trim() } }
    const updated = await send<Rule[]>({ type: "UPDATE_RULE", payload })
    setRules(updated)
    setEditId(null)
    setEditValue("")
    await refreshTabs()
  }

  // ── import / export ───────────────────────────────────────────────────────

  function exportRules() {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "yt-filter-rules.json"; a.click()
    URL.revokeObjectURL(url)
  }

  async function importRules(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImportMsg(""); setImportErr(false)
    try {
      const parsed = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) { setImportMsg("File không hợp lệ."); setImportErr(true); return }
      let count = 0
      for (const r of parsed) {
        if (!r.type || !r.targetRaw) continue
        await send<Rule[]>({ type: "CREATE_RULE", payload: { type: r.type, targetRaw: r.targetRaw, action: r.action } })
        count++
      }
      const updated = await send<Rule[]>({ type: "GET_ALL_RULES" })
      setRules(updated)
      setImportMsg(`Imported ${count} rules.`)
      await refreshTabs()
    } catch {
      setImportMsg("Lỗi đọc file."); setImportErr(true)
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const countByType = useMemo(() => {
    const map: Record<string, number> = { all: rules.length }
    for (const t of RULE_TYPES) map[t] = rules.filter((r) => r.type === t).length
    return map
  }, [rules])

  const visible = useMemo(
    () => filter === "all" ? rules : rules.filter((r) => r.type === filter),
    [rules, filter]
  )

  if (loading) {
    return (
      <>
        <style>{css}</style>
        <div style={{ padding: 40, color: "#444", fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>loading…</div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div className="layout">

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-mark">YF</div>
            <div>
              <div className="sidebar-logo-text">YT Filter</div>
              <div className="sidebar-logo-sub">options</div>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">Filter</div>
            {(["all", ...RULE_TYPES] as (FilterType)[]).map((t) => (
              <button
                key={t}
                className={`filter-btn ${filter === t ? "active" : ""}`}
                onClick={() => setFilter(t)}
              >
                <span>{t === "all" ? "All rules" : TYPE_LABEL[t as RuleType]}</span>
                <span className="filter-count">{countByType[t] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="sidebar-settings">
            <div className="sidebar-label" style={{ marginBottom: 8 }}>Settings</div>

            <label className="setting-row">
              <span className={`setting-label ${settings?.enabled ? "active" : ""}`}>
                {settings?.enabled ? "Extension on" : "Extension off"}
              </span>
              <label className="switch green">
                <input
                  type="checkbox"
                  checked={settings?.enabled ?? false}
                  onChange={() => void saveSettings({ enabled: !settings?.enabled })}
                />
                <span className="switch-track" />
              </label>
            </label>

            <label className="setting-row">
              <span className={`setting-label ${settings?.debugMode ? "active" : ""}`}>
                Debug mode
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings?.debugMode ?? false}
                  onChange={() => void saveSettings({ debugMode: !settings?.debugMode })}
                />
                <span className="switch-track" />
              </label>
            </label>

            <div className="setting-row" style={{ cursor: "default" }}>
              <span className="setting-label">Default action</span>
              <div className="action-seg" style={{ borderRadius: 6 }}>
                <button
                  className={`seg-btn ${settings?.defaultAction === "hide" ? "sel-hide" : ""}`}
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  onClick={() => void saveSettings({ defaultAction: "hide" })}
                >H</button>
                <button
                  className={`seg-btn ${settings?.defaultAction === "flag" ? "sel-flag" : ""}`}
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  onClick={() => void saveSettings({ defaultAction: "flag" })}
                >F</button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "5px 8px", flex: 1 }}
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("debug-panel.html") })}
              >
                🔍 debug
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="main">

          {/* Topbar */}
          <div className="topbar">
            <div>
              <div className="topbar-title">
                {filter === "all" ? "All rules" : TYPE_LABEL[filter as RuleType]}
              </div>
              <div className="topbar-sub">{visible.length} rules</div>
            </div>
            <div className="topbar-actions">
              {importMsg && (
                <span className={`import-status ${importErr ? "error" : ""}`}>{importMsg}</span>
              )}
              <button className="btn" onClick={exportRules}>Export</button>
              <label className="btn" style={{ cursor: "pointer" }}>
                Import
                <input ref={importRef} type="file" accept=".json" onChange={(e) => void importRules(e)} style={{ display: "none" }} />
              </label>
            </div>
          </div>

          {/* Add form */}
          <div className="add-form">
            <div className="form-row">
              <div className="form-col">
                <span className="form-label">Type</span>
                <select
                  className="select"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as RuleType)}
                >
                  {RULE_TYPES.map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>

              <div className="form-col" style={{ flex: 1 }}>
                <span className="form-label">Target</span>
                <input
                  className="input grow"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void createRule()}
                  placeholder={TYPE_PLACEHOLDER[newType]}
                />
              </div>

              <div className="form-col">
                <span className="form-label">Action</span>
                <div className="action-seg">
                  <button
                    className={`seg-btn ${newAction === "hide" ? "sel-hide" : ""}`}
                    onClick={() => setNewAction("hide")}
                  >Hide</button>
                  <button
                    className={`seg-btn ${newAction === "flag" ? "sel-flag" : ""}`}
                    onClick={() => setNewAction("flag")}
                  >Flag</button>
                </div>
              </div>

              <div className="form-col" style={{ justifyContent: "flex-end" }}>
                <span className="form-label" style={{ visibility: "hidden" }}>x</span>
                <button className="btn btn-primary" onClick={() => void createRule()}>
                  Add rule
                </button>
              </div>
            </div>
            {formError && <div className="error-msg">{formError}</div>}
          </div>

          {/* Table */}
          <div className="table-wrap">
            {visible.length === 0 ? (
              <div className="empty-table">
                <strong>No rules</strong>
                Add a rule above to get started
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Target</th>
                    <th>Action</th>
                    <th>Enabled</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((rule) => (
                    <tr key={rule.id} className={rule.enabled ? "" : "row-disabled"}>

                      <td className="td-type">{rule.type}</td>

                      <td className={`td-target ${editId === rule.id ? "editing" : ""}`}>
                        {editId === rule.id ? (
                          <input
                            className="edit-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit()
                              if (e.key === "Escape") { setEditId(null); setEditValue(""); setFormError("") }
                            }}
                            autoFocus
                          />
                        ) : (
                          rule.targetRaw
                        )}
                      </td>

                      {/* Inline action toggle */}
                      <td>
                        <div className="action-pill">
                          <button
                            className={`ap-btn ap-hide ${rule.action === "hide" ? "ap-active" : ""}`}
                            onClick={() => void changeAction(rule, "hide")}
                            title="Set to hide"
                          >hide</button>
                          <button
                            className={`ap-btn ap-flag ${rule.action === "flag" ? "ap-active" : ""}`}
                            onClick={() => void changeAction(rule, "flag")}
                            title="Set to flag"
                          >flag</button>
                        </div>
                      </td>

                      <td>
                        <label className={`switch ${rule.enabled ? "green" : ""}`}>
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            onChange={() => void toggleEnabled(rule)}
                          />
                          <span className="switch-track" />
                        </label>
                      </td>

                      <td className="td-date">{fmtDate(rule.updatedAt)}</td>

                      <td className="td-actions">
                        {editId === rule.id ? (
                          <>
                            <button className="row-btn save" onClick={() => void saveEdit()}>Save</button>
                            <button className="row-btn" onClick={() => { setEditId(null); setEditValue(""); setFormError("") }}>Cancel</button>
                          </>
                        ) : (
                          <>
                            <button className="row-btn" onClick={() => { setEditId(rule.id!); setEditValue(rule.targetRaw) }}>Edit</button>
                            <button className="row-btn del" onClick={() => void deleteRule(rule.id)}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Status strip */}
          <div className="status-strip">
            <div className="ss-item"><span>total</span><span className="ss-val">{rules.length}</span></div>
            <div className="ss-item"><span>active</span><span className="ss-val">{rules.filter((r) => r.enabled).length}</span></div>
            <div className="ss-item"><span>hide</span><span className="ss-val">{rules.filter((r) => r.action === "hide").length}</span></div>
            <div className="ss-item"><span>flag</span><span className="ss-val">{rules.filter((r) => r.action === "flag").length}</span></div>
            <div className="ss-item"><span>ext</span><span className="ss-val">{settings?.enabled ? "on" : "off"}</span></div>
          </div>

        </div>
      </div>
    </>
  )
}