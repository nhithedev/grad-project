import type { Rule } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { YouTubePageType } from "~core/types/candidate"

export type MessageType =
  | "GET_SETTINGS"
  | "SAVE_SETTINGS"
  | "GET_ALL_RULES"
  | "GET_RULES_BY_TYPE"
  | "CREATE_RULE"
  | "UPDATE_RULE"
  | "SET_RULE_ENABLED"
  | "DELETE_RULE"
  | "GET_PARSED_CANDIDATES"
  | "CLEAR_PARSED_CANDIDATES"
  | "CACHE_ENTITY"
  | "REFRESH_HIGHLIGHTS"
  | "PING"

export interface Message<T = unknown> {
  type: MessageType
  payload?: T
}

export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface CreateRulePayload {
  type: "keyword" | "channelName" | "channelId" | "videoId"
  targetRaw: string
  action?: "hide" | "flag"
  note?: string
}

export interface UpdateRulePayload {
  id: number
  patch: Partial<Rule>
}

export interface ToggleRulePayload {
  id: number
  enabled: boolean
}

export interface GetRulesByTypePayload {
  type: "keyword" | "channelName" | "channelId" | "videoId"
}

export interface CacheEntityPayload {
  videoId: string
  channelId?: string
  channelName?: string
  title: string
  pageType: YouTubePageType
  url?: string
}

export type GetSettingsResponse = MessageResponse<Settings>
export type GetRulesResponse = MessageResponse<Rule[]>