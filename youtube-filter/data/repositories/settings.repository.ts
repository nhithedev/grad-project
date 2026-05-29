import type { Settings } from "~core/types/settings"
import {
  DEFAULT_SETTINGS,
  getSettingsFromStorage,
  resetSettingsInStorage,
  saveSettingsToStorage
} from "~data/storage"

export class SettingsRepository {
  async getSettings(): Promise<Settings> {
    return getSettingsFromStorage()
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const normalizedPatch = this.normalizePatch(patch)
    return saveSettingsToStorage(normalizedPatch)
  }

  async toggleEnabled(): Promise<Settings> {
    const current = await this.getSettings()

    return saveSettingsToStorage({
      enabled: !current.enabled
    })
  }

  async reset(): Promise<Settings> {
    return resetSettingsInStorage()
  }

  getDefaults(): Settings {
    return DEFAULT_SETTINGS
  }

  private normalizePatch(patch: Partial<Settings>): Partial<Settings> {
    const nextPatch: Partial<Settings> = { ...patch }

    if (
      nextPatch.defaultAction &&
      nextPatch.defaultAction !== "hide" &&
      nextPatch.defaultAction !== "flag"
    ) {
      nextPatch.defaultAction = DEFAULT_SETTINGS.defaultAction
    }

    if (Array.isArray(nextPatch.matchScopes)) {
      nextPatch.matchScopes = nextPatch.matchScopes
        .map((scope) => String(scope).trim())
        .filter(Boolean)
    }

    return nextPatch
  }
}

export const settingsRepository = new SettingsRepository()