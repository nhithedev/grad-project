export type DefaultAction = "hide" | "flag"

export interface Settings {
  enabled: boolean
  defaultAction: DefaultAction
  debugMode: boolean
  matchScopes: string[]
  activeProfileId: number | null
  overlayImageUrl?: string
}