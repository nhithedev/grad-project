import { GoogleGenerativeAI } from "@google/generative-ai"
import type { AiProvider, ClassifyInput, ClassifyOutput, SuggestInput, SuggestOutput } from "./provider"

export class GeminiProvider implements AiProvider {
  private model

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set")
    const genAI = new GoogleGenerativeAI(apiKey)
    this.model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })
  }

  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    const rulesText = input.existingRules.length
      ? input.existingRules.map((r) => `- ${r.type}: "${r.targetRaw}" → ${r.action}`).join("\n")
      : "(no existing rules)"

    const prompt = `You are a YouTube content filter assistant.

Existing filter rules:
${rulesText}

Video to classify:
- Title: "${input.title}"
- Channel: "${input.channelName || "unknown"}"
- Video ID: ${input.videoId}

Based on the existing rules and the video content, should this video be hidden, flagged, allowed, or are you uncertain?

Respond ONLY with valid JSON in this exact format:
{
  "action": "hide" | "flag" | "allow" | "uncertain",
  "reason": "brief explanation in Vietnamese",
  "confidence": 0.0 to 1.0
}`

    try {
      const result = await this.model.generateContent(prompt)
      const text = result.response.text().trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON in response")
      const parsed = JSON.parse(jsonMatch[0]) as ClassifyOutput
      return {
        action: parsed.action ?? "uncertain",
        reason: parsed.reason ?? "",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      }
    } catch (err) {
      console.error("[gemini:classify]", err)
      return { action: "uncertain", reason: "Không thể phân tích", confidence: 0 }
    }
  }

  async suggest(input: SuggestInput): Promise<SuggestOutput> {
    if (input.recentLogs.length === 0) return { suggestions: [] }

    const logsText = input.recentLogs
      .slice(0, 50)
      .map((l) => `- Title: "${l.title}", Channel: "${l.channelName || "?"}", Action: ${l.action}`)
      .join("\n")

    const existingText = input.existingRules.length
      ? input.existingRules.map((r) => `- ${r.type}: "${r.targetRaw}" → ${r.action}`).join("\n")
      : "(none)"

    const prompt = `You are a YouTube content filter assistant.

Recent filtered videos:
${logsText}

Existing rules (do NOT suggest duplicates):
${existingText}

Based on the patterns in the filtered videos, suggest new filter rules that would be useful.
Only suggest rules not already covered by existing rules.
Suggest at most 5 rules.

Respond ONLY with valid JSON in this exact format:
{
  "suggestions": [
    {
      "type": "keyword" | "channelName" | "channelId" | "videoId" | "regex",
      "targetRaw": "the rule target",
      "action": "hide" | "flag",
      "reason": "brief explanation in Vietnamese"
    }
  ]
}`

    try {
      const result = await this.model.generateContent(prompt)
      const text = result.response.text().trim()
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON in response")
      const parsed = JSON.parse(jsonMatch[0]) as SuggestOutput
      return { suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] }
    } catch {
      return { suggestions: [] }
    }
  }
}
