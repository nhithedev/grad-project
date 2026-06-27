import { Router } from "express"
import type { Request, Response } from "express"
import { GeminiProvider } from "../ai/gemini"
import { MockProvider } from "../ai/mock"
import type { ClassifyInput } from "../ai/provider"

const router = Router()
const provider = process.env.MOCK_AI === "true" ? new MockProvider() : new GeminiProvider()

router.post("/", async (req: Request, res: Response) => {
  try {
    const input = req.body as ClassifyInput
    if (!input.videoId || !input.title) {
      res.status(400).json({ error: "videoId and title are required" })
      return
    }
    const result = await provider.classify(input)
    res.json(result)
  } catch (err) {
    console.error("[classify]", err)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
