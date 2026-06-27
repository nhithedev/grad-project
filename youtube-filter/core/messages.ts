import type { Rule, RuleList } from "~core/types/rule"
import type { Settings } from "~core/types/settings"
import type { YouTubePageType } from "~core/types/candidate"
import type { Profile } from "~core/types/profile"
import type { ReviewItem } from "~core/types/review-item"
import type { AiSuggestion } from "~core/types/ai-suggestion"

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
  | "CACHE_ENTITIES_BATCH"
  | "LOG_MATCH"
  | "GET_MATCH_LOGS"
  | "CLEAR_MATCH_LOGS"
  | "REFRESH_HIGHLIGHTS"
  | "PING"
  | "GET_PROFILES"
  | "CREATE_PROFILE"
  | "UPDATE_PROFILE"
  | "DELETE_PROFILE"
  | "SET_ACTIVE_PROFILE"
  | "GET_RULE_LISTS"
  | "CREATE_RULE_LIST"
  | "DELETE_RULE_LIST"
  | "GET_ENTITY_BY_VIDEO_ID"
  | "GET_REVIEW_QUEUE"
  | "ADD_TO_REVIEW_QUEUE"
  | "RESOLVE_REVIEW_ITEM"
  | "GET_AI_SUGGESTIONS"
  | "TRIGGER_AI_SUGGEST"
  | "RESOLVE_AI_SUGGESTION"

export interface Message<T = unknown> {
  type: MessageType
  payload?: T
}

export interface MessageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface GetEntityByVideoIdPayload {
  videoId: string
}

export interface CreateRulePayload {
  type: "keyword" | "channelName" | "channelId" | "videoId" | "regex"
  targetRaw: string
  action?: "hide" | "flag"
  note?: string
  profileId?: number | null
}

export interface UpdateRulePayload {
  id: number
  patch: Partial<Rule>
  profileId?: number | null
}

export interface ToggleRulePayload {
  id: number
  enabled: boolean
  profileId?: number | null
}

export interface GetRulesByTypePayload {
  type: "keyword" | "channelName" | "channelId" | "videoId" | "regex"
}

export interface CacheEntityPayload {
  videoId: string
  channelId?: string
  channelName?: string
  title: string
  description?: string
  pageType: YouTubePageType
  url?: string
}

export interface LogMatchPayload {
  videoId: string
  title: string
  channelName?: string
  ruleId: number
  ruleType: string
  ruleTarget: string
  action: "hide" | "flag"
  reason: string
}

export interface CacheEntitiesBatchPayload {
  entities: CacheEntityPayload[]
}

export interface GetAllRulesPayload {
  profileId?: number | null
}

export type GetSettingsResponse = MessageResponse<Settings>
export type GetRulesResponse = MessageResponse<Rule[]>
export type GetProfilesResponse = MessageResponse<Profile[]>
export type GetRuleListsResponse = MessageResponse<RuleList[]>

export interface CreateProfilePayload {
  name: string
}

export interface UpdateProfilePayload {
  id: number
  name: string
}

export interface DeleteProfilePayload {
  id: number
}

export interface SetActiveProfilePayload {
  profileId: number | null
}

export interface GetRuleListsPayload {
  profileId: number
}

export interface CreateRuleListPayload {
  profileId: number
  name: string
}

export interface DeleteRuleListPayload {
  id: number
}

export interface AddToReviewQueuePayload {
  videoId: string
  title?: string
  channelName?: string
  channelId?: string
  aiReason?: string
  aiConfidence?: number
  addedBy: "ai" | "user"
}

export interface ResolveReviewItemPayload {
  id: number
  status: "approved" | "dismissed"
  createRule?: CreateRulePayload
}

export interface ResolveAiSuggestionPayload {
  id: number
  status: "approved" | "dismissed"
}

export type GetReviewQueueResponse = MessageResponse<ReviewItem[]>
export type GetAiSuggestionsResponse = MessageResponse<AiSuggestion[]>