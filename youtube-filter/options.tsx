import "./styles/options.css"
import { useEffect, useMemo, useState } from "react"
import type { Rule, RuleType, RuleAction } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { MatchLog } from "~core/types/match-log"
import type { Profile } from "~core/types/profile"
import type { AiSuggestion } from "~core/types/ai-suggestion"
import type {
  CreateRulePayload,
  DeleteProfilePayload,
  GetAllRulesPayload,
  GetEntityByVideoIdPayload,
  Message,
  MessageResponse,
  ResolveAiSuggestionPayload,
  SetActiveProfilePayload,
  ToggleRulePayload,
  UpdateRulePayload,
} from "~core/messages"
import type { EntityCache } from "~core/types/entity"
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
type FormType = "keyword" | "channelName" | "channelLink" | "videoLink" | "regex"
const FORM_TYPES: FormType[] = ["keyword", "channelName", "channelLink", "videoLink", "regex"]

const FORM_LABEL: Record<FormType, string> = {
  keyword: "Từ khóa",
  channelName: "Tên kênh",
  channelLink: "Link kênh",
  videoLink: "Link video",
  regex: "Regex",
}

const FORM_PLACEHOLDER: Record<FormType, string> = {
  keyword: "ví dụ: gaming, tin tức",
  channelName: "ví dụ: MrBeast",
  channelLink: "ví dụ: youtube.com/@MrBeast",
  videoLink: "ví dụ: youtube.com/watch?v=dQw4w9WgXcQ",
  regex: "ví dụ: gaming|game|fps",
}

// Actual stored rule types (for sidebar filter)
const RULE_TYPES: RuleType[] = ["keyword", "channelName", "channelId", "videoId", "regex"]
type FilterType = "all" | RuleType

const FILTER_LABEL: Record<RuleType, string> = {
  keyword: "Từ khóa",
  channelName: "Tên kênh",
  channelId: "Link kênh",
  videoId: "Link video",
  regex: "Regex",
}

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

  // logs
  const [logs, setLogs]             = useState<MatchLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // profiles
  const [profiles, setProfiles]         = useState<Profile[]>([])
  const [viewProfileId, setViewProfileId] = useState<number | null>(null)
  const [newProfileName, setNewProfileName] = useState("")

  // UC04: create rule from sample video
  const [sampleUrl, setSampleUrl]               = useState("")
  const [sampleEntity, setSampleEntity]         = useState<EntityCache | null>(null)
  const [sampleNotFound, setSampleNotFound]     = useState(false)
  const [sampleRuleChoice, setSampleRuleChoice] = useState<"keyword_title" | "channelName" | "channelId" | "videoId">("keyword_title")
  const [sampleAction, setSampleAction]         = useState<RuleAction>("hide")

  // Phase 5: AI suggestions
  const [aiSuggestions, setAiSuggestions]       = useState<AiSuggestion[]>([])
  const [aiLoading, setAiLoading]               = useState(false)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    try {
      const [s, p, suggestions] = await Promise.all([
        send<Settings>({ type: "GET_SETTINGS" }),
        send<Profile[]>({ type: "GET_PROFILES" }),
        send<AiSuggestion[]>({ type: "GET_AI_SUGGESTIONS" }),
      ])
      setSettings(s)
      setProfiles(p)
      setNewAction(s.defaultAction ?? "hide")
      setAiSuggestions(suggestions)

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
    } else if (newFormType === "regex") {
      try {
        new RegExp(target)
      } catch {
        setFormError("Regex không hợp lệ.")
        return
      }
      ruleType = "regex"
      ruleTarget = target
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

  // ── UC04: sample video lookup ─────────────────────────────────────────────

  async function lookupSampleVideo() {
    const url = sampleUrl.trim()
    if (!url) return
    setSampleEntity(null)
    setSampleNotFound(false)
    const parsed = parseYouTubeUrl(url)
    if (!parsed || parsed.type !== "videoId") {
      setSampleNotFound(true)
      return
    }
    const payload: GetEntityByVideoIdPayload = { videoId: parsed.value }
    const entity = await send<EntityCache | null>({ type: "GET_ENTITY_BY_VIDEO_ID", payload })
    if (entity) {
      setSampleEntity(entity)
    } else {
      setSampleNotFound(true)
    }
  }

  async function createRuleFromSample() {
    if (!sampleEntity) return
    let ruleType: RuleType
    let ruleTarget: string
    switch (sampleRuleChoice) {
      case "keyword_title":
        ruleType = "keyword"
        ruleTarget = sampleEntity.title ?? ""
        break
      case "channelName":
        ruleType = "channelName"
        ruleTarget = sampleEntity.channelName ?? ""
        break
      case "channelId":
        ruleType = "channelId"
        ruleTarget = sampleEntity.channelId ?? ""
        break
      case "videoId":
        ruleType = "videoId"
        ruleTarget = sampleEntity.videoId
        break
    }
    if (!ruleTarget) return
    const payload: CreateRulePayload = { type: ruleType, targetRaw: ruleTarget, action: sampleAction, profileId: viewProfileId }
    const updated = await send<Rule[]>({ type: "CREATE_RULE", payload })
    setRules(updated)
    setSampleUrl("")
    setSampleEntity(null)
    setSampleNotFound(false)
    await refreshTabs()
  }

  // ── ai suggestions ────────────────────────────────────────────────────────

  async function triggerAiSuggest() {
    setAiLoading(true)
    try {
      const updated = await send<AiSuggestion[]>({ type: "TRIGGER_AI_SUGGEST" })
      setAiSuggestions(updated)
    } finally {
      setAiLoading(false)
    }
  }

  async function resolveAiSuggestion(id: number, status: "approved" | "dismissed") {
    const payload: ResolveAiSuggestionPayload = { id, status }
    const updated = await send<AiSuggestion[]>({ type: "RESOLVE_AI_SUGGESTION", payload })
    setAiSuggestions(updated)
    if (status === "approved") {
      const rulesPayload: GetAllRulesPayload = { profileId: viewProfileId }
      const updatedRules = await send<Rule[]>({ type: "GET_ALL_RULES", payload: rulesPayload })
      setRules(updatedRules)
      await refreshTabs()
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
    return <div className="loading-state">đang tải…</div>
  }

  return (
    <>
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
            <div className="sidebar-label">Cài đặt</div>

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

            <div className="setting-row setting-row-static">
              <span className="setting-label">Mặc định</span>
              <div className="action-seg action-seg-sm">
                <button
                  className={`seg-btn seg-btn-sm ${settings?.defaultAction === "hide" ? "sel-hide" : ""}`}
                  onClick={() => void saveSettings({ defaultAction: "hide" })}
                >Ẩn</button>
                <button
                  className={`seg-btn seg-btn-sm ${settings?.defaultAction === "flag" ? "sel-flag" : ""}`}
                  onClick={() => void saveSettings({ defaultAction: "flag" })}
                >⚑</button>
              </div>
            </div>

            <div className="setting-row setting-row-static" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <span className="setting-label">Ảnh overlay (flag)</span>
              <input
                className="input"
                defaultValue={settings?.overlayImageUrl ?? ""}
                placeholder="để trống = dùng ảnh mặc định"
                onBlur={(e) => void saveSettings({ overlayImageUrl: e.target.value.trim() })}
              />
            </div>

            <div className="sidebar-debug">
              <button
                className="btn btn-ghost btn-debug"
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
              {/* Topbar with profile controls */}
              <div className="topbar">
                <div>
                  <div className="topbar-title">
                    {filter === "all" ? "Tất cả quy tắc" : FILTER_LABEL[filter as RuleType]}
                  </div>
                  <div className="topbar-sub">{visible.length} rules</div>
                </div>
                <div className="topbar-profile">
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

                  {viewProfileId != null && settings?.activeProfileId === viewProfileId && (
                    <span className="profile-active-badge">đang dùng</span>
                  )}
                  {viewProfileId != null && settings?.activeProfileId !== viewProfileId && (
                    <>
                      <span className="profile-applied-label">
                        áp dụng: {profiles.find((p) => p.id === settings?.activeProfileId)?.name ?? "—"}
                      </span>
                      <button
                        className="btn btn-primary btn-sm-wide"
                        onClick={() => void useThisProfile()}
                      >
                        Dùng hồ sơ này
                      </button>
                    </>
                  )}

                  {viewProfileId != null && profiles.length > 1 && (
                    <button
                      className="btn btn-danger btn-sm"
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
                      className="btn btn-sm"
                      onClick={() => void createProfile()}
                      disabled={!newProfileName.trim()}
                    >
                      + Tạo
                    </button>
                  </div>
                </div>
              </div>

              {/* 60/40 split */}
              <div className="content-split">

                {/* Left 60%: add form + table + status */}
                <div className="content-main">
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

                      <div className="form-col form-col-flex">
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

                      <div className="form-col form-col-end">
                        <span className="form-label invisible">x</span>
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
                    {(newFormType === "regex") && !formError && (
                      <div className="url-hint">Regex khớp với title và tên kênh, không phân biệt hoa/thường.</div>
                    )}
                  </div>

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

                  <div className="status-strip">
                    <div className="ss-item"><span>tổng</span><span className="ss-val">{rules.length}</span></div>
                    <div className="ss-item"><span>bật</span><span className="ss-val">{rules.filter((r) => r.enabled).length}</span></div>
                    <div className="ss-item"><span>ẩn</span><span className="ss-val">{rules.filter((r) => r.action === "hide").length}</span></div>
                    <div className="ss-item"><span>flag</span><span className="ss-val">{rules.filter((r) => r.action === "flag").length}</span></div>
                    <div className="ss-item"><span>ext</span><span className="ss-val">{settings?.enabled ? "bật" : "tắt"}</span></div>
                  </div>
                </div>

                {/* Right 40%: sample video card + AI suggestions card */}
                <div className="content-side">

                  {/* UC04: Create rule from sample video */}
                  <div className="card">
                    <div className="sample-header">Tạo rule từ video mẫu</div>
                    <div className="sample-row">
                      <input
                        className="input grow"
                        value={sampleUrl}
                        onChange={(e) => { setSampleUrl(e.target.value); setSampleEntity(null); setSampleNotFound(false) }}
                        onKeyDown={(e) => e.key === "Enter" && void lookupSampleVideo()}
                        placeholder="youtube.com/watch?v=…"
                      />
                      <button className="btn" onClick={() => void lookupSampleVideo()}>
                        Tra cứu
                      </button>
                    </div>

                    {sampleNotFound && (
                      <div className="sample-not-found">
                        Video chưa được xem trong phiên này — mở video trên YouTube trước.
                      </div>
                    )}

                    {sampleEntity && (
                      <div className="sample-result">
                        <div className="sample-meta">
                          <strong>Title:</strong> {sampleEntity.title || "—"}
                        </div>
                        <div className="sample-meta">
                          <strong>Kênh:</strong> {sampleEntity.channelName || "—"}
                        </div>
                        <div className="sample-row sample-row-wrap">
                          <select
                            className="select"
                            value={sampleRuleChoice}
                            onChange={(e) => setSampleRuleChoice(e.target.value as typeof sampleRuleChoice)}
                          >
                            {sampleEntity.title && <option value="keyword_title">Từ khóa từ title</option>}
                            {sampleEntity.channelName && <option value="channelName">Tên kênh</option>}
                            {sampleEntity.channelId && <option value="channelId">ID kênh</option>}
                            <option value="videoId">Video ID</option>
                          </select>
                          <div className="action-seg">
                            <button
                              className={`seg-btn ${sampleAction === "hide" ? "sel-hide" : ""}`}
                              onClick={() => setSampleAction("hide")}
                            >Ẩn</button>
                            <button
                              className={`seg-btn ${sampleAction === "flag" ? "sel-flag" : ""}`}
                              onClick={() => setSampleAction("flag")}
                            >⚑</button>
                          </div>
                          <button className="btn btn-primary btn-sm-wide" onClick={() => void createRuleFromSample()}>
                            Tạo rule
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Suggestions */}
                  <div className="card">
                    <div className="section-header">
                      <span className="section-title">Đề xuất AI</span>
                      {aiSuggestions.length > 0 && (
                        <span className="badge-count">{aiSuggestions.length}</span>
                      )}
                      <button
                        className="btn ai-analyze-btn"
                        disabled={aiLoading}
                        onClick={() => void triggerAiSuggest()}
                      >
                        {aiLoading ? "Đang phân tích…" : "Phân tích ngay"}
                      </button>
                    </div>
                    {aiSuggestions.length === 0 ? (
                      <div className="ai-empty">
                        Chưa có đề xuất. Nhấn "Phân tích ngay" để AI đề xuất rules dựa trên nhật ký.
                      </div>
                    ) : (
                      aiSuggestions.map((s) => (
                        <div key={s.id} className="suggestion-item">
                          <div className="suggestion-rule">
                            <span className="td-type">{s.type}</span>
                            {s.targetRaw}
                            <span className={`action-badge ${s.action}`}>
                              {s.action === "hide" ? "ẩn" : "⚑"}
                            </span>
                          </div>
                          {s.aiReason && (
                            <div className="suggestion-reason">{s.aiReason}</div>
                          )}
                          <div className="suggestion-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => void resolveAiSuggestion(s.id!, "approved")}
                            >
                              Thêm rule
                            </button>
                            <button
                              className="btn btn-sm"
                              onClick={() => void resolveAiSuggestion(s.id!, "dismissed")}
                            >
                              Bỏ qua
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                </div>
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
                    <strong>đang tải…</strong>
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
                          <td className="td-target log-title" title={log.title}>{log.title}</td>
                          <td className="td-type log-channel">{log.channelName || "—"}</td>
                          <td className="td-type log-rule" title={`${log.ruleType}: ${log.ruleTarget}`}>
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
