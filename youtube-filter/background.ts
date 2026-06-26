/// <reference types="chrome" />

import { settingsRepository } from "~data/repositories/settings.repository"
import { rulesRepository } from "~data/repositories/rules.repository"
import { entitiesRepository } from "~data/repositories/entities.repository"
import { matchLogRepository } from "~data/repositories/match-log.repository"
import { profilesRepository } from "~data/repositories/profiles.repository"
import { ruleListsRepository } from "~data/repositories/rule-lists.repository"
import { db } from "~data/db/app-db"
import type {
  CacheEntitiesBatchPayload,
  CacheEntityPayload,
  CreateProfilePayload,
  CreateRuleListPayload,
  CreateRulePayload,
  DeleteProfilePayload,
  DeleteRuleListPayload,
  GetAllRulesPayload,
  GetRuleListsPayload,
  GetRulesByTypePayload,
  LogMatchPayload,
  Message,
  MessageResponse,
  SetActiveProfilePayload,
  ToggleRulePayload,
  UpdateProfilePayload,
  UpdateRulePayload
} from "~core/messages"
import type { Settings } from "~core/types/settings"
import { nowIso } from "~data/utils/normalize"

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

    default:
      return {
        success: false,
        error: `Unknown message type: ${message.type}`
      }
  }
}

export {}