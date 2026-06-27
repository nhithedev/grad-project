import { Router } from "express"
import type { Request, Response } from "express"
import { GeminiProvider } from "../ai/gemini"
import { MockProvider } from "../ai/mock"
import type { SuggestInput } from "../ai/provider"

const router = Router()
const provider = process.env.MOCK_AI === "true" ? new MockProvider() : new GeminiProvider()

router.post("/", async (req: Request, res: Response) => {
  try {
    const input = req.body as SuggestInput
    if (!Array.isArray(input.recentLogs) || !Array.isArray(input.existingRules)) {
      res.status(400).json({ error: "recentLogs and existingRules arrays are required" })
      return
    }
    const result = await provider.suggest(input)
    res.json(result)
  } catch (err) {
    console.error("[suggest]", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
