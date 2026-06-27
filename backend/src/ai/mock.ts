import type { AiProvider, ClassifyInput, ClassifyOutput, SuggestInput, SuggestOutput } from "./provider"

const MOCK_SCENARIOS: Array<{ keywords: string[]; output: ClassifyOutput }> = [
  {
    keywords: ["gaming", "game", "gameplay", "minecraft", "fortnite"],
    output: { action: "hide", reason: "[MOCK] Phát hiện nội dung gaming", confidence: 0.92 },
  },
  {
    keywords: ["tin tức", "news", "chính trị", "politics"],
    output: { action: "flag", reason: "[MOCK] Nội dung tin tức cần xem xét", confidence: 0.75 },
  },
  {
    keywords: ["hướng dẫn", "tutorial", "review"],
    output: { action: "uncertain", reason: "[MOCK] Không chắc chắn về nội dung này", confidence: 0.45 },
  },
]

export class MockProvider implements AiProvider {
  async classify(input: ClassifyInput): Promise<ClassifyOutput> {
    console.log("[mock:classify]", input.videoId, input.title)
    const titleLower = input.title.toLowerCase()
    for (const scenario of MOCK_SCENARIOS) {
      if (scenario.keywords.some((kw) => titleLower.includes(kw))) {
        return scenario.output
      }
    }
    return { action: "allow", reason: "[MOCK] Không phát hiện nội dung cần lọc", confidence: 0.9 }
  }

  async suggest(input: SuggestInput): Promise<SuggestOutput> {
    console.log("[mock:suggest] logs:", input.recentLogs.length)
    return {
      suggestions: [
        { type: "keyword", targetRaw: "mock-keyword", action: "hide", reason: "[MOCK] Đề xuất giả để test UI" },
        { type: "channelName", targetRaw: "MockChannel", action: "flag", reason: "[MOCK] Kênh hay xuất hiện trong logs" },
      ],
    }
  }
}
