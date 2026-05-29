/// <reference types="chrome" />

import { settingsRepository } from "~data/repositories/settings.repository"
import { rulesRepository } from "~data/repositories/rules.repository"
import { entitiesRepository } from "~data/repositories/entities.repository"
import type {
  CacheEntityPayload,
  CreateRulePayload,
  GetRulesByTypePayload,
  Message,
  MessageResponse,
  ToggleRulePayload,
  UpdateRulePayload
} from "~core/messages"
import type { Settings } from "~core/types/settings"

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

    case "GET_ALL_RULES":
      return {
        success: true,
        data: await rulesRepository.getAllRules()
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
      await rulesRepository.createRule(payload)
      return {
        success: true,
        data: await rulesRepository.getAllRules()
      }
    }

    case "UPDATE_RULE": {
      const payload = message.payload as UpdateRulePayload
      await rulesRepository.updateRule(payload.id, payload.patch)
      return {
        success: true,
        data: await rulesRepository.getAllRules()
      }
    }

    case "SET_RULE_ENABLED": {
      const payload = message.payload as ToggleRulePayload
      await rulesRepository.setRuleEnabled(payload.id, payload.enabled)
      return {
        success: true,
        data: await rulesRepository.getAllRules()
      }
    }

    case "DELETE_RULE": {
      const id = message.payload as number
      await rulesRepository.deleteRule(id)
      return {
        success: true,
        data: await rulesRepository.getAllRules()
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

    case "REFRESH_HIGHLIGHTS":
      return {
        success: true,
        data: { ok: true }
      }

    case "PING":
      return {
        success: true,
        data: "pong"
      }

    default:
      return {
        success: false,
        error: `Unknown message type: ${message.type}`
      }
  }
}

export {}