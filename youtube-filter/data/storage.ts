import type { Settings } from "~core/types/settings"

const SETTINGS_KEY = "settings"

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  defaultAction: "hide",
  debugMode: false,
  matchScopes: ["home", "search", "watch"],
  activeProfileId: null
}

export async function getSettingsFromStorage(): Promise<Settings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY)
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined

  return {
    ...DEFAULT_SETTINGS,
    ...stored
  }
}

export async function saveSettingsToStorage(
  patch: Partial<Settings>
): Promise<Settings> {
  const current = await getSettingsFromStorage()

  const next: Settings = {
    ...current,
    ...patch
  }

  await chrome.storage.sync.set({
    [SETTINGS_KEY]: next
  })

  return next
}

export async function resetSettingsInStorage(): Promise<Settings> {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: DEFAULT_SETTINGS
  })

  return DEFAULT_SETTINGS
}