/// <reference types="chrome" />

import { settingsRepository } from "~data/repositories/settings.repository"
import { rulesRepository } from "~data/repositories/rules.repository"
import { entitiesRepository } from "~data/repositories/entities.repository"
import { matchLogRepository } from "~data/repositories/match-log.repository"
import { profilesRepository } from "~data/repositories/profiles.repository"
import { ruleListsRepository } from "~data/repositories/rule-lists.repository"
import { reviewQueueRepository } from "~data/repositories/review-queue.repository"
import { aiSuggestionsRepository } from "~data/repositories/ai-suggestions.repository"
import { db } from "~data/db/app-db"
import type {
  AddToReviewQueuePayload,
  CacheEntitiesBatchPayload,
  CacheEntityPayload,
  CreateProfilePayload,
  CreateRuleListPayload,
  CreateRulePayload,
  DeleteProfilePayload,
  DeleteRuleListPayload,
  GetAllRulesPayload,
  GetEntityByVideoIdPayload,
  GetRuleListsPayload,
  GetRulesByTypePayload,
  LogMatchPayload,
  Message,
  MessageResponse,
  ResolveAiSuggestionPayload,
  ResolveReviewItemPayload,
  SetActiveProfilePayload,
  ToggleRulePayload,
  UpdateProfilePayload,
  UpdateRulePayload
} from "~core/messages"
import type { AiSuggestion } from "~core/types/ai-suggestion"
import type { Settings } from "~core/types/settings"
import { nowIso } from "~data/utils/normalize"

const BACKEND_URL = process.env.PLASMO_PUBLIC_BACKEND_URL ?? ""

async function initialize() {
  const defaultProfileId = await profilesRepository.ensureDefault()
  const settings = await settingsRepository.getSettings()
  if (settings.activeProfileId === null) {
    await settingsRepository.updateSettings({ activeProfileId: defaultProfileId })
  }
}

void initialize()

