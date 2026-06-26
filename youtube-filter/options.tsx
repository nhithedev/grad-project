import { useEffect, useMemo, useRef, useState } from "react"
import type { Rule, RuleType, RuleAction } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { MatchLog } from "~core/types/match-log"
import type { Profile } from "~core/types/profile"
import type {
  CreateRulePayload,
  DeleteProfilePayload,
  GetAllRulesPayload,
  Message,
  MessageResponse,
  SetActiveProfilePayload,
  ToggleRulePayload,
  UpdateRulePayload,
} from "~core/messages"
import { parseYouTubeUrl } from "~data/utils/normalize"

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

// UI-level input types (what user sees in the add form)
type FormType = "keyword" | "channelName" | "channelLink" | "videoLink"
const FORM_TYPES: FormType[] = ["keyword", "channelName", "channelLink", "videoLink"]

const FORM_LABEL: Record<FormType, string> = {
  keyword: "Từ khóa",
  channelName: "Tên kênh",
  channelLink: "Link kênh",
  videoLink: "Link video",
}

const FORM_PLACEHOLDER: Record<FormType, string> = {
  keyword: "ví dụ: gaming, tin tức",
  channelName: "ví dụ: MrBeast",
  channelLink: "ví dụ: youtube.com/@MrBeast",
  videoLink: "ví dụ: youtube.com/watch?v=dQw4w9WgXcQ",
}

// Actual stored rule types (for sidebar filter)
const RULE_TYPES: RuleType[] = ["keyword", "channelName", "channelId", "videoId"]
type FilterType = "all" | RuleType

const FILTER_LABEL: Record<RuleType, string> = {
  keyword: "Từ khóa",
  channelName: "Tên kênh",
  channelId: "Link kênh",
  videoId: "Link video",
}

// ─── styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: 'DM Sans', sans-serif;
    background: #ffffff;
    color: #111111;
    font-size: 14px;
    line-height: 1.5;
    min-height: 100vh;
  }

  /* layout */
  .layout { display: flex; min-height: 100vh; }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: #f9f9f9;
    border-right: 1px solid #ebebeb;
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    padding: 18px 18px 14px;
    border-bottom: 1px solid #ebebeb;
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
  .sidebar-logo-text { font-size: 14px; font-weight: 600; letter-spacing: -0.3px; color: #111111; }
  .sidebar-logo-sub { font-size: 10px; color: #aaaaaa; font-family: 'DM Mono', monospace; }

  /* nav tabs */
  .nav-tabs {
    display: flex;
    gap: 4px;
    padding: 10px 12px;
    border-bottom: 1px solid #ebebeb;
  }
  .nav-tab {
    flex: 1;
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 6px 8px;
    cursor: pointer;
    text-align: center;
    color: #999999;
    transition: all 0.15s;
  }
  .nav-tab:hover { background: #eeeeee; color: #555555; }
  .nav-tab.active { background: #fff0f0; color: #ff3d3d; border-color: #ffd4d4; }

  .sidebar-section { padding: 14px 12px 8px; }
  .sidebar-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.08em;
    color: #cccccc; text-transform: uppercase; padding: 0 6px; margin-bottom: 4px;
  }

  .filter-btn {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; background: none; border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px; color: #888888; cursor: pointer;
    padding: 7px 8px; border-radius: 7px;
    transition: all 0.12s; text-align: left;
  }
  .filter-btn:hover { background: #eeeeee; color: #333333; }
  .filter-btn.active { background: #ffffff; color: #111111; font-weight: 500; box-shadow: 0 0 0 1px #e0e0e0; }
  .filter-count {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #cccccc; background: #eeeeee;
    padding: 1px 6px; border-radius: 4px;
  }
  .filter-btn.active .filter-count { color: #888888; background: #f0f0f0; }

  .sidebar-settings { margin-top: auto; padding: 14px 12px; border-top: 1px solid #ebebeb; }

  .setting-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 6px; border-radius: 6px; cursor: pointer;
    transition: background 0.12s;
  }
  .setting-row:hover { background: #eeeeee; }
  .setting-label { font-size: 13px; color: #999999; }
  .setting-label.active { color: #111111; }

  /* toggle switch */
  .switch { position: relative; width: 36px; height: 20px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .switch-track {
    position: absolute; inset: 0;
    background: #e0e0e0; border-radius: 20px;
    transition: background 0.2s; cursor: pointer;
  }
  .switch-track::after {
    content: '';
    position: absolute;
    left: 3px; top: 3px;
    width: 14px; height: 14px;
    background: #aaaaaa; border-radius: 50%;
    transition: all 0.2s;
  }
  .switch input:checked + .switch-track { background: #ffd4d4; }
  .switch input:checked + .switch-track::after { background: #ff3d3d; transform: translateX(16px); }
  .switch.green input:checked + .switch-track { background: #d1fae5; }
  .switch.green input:checked + .switch-track::after { background: #16a34a; transform: translateX(16px); }

  /* main */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

  .topbar {
    padding: 16px 24px;
    border-bottom: 1px solid #ebebeb;
    display: flex; align-items: center; justify-content: space-between;
    background: #ffffff;
    position: sticky; top: 0; z-index: 10;
  }
  .topbar-title { font-size: 15px; font-weight: 600; letter-spacing: -0.3px; color: #111111; }
  .topbar-sub { font-size: 12px; color: #aaaaaa; font-family: 'DM Mono', monospace; margin-top: 1px; }
  .topbar-actions { display: flex; gap: 8px; align-items: center; }

  .btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    border: 1px solid #e0e0e0;
    background: #f7f7f7; color: #777777;
    border-radius: 7px; padding: 6px 12px;
    cursor: pointer; transition: all 0.15s;
    white-space: nowrap;
  }
  .btn:hover { background: #eeeeee; color: #111111; border-color: #d0d0d0; }
  .btn-primary { background: #ff3d3d; color: #fff; border-color: #ff3d3d; }
  .btn-primary:hover { background: #e83535; border-color: #e83535; color: #fff; }
  .btn-ghost { background: transparent; border-color: transparent; color: #aaaaaa; }
  .btn-ghost:hover { background: #f5f5f5; color: #555555; border-color: transparent; }
  .btn-danger { background: #fff0f0; color: #dc2626; border-color: #ffd4d4; }
  .btn-danger:hover { background: #fee2e2; border-color: #fca5a5; }

  /* add form */
  .add-form {
    padding: 18px 24px;
    border-bottom: 1px solid #ebebeb;
    display: grid;
    gap: 10px;
    background: #fafafa;
  }
  .form-row { display: flex; gap: 10px; align-items: flex-start; }
  .form-col { display: flex; flex-direction: column; gap: 4px; }
  .form-label { font-size: 11px; color: #aaaaaa; font-weight: 500; letter-spacing: 0.03em; }

  .select, .input {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 7px;
    padding: 8px 10px;
    color: #111111;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .select { cursor: pointer; }
  .select:focus, .input:focus {
    border-color: #ff3d3d88;
    box-shadow: 0 0 0 2px #ff3d3d10;
  }
  .input::placeholder { color: #cccccc; }
  .input.grow { flex: 1; }

  .action-seg {
    display: flex;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 7px;
    overflow: hidden;
  }
  .seg-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 12px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 8px 14px;
    background: transparent; color: #bbbbbb;
    transition: all 0.15s;
  }
  .seg-btn + .seg-btn { border-left: 1px solid #e0e0e0; }
  .seg-btn.sel-hide { background: #fff0f0; color: #dc2626; }
  .seg-btn.sel-flag { background: #fffbeb; color: #d97706; }

  .error-msg { font-size: 12px; color: #dc2626; }
  .url-hint { font-size: 11px; color: #aaaaaa; font-family: 'DM Mono', monospace; }

  /* table */
  .table-wrap { flex: 1; overflow-y: auto; }
  .table-wrap::-webkit-scrollbar { width: 4px; }
  .table-wrap::-webkit-scrollbar-track { background: transparent; }
  .table-wrap::-webkit-scrollbar-thumb { background: #e8e8e8; border-radius: 2px; }

  table { width: 100%; border-collapse: collapse; }

  thead th {
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    color: #aaaaaa; text-transform: uppercase;
    padding: 10px 16px;
    text-align: left;
    background: #f9f9f9;
    border-bottom: 1px solid #ebebeb;
    position: sticky; top: 0;
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid #f5f5f5;
    transition: background 0.1s;
  }
  tbody tr:hover { background: #fafafa; }
  tbody tr.row-disabled { opacity: 0.38; }

  td {
    padding: 11px 16px;
    vertical-align: middle;
    font-size: 13px;
    color: #333333;
  }

  .td-type {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #aaaaaa;
    white-space: nowrap;
  }

  .td-target {
    font-family: 'DM Mono', monospace;
    font-size: 12px; color: #333333;
    max-width: 240px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .td-target.editing { padding: 6px 16px; }
  .edit-input {
    font-family: 'DM Mono', monospace;
    font-size: 12px; width: 100%;
    background: #ffffff; border: 1px solid #ff3d3d88;
    border-radius: 6px; padding: 6px 8px;
    color: #111111; outline: none;
    box-shadow: 0 0 0 2px #ff3d3d10;
  }

  /* inline action toggle */
  .action-pill {
    display: inline-flex;
    align-items: center;
    border-radius: 5px;
    overflow: hidden;
    border: 1px solid #e5e5e5;
  }
  .ap-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 10px; font-weight: 500;
    border: none; cursor: pointer;
    padding: 3px 7px;
    background: transparent; color: #cccccc;
    transition: all 0.12s;
  }
  .ap-btn + .ap-btn { border-left: 1px solid #e5e5e5; }
  .ap-btn.ap-hide.ap-active { background: #fff0f0; color: #dc2626; }
  .ap-btn.ap-flag.ap-active { background: #fffbeb; color: #d97706; }

  .td-date {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #cccccc;
    white-space: nowrap;
  }

  .td-actions { white-space: nowrap; }
  .row-btn {
    font-family: 'DM Sans', sans-serif;
    font-size: 11px; color: #888888;
    background: none; border: 1px solid #e5e5e5;
    border-radius: 5px; padding: 4px 8px;
    cursor: pointer; transition: all 0.12s;
    margin-right: 4px;
  }
  .row-btn:hover { background: #f5f5f5; color: #333333; border-color: #d0d0d0; }
  .row-btn.save { color: #16a34a; border-color: #bbf7d0; }
  .row-btn.save:hover { background: #f0fdf4; }
  .row-btn.del:hover { background: #fff0f0; color: #dc2626; border-color: #ffd4d4; }

  /* action badge in logs */
  .action-badge {
    font-size: 10px; font-weight: 500;
    padding: 2px 7px; border-radius: 4px;
    font-family: 'DM Sans', sans-serif;
    display: inline-block;
  }
  .action-badge.hide { background: #fff0f0; color: #dc2626; }
  .action-badge.flag { background: #fffbeb; color: #d97706; }

  /* empty */
  .empty-table {
    padding: 60px 24px;
    text-align: center;
    color: #cccccc;
    font-size: 13px;
  }
  .empty-table strong { display: block; font-size: 15px; color: #aaaaaa; margin-bottom: 6px; }

  /* status strip */
  .status-strip {
    padding: 8px 24px;
    border-top: 1px solid #ebebeb;
    display: flex; gap: 16px;
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #cccccc;
    background: #fafafa;
  }
  .ss-item { display: flex; gap: 5px; }
  .ss-val { color: #888888; }

  /* import/export feedback */
  .import-status { font-size: 11px; color: #16a34a; }
  .import-status.error { color: #dc2626; }

  /* profile bar */
  .profile-bar {
    padding: 8px 24px;
    border-bottom: 1px solid #ebebeb;
    background: #f9f9f9;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .profile-bar-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.07em;
    text-transform: uppercase; color: #bbbbbb; flex-shrink: 0;
  }
  .profile-select {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    background: #ffffff; border: 1px solid #e0e0e0;
    border-radius: 7px; padding: 5px 9px;
    color: #333333; cursor: pointer; outline: none;
    transition: border-color 0.15s;
  }
  .profile-select:focus { border-color: #ff3d3d88; }
  .profile-active-badge {
    font-size: 10px; font-weight: 500;
    background: #fff0f0; color: #ff3d3d;
    border: 1px solid #ffd4d4;
    border-radius: 4px; padding: 2px 7px;
    font-family: 'DM Mono', monospace;
  }
  .profile-create-row { display: flex; gap: 6px; align-items: center; margin-left: auto; }
  .profile-create-input {
    font-family: 'DM Mono', monospace;
    font-size: 11px;
    background: #ffffff; border: 1px solid #e0e0e0;
    border-radius: 6px; padding: 5px 8px;
    color: #111111; outline: none; width: 140px;
    transition: border-color 0.15s;
  }
  .profile-create-input::placeholder { color: #cccccc; }
  .profile-create-input:focus { border-color: #ff3d3d88; }

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

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso.slice(0, 16)
  }
}

function displayType(type: string): string {
  return FILTER_LABEL[type as RuleType] ?? type
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OptionsPage() {
  // navigation
  const [activeTab, setActiveTab] = useState<"rules" | "logs">("rules")

  // rules state
  const [rules, setRules]         = useState<Rule[]>([])
  const [settings, setSettings]   = useState<Settings | null>(null)
  const [loading, setLoading]     = useState(true)

  // add form
  const [newFormType, setNewFormType] = useState<FormType>("keyword")
  const [newTarget, setNewTarget]     = useState("")
  const [newAction, setNewAction]     = useState<RuleAction>("hide")
  const [formError, setFormError]     = useState("")

  // filter
  const [filter, setFilter] = useState<FilterType>("all")

  // editing
  const [editId, setEditId]     = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")

  // import/export
  const [importMsg, setImportMsg] = useState("")
  const [importErr, setImportErr] = useState(false)
  const importRef                 = useRef<HTMLInputElement>(null)

  // logs
  const [logs, setLogs]             = useState<MatchLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // profiles
  const [profiles, setProfiles]         = useState<Profile[]>([])
  const [viewProfileId, setViewProfileId] = useState<number | null>(null)
  const [newProfileName, setNewProfileName] = useState("")

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    try {
      const [s, p] = await Promise.all([
        send<Settings>({ type: "GET_SETTINGS" }),
        send<Profile[]>({ type: "GET_PROFILES" }),
      ])
      setSettings(s)
      setProfiles(p)
      setNewAction(s.defaultAction ?? "hide")

      const initProfileId = s.activeProfileId ?? p[0]?.id ?? null
      setViewProfileId(initProfileId)
      const payload: GetAllRulesPayload = { profileId: initProfileId }
      const r = await send<Rule[]>({ type: "GET_ALL_RULES", payload })
      setRules(r)
    } finally {
      setLoading(false)
    }
  }

  function switchTab(tab: "rules" | "logs") {
    setActiveTab(tab)
    if (tab === "logs") void loadLogs()
  }

  async function loadLogs() {
    setLogsLoading(true)
    try {
      const data = await send<MatchLog[]>({ type: "GET_MATCH_LOGS" })
      setLogs(data)
    } finally {
      setLogsLoading(false)
    }
  }

  async function clearLogs() {
    await send({ type: "CLEAR_MATCH_LOGS" })
    setLogs([])
  }

  // ── settings ──────────────────────────────────────────────────────────────

  async function saveSettings(patch: Partial<Settings>) {
    const updated = await send<Settings>({ type: "SAVE_SETTINGS", payload: patch })
    setSettings(updated)
    if ("enabled" in patch) await refreshTabs()
  }

  // ── rule CRUD ─────────────────────────────────────────────────────────────

  async function createRule() {
    const target = newTarget.trim()
    if (!target) { setFormError("Không được để trống."); return }

    let ruleType: RuleType
    let ruleTarget: string

    if (newFormType === "channelLink" || newFormType === "videoLink") {
      const parsed = parseYouTubeUrl(target)
      if (!parsed) {
        setFormError(
          newFormType === "channelLink"
            ? "URL không hợp lệ. Thử: youtube.com/@TênKênh"
            : "URL không hợp lệ. Thử: youtube.com/watch?v=xxx"
        )
        return
      }
      ruleType = parsed.type
      ruleTarget = parsed.value
    } else {
      ruleType = newFormType as RuleType
      ruleTarget = target
    }

    setFormError("")
    const payload: CreateRulePayload = { type: ruleType, targetRaw: ruleTarget, action: newAction, profileId: viewProfileId }
    const updated = await send<Rule[]>({ type: "CREATE_RULE", payload })
    setRules(updated)
    setNewTarget("")
    await refreshTabs()
  }

  async function deleteRule(id?: number) {
    if (!id) return
    const updated = await send<Rule[]>({ type: "DELETE_RULE", payload: { id, profileId: viewProfileId } })
    setRules(updated)
    await refreshTabs()
  }

  async function toggleEnabled(rule: Rule) {
    if (!rule.id) return
    const payload: ToggleRulePayload = { id: rule.id, enabled: !rule.enabled, profileId: viewProfileId }
    const updated = await send<Rule[]>({ type: "SET_RULE_ENABLED", payload })
    setRules(updated)
    await refreshTabs()
  }

  async function changeAction(rule: Rule, action: RuleAction) {
    if (!rule.id || rule.action === action) return
    const payload: UpdateRulePayload = { id: rule.id, patch: { action }, profileId: viewProfileId }
    const updated = await send<Rule[]>({ type: "UPDATE_RULE", payload })
    setRules(updated)
    await refreshTabs()
  }

  async function saveEdit() {
    if (!editId) return
    const trimmed = editValue.trim()
    if (!trimmed) { setFormError("Không được để trống."); return }
    setFormError("")
    const payload: UpdateRulePayload = { id: editId, patch: { targetRaw: trimmed }, profileId: viewProfileId }
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
        await send<Rule[]>({ type: "CREATE_RULE", payload: { type: r.type, targetRaw: r.targetRaw, action: r.action, profileId: viewProfileId } })
        count++
      }
      const payload: GetAllRulesPayload = { profileId: viewProfileId }
      const updated = await send<Rule[]>({ type: "GET_ALL_RULES", payload })
      setRules(updated)
      setImportMsg(`Đã import ${count} rules.`)
      await refreshTabs()
    } catch {
      setImportMsg("Lỗi đọc file."); setImportErr(true)
    }
  }

  // ── profile actions ───────────────────────────────────────────────────────

  async function switchViewProfile(profileId: number | null) {
    setViewProfileId(profileId)
    const payload: GetAllRulesPayload = { profileId }
    const r = await send<Rule[]>({ type: "GET_ALL_RULES", payload })
    setRules(r)
    setFilter("all")
  }

  async function createProfile() {
    const name = newProfileName.trim()
    if (!name) return
    const updated = await send<Profile[]>({ type: "CREATE_PROFILE", payload: { name } })
    setProfiles(updated)
    setNewProfileName("")
    const newProfile = updated[updated.length - 1]
    if (newProfile?.id) await switchViewProfile(newProfile.id)
  }

  async function deleteCurrentProfile() {
    if (!viewProfileId) return
    const payload: DeleteProfilePayload = { id: viewProfileId }
    const updated = await send<Profile[]>({ type: "DELETE_PROFILE", payload })
    setProfiles(updated)
    const updatedSettings = await send<Settings>({ type: "GET_SETTINGS" })
    setSettings(updatedSettings)
    const nextId = updated[0]?.id ?? null
    await switchViewProfile(nextId)
    await refreshTabs()
  }

  async function useThisProfile() {
    const payload: SetActiveProfilePayload = { profileId: viewProfileId }
    const updatedSettings = await send<Settings>({ type: "SET_ACTIVE_PROFILE", payload })
    setSettings(updatedSettings)
    await refreshTabs()
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
        <div style={{ padding: 40, color: "#aaaaaa", fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>đang tải…</div>
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

          {/* Tab navigation */}
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === "rules" ? "active" : ""}`}
              onClick={() => switchTab("rules")}
            >
              Quy tắc
            </button>
            <button
              className={`nav-tab ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => switchTab("logs")}
            >
              Nhật ký
            </button>
          </div>

          {/* Filter by type (rules tab only) */}
          {activeTab === "rules" && (
            <div className="sidebar-section">
              <div className="sidebar-label">Lọc theo loại</div>
              {(["all", ...RULE_TYPES] as FilterType[]).map((t) => (
                <button
                  key={t}
                  className={`filter-btn ${filter === t ? "active" : ""}`}
                  onClick={() => setFilter(t)}
                >
                  <span>{t === "all" ? "Tất cả" : FILTER_LABEL[t as RuleType]}</span>
                  <span className="filter-count">{countByType[t] ?? 0}</span>
                </button>
              ))}
            </div>
          )}

          {/* Settings */}
          <div className="sidebar-settings">
            <div className="sidebar-label" style={{ marginBottom: 8 }}>Cài đặt</div>

            <label className="setting-row">
              <span className={`setting-label ${settings?.enabled ? "active" : ""}`}>
                {settings?.enabled ? "Extension bật" : "Extension tắt"}
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
              <span className="setting-label">Mặc định</span>
              <div className="action-seg" style={{ borderRadius: 6 }}>
                <button
                  className={`seg-btn ${settings?.defaultAction === "hide" ? "sel-hide" : ""}`}
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  onClick={() => void saveSettings({ defaultAction: "hide" })}
                >Ẩn</button>
                <button
                  className={`seg-btn ${settings?.defaultAction === "flag" ? "sel-flag" : ""}`}
                  style={{ padding: "4px 9px", fontSize: 11 }}
                  onClick={() => void saveSettings({ defaultAction: "flag" })}
                >⚑</button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: "5px 8px", width: "100%" }}
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("debug-panel.html") })}
              >
                🔍 debug panel
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="main">

          {activeTab === "rules" ? (
            <>
              {/* Topbar */}
              <div className="topbar">
                <div>
                  <div className="topbar-title">
                    {filter === "all" ? "Tất cả quy tắc" : FILTER_LABEL[filter as RuleType]}
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

              {/* Profile bar */}
              <div className="profile-bar">
                <span className="profile-bar-label">Hồ sơ</span>
                <select
                  className="profile-select"
                  value={viewProfileId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value
                    void switchViewProfile(val === "" ? null : Number(val))
                  }}
                >
                  {profiles.length === 0
                    ? <option value="">— chưa có hồ sơ —</option>
                    : profiles.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                  }
                </select>

                {viewProfileId != null && settings?.activeProfileId !== viewProfileId && (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 11, padding: "5px 12px" }}
                    onClick={() => void useThisProfile()}
                  >
                    Sử dụng profile này
                  </button>
                )}
                {viewProfileId != null && settings?.activeProfileId === viewProfileId && (
                  <span className="profile-active-badge">đang dùng</span>
                )}

                {viewProfileId != null && (
                  <button
                    className="btn btn-danger"
                    style={{ fontSize: 11, padding: "5px 10px" }}
                    onClick={() => void deleteCurrentProfile()}
                  >
                    Xóa hồ sơ
                  </button>
                )}

                <div className="profile-create-row">
                  <input
                    className="profile-create-input"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void createProfile()}
                    placeholder="Tên hồ sơ mới…"
                  />
                  <button
                    className="btn"
                    style={{ fontSize: 11 }}
                    onClick={() => void createProfile()}
                    disabled={!newProfileName.trim()}
                  >
                    + Tạo
                  </button>
                </div>
              </div>

              {/* Add form */}
              <div className="add-form">
                <div className="form-row">
                  <div className="form-col">
                    <span className="form-label">Loại</span>
                    <select
                      className="select"
                      value={newFormType}
                      onChange={(e) => { setNewFormType(e.target.value as FormType); setFormError("") }}
                    >
                      {FORM_TYPES.map((t) => (
                        <option key={t} value={t}>{FORM_LABEL[t]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-col" style={{ flex: 1 }}>
                    <span className="form-label">
                      {newFormType === "channelLink" || newFormType === "videoLink" ? "URL" : "Từ khóa / Tên"}
                    </span>
                    <input
                      className="input grow"
                      value={newTarget}
                      onChange={(e) => setNewTarget(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void createRule()}
                      placeholder={FORM_PLACEHOLDER[newFormType]}
                    />
                  </div>

                  <div className="form-col">
                    <span className="form-label">Action</span>
                    <div className="action-seg">
                      <button
                        className={`seg-btn ${newAction === "hide" ? "sel-hide" : ""}`}
                        onClick={() => setNewAction("hide")}
                      >Ẩn</button>
                      <button
                        className={`seg-btn ${newAction === "flag" ? "sel-flag" : ""}`}
                        onClick={() => setNewAction("flag")}
                      >⚑</button>
                    </div>
                  </div>

                  <div className="form-col" style={{ justifyContent: "flex-end" }}>
                    <span className="form-label" style={{ visibility: "hidden" }}>x</span>
                    <button className="btn btn-primary" onClick={() => void createRule()}>
                      Thêm rule
                    </button>
                  </div>
                </div>
                {formError && <div className="error-msg">{formError}</div>}
                {(newFormType === "channelLink") && !formError && (
                  <div className="url-hint">Hỗ trợ: youtube.com/@handle · youtube.com/channel/UC…</div>
                )}
                {(newFormType === "videoLink") && !formError && (
                  <div className="url-hint">Hỗ trợ: youtube.com/watch?v=… · youtu.be/… · /shorts/…</div>
                )}
              </div>

              {/* Table */}
              <div className="table-wrap">
                {visible.length === 0 ? (
                  <div className="empty-table">
                    <strong>Chưa có rules</strong>
                    Thêm rule phía trên để bắt đầu
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Loại</th>
                        <th>Target</th>
                        <th>Action</th>
                        <th>Bật</th>
                        <th>Cập nhật</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((rule) => (
                        <tr key={rule.id} className={rule.enabled ? "" : "row-disabled"}>

                          <td className="td-type">{displayType(rule.type)}</td>

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
                              <span title={rule.targetRaw}>{rule.targetRaw}</span>
                            )}
                          </td>

                          <td>
                            <div className="action-pill">
                              <button
                                className={`ap-btn ap-hide ${rule.action === "hide" ? "ap-active" : ""}`}
                                onClick={() => void changeAction(rule, "hide")}
                                title="Đặt ẩn"
                              >ẩn</button>
                              <button
                                className={`ap-btn ap-flag ${rule.action === "flag" ? "ap-active" : ""}`}
                                onClick={() => void changeAction(rule, "flag")}
                                title="Đặt flag"
                              >⚑</button>
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
                                <button className="row-btn save" onClick={() => void saveEdit()}>Lưu</button>
                                <button className="row-btn" onClick={() => { setEditId(null); setEditValue(""); setFormError("") }}>Hủy</button>
                              </>
                            ) : (
                              <>
                                <button className="row-btn" onClick={() => { setEditId(rule.id!); setEditValue(rule.targetRaw) }}>Sửa</button>
                                <button className="row-btn del" onClick={() => void deleteRule(rule.id)}>Xóa</button>
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
                <div className="ss-item"><span>tổng</span><span className="ss-val">{rules.length}</span></div>
                <div className="ss-item"><span>bật</span><span className="ss-val">{rules.filter((r) => r.enabled).length}</span></div>
                <div className="ss-item"><span>ẩn</span><span className="ss-val">{rules.filter((r) => r.action === "hide").length}</span></div>
                <div className="ss-item"><span>flag</span><span className="ss-val">{rules.filter((r) => r.action === "flag").length}</span></div>
                <div className="ss-item"><span>ext</span><span className="ss-val">{settings?.enabled ? "bật" : "tắt"}</span></div>
              </div>
            </>
          ) : (
            <>
              {/* Nhật ký topbar */}
              <div className="topbar">
                <div>
                  <div className="topbar-title">Nhật ký</div>
                  <div className="topbar-sub">{logs.length} gần nhất</div>
                </div>
                <div className="topbar-actions">
                  <button className="btn" onClick={() => void loadLogs()} disabled={logsLoading}>
                    {logsLoading ? "đang tải…" : "Làm mới"}
                  </button>
                  {logs.length > 0 && (
                    <button className="btn btn-danger" onClick={() => void clearLogs()}>
                      Xóa logs
                    </button>
                  )}
                </div>
              </div>

              {/* Logs table */}
              <div className="table-wrap">
                {logsLoading ? (
                  <div className="empty-table">
                    <strong style={{ color: "#cccccc" }}>đang tải…</strong>
                  </div>
                ) : logs.length === 0 ? (
                  <div className="empty-table">
                    <strong>Chưa có logs</strong>
                    Logs xuất hiện khi có video bị filter
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Video</th>
                        <th>Kênh</th>
                        <th>Rule</th>
                        <th>Action</th>
                        <th>Thời gian</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="td-target" style={{ maxWidth: 200 }} title={log.title}>{log.title}</td>
                          <td className="td-type" style={{ maxWidth: 130 }}>{log.channelName || "—"}</td>
                          <td className="td-type" style={{ maxWidth: 160 }} title={`${log.ruleType}: ${log.ruleTarget}`}>
                            {displayType(log.ruleType)}: {log.ruleTarget}
                          </td>
                          <td>
                            <span className={`action-badge ${log.action}`}>
                              {log.action === "hide" ? "ẩn" : "⚑"}
                            </span>
                          </td>
                          <td className="td-date">{fmtDatetime(log.matchedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