async function callBackend<T>(path: string, body: unknown): Promise<T | null> {
  if (!BACKEND_URL) return null
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return res.json() as T
  } catch {
    return null
  }
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((error: Error) => {
      sendResponse({
        success: false,
        error: error.message
      })
    })

  return true
})

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.type) {
    case "GET_SETTINGS":
      return {
        success: true,
        data: await settingsRepository.getSettings()
      }

    case "SAVE_SETTINGS":
      return {
        success: true,
        data: await settingsRepository.updateSettings(
          (message.payload ?? {}) as Partial<Settings>
        )
      }

    case "GET_ALL_RULES": {
      const payload = message.payload as GetAllRulesPayload | undefined
      const profileId = payload && "profileId" in payload
        ? payload.profileId
        : (await settingsRepository.getSettings()).activeProfileId
      return {
        success: true,
        data: await rulesRepository.getAllRules(profileId)
      }
    }

    case "GET_RULES_BY_TYPE": {
      const payload = message.payload as GetRulesByTypePayload
      return {
        success: true,
        data: await rulesRepository.getRulesByType(payload.type)
      }
    }

    case "CREATE_RULE": {
      const payload = message.payload as CreateRulePayload
      const settings = await settingsRepository.getSettings()
      const profileId = payload.profileId !== undefined ? payload.profileId : settings.activeProfileId
      await rulesRepository.createRule({ ...payload, profileId })
      return {
        success: true,
        data: await rulesRepository.getAllRules(profileId)
      }
    }

    case "UPDATE_RULE": {
      const payload = message.payload as UpdateRulePayload
      await rulesRepository.updateRule(payload.id, payload.patch)
      const profileId = payload.profileId !== undefined
        ? payload.profileId
        : (await settingsRepository.getSettings()).activeProfileId
      return {
        success: true,
        data: await rulesRepository.getAllRules(profileId)
      }
    }

    case "SET_RULE_ENABLED": {
      const payload = message.payload as ToggleRulePayload
      await rulesRepository.setRuleEnabled(payload.id, payload.enabled)
      const profileId = payload.profileId !== undefined
        ? payload.profileId
        : (await settingsRepository.getSettings()).activeProfileId
      return {
        success: true,
        data: await rulesRepository.getAllRules(profileId)
      }
    }

    case "DELETE_RULE": {
      const payload = message.payload as { id: number; profileId?: number | null }
      await rulesRepository.deleteRule(payload.id)
      const profileId = payload.profileId !== undefined
        ? payload.profileId
        : (await settingsRepository.getSettings()).activeProfileId
      return {
        success: true,
        data: await rulesRepository.getAllRules(profileId)
      }
    }

    case "GET_PARSED_CANDIDATES":
      return {
        success: true,
        data: await entitiesRepository.getAll()
      }

    case "CLEAR_PARSED_CANDIDATES":
      await entitiesRepository.clearAll()
      return {
        success: true,
        data: { ok: true }
      }

    case "CACHE_ENTITY": {
  const payload = message.payload as CacheEntityPayload
  console.log("[BG] CACHE_ENTITY received:", payload)

  const result = await entitiesRepository.upsertEntity({
    videoId: payload.videoId,
    channelId: payload.channelId,
    channelName: payload.channelName,
    title: payload.title,
    pageType: payload.pageType,
    url: payload.url
  })

  const all = await entitiesRepository.getAll()

  console.log("[BG] CACHE_ENTITY saved result:", result)
  console.log("[BG] entities count:", all.length)
  console.log("[BG] latest entity:", all[0])

  return {
    success: true,
    data: { ok: true, count: all.length }
  }
}

    case "LOG_MATCH": {
      const payload = message.payload as LogMatchPayload
      await matchLogRepository.addLog({ ...payload, matchedAt: nowIso() })
      return { success: true, data: { ok: true } }
    }

    case "GET_MATCH_LOGS":
      return { success: true, data: await matchLogRepository.getRecent() }

    case "CLEAR_MATCH_LOGS":
      await matchLogRepository.clearAll()
      return { success: true, data: { ok: true } }

    case "CACHE_ENTITIES_BATCH": {
      const { entities } = message.payload as CacheEntitiesBatchPayload
      await db.transaction("rw", db.entitiesCache, async () => {
        for (const payload of entities) {
          await entitiesRepository.upsertEntity({
            videoId: payload.videoId,
            channelId: payload.channelId,
            channelName: payload.channelName,
            title: payload.title,
            description: payload.description,
            pageType: payload.pageType,
            url: payload.url,
          })
        }
      })
      return { success: true, data: { count: entities.length } }
    }

    case "REFRESH_HIGHLIGHTS": {
      const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" })
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "REFRESH_HIGHLIGHTS" }).catch(() => {})
        }
      }
      return { success: true, data: { ok: true } }
    }

    case "PING":
      return {
        success: true,
        data: "pong"
      }

    case "GET_PROFILES":
      return { success: true, data: await profilesRepository.getAll() }

    case "CREATE_PROFILE": {
      const payload = message.payload as CreateProfilePayload
      const newId = await profilesRepository.create(payload.name)
      await ruleListsRepository.ensureForProfile(newId)
      return { success: true, data: await profilesRepository.getAll() }
    }

    case "UPDATE_PROFILE": {
      const payload = message.payload as UpdateProfilePayload
      await profilesRepository.update(payload.id, payload.name)
      return { success: true, data: await profilesRepository.getAll() }
    }

    case "DELETE_PROFILE": {
      const payload = message.payload as DeleteProfilePayload
      const settings = await settingsRepository.getSettings()
      await profilesRepository.delete(payload.id)
      if (settings.activeProfileId === payload.id) {
        const remaining = await profilesRepository.getAll()
        const nextId = remaining[0]?.id ?? null
        await settingsRepository.updateSettings({ activeProfileId: nextId })
      }
      return { success: true, data: await profilesRepository.getAll() }
    }

    case "SET_ACTIVE_PROFILE": {
      const payload = message.payload as SetActiveProfilePayload
      const updated = await settingsRepository.updateSettings({ activeProfileId: payload.profileId })
      return { success: true, data: updated }
    }

    case "GET_RULE_LISTS": {
      const payload = message.payload as GetRuleListsPayload
      return { success: true, data: await ruleListsRepository.getByProfile(payload.profileId) }
    }

    case "CREATE_RULE_LIST": {
      const payload = message.payload as CreateRuleListPayload
      await ruleListsRepository.create(payload.profileId, payload.name)
      return { success: true, data: await ruleListsRepository.getByProfile(payload.profileId) }
    }

    case "GET_ENTITY_BY_VIDEO_ID": {
      const { videoId } = message.payload as GetEntityByVideoIdPayload
      const entity = await entitiesRepository.getByVideoId(videoId)
      return { success: true, data: entity ?? null }
    }

    case "DELETE_RULE_LIST": {
      const payload = message.payload as DeleteRuleListPayload
      const list = await db.ruleLists.get(payload.id)
      await ruleListsRepository.delete(payload.id)
      const profileId = list?.profileId
      if (profileId != null) {
        return { success: true, data: await ruleListsRepository.getByProfile(profileId) }
      }
      return { success: true, data: [] }
    }

    case "GET_REVIEW_QUEUE":
      return { success: true, data: await reviewQueueRepository.getAll() }

    case "ADD_TO_REVIEW_QUEUE": {
      const payload = message.payload as AddToReviewQueuePayload
      await reviewQueueRepository.add({ ...payload, addedAt: nowIso(), status: "pending" })
      const queue = await reviewQueueRepository.getAll()
      await updateBadge(queue.length)
      return { success: true, data: queue }
    }

    case "RESOLVE_REVIEW_ITEM": {
      const payload = message.payload as ResolveReviewItemPayload
      await reviewQueueRepository.resolve(payload.id, payload.status)
      if (payload.status === "approved" && payload.createRule) {
        const settings = await settingsRepository.getSettings()
        const profileId = payload.createRule.profileId !== undefined
          ? payload.createRule.profileId
          : settings.activeProfileId
        await rulesRepository.createRule({ ...payload.createRule, profileId })
      }
      const queue = await reviewQueueRepository.getAll()
      await updateBadge(queue.length)
      return { success: true, data: queue }
    }

    case "GET_AI_SUGGESTIONS":
      return { success: true, data: await aiSuggestionsRepository.getAll() }

    case "TRIGGER_AI_SUGGEST": {
      const logs = await matchLogRepository.getRecent()
      const rules = await rulesRepository.getAllRules()
      const result = await callBackend<{ suggestions: AiSuggestion[] }>("/ai/suggest", {
        recentLogs: logs,
        existingRules: rules,
      })
      if (result?.suggestions?.length) {
        const withMeta = result.suggestions.map((s) => ({
          ...s,
          status: "pending" as const,
          createdAt: nowIso(),
        }))
        await aiSuggestionsRepository.addBatch(withMeta)
      }
      return { success: true, data: await aiSuggestionsRepository.getAll() }
    }

    case "RESOLVE_AI_SUGGESTION": {
      const payload = message.payload as ResolveAiSuggestionPayload
      const suggestion = await aiSuggestionsRepository.getById(payload.id)
      await aiSuggestionsRepository.resolve(payload.id, payload.status)
      if (payload.status === "approved" && suggestion) {
        const settings = await settingsRepository.getSettings()
        await rulesRepository.createRule({
          type: suggestion.type,
          targetRaw: suggestion.targetRaw,
          action: suggestion.action,
          profileId: settings.activeProfileId,
        })
      }
      return { success: true, data: await aiSuggestionsRepository.getAll() }
    }

    default:
      return {
        success: false,
        error: `Unknown message type: ${message.type}`
      }
  }
}

async function updateBadge(count: number) {
  try {
    await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" })
    if (count > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#ff3d3d" })
    }
  } catch {}
}

export {}