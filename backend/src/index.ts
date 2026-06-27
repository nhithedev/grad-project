import "dotenv/config"
import express from "express"
import cors from "cors"
import classifyRouter from "./routes/classify"
import suggestRouter from "./routes/suggest"

const app = express()
const PORT = process.env.PORT ?? 3001
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? "*"

app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

app.use("/ai/classify", classifyRouter)
app.use("/ai/suggest", suggestRouter)

app.listen(PORT, () => {
  console.log(`[backend] running on http://localhost:${PORT}`)
  if (process.env.MOCK_AI === "true") {
    console.log("[backend] ⚠️  MOCK_AI=true — không gọi Gemini, trả dữ liệu giả")
  } else {
    console.log(`[backend] AI provider: ${process.env.AI_PROVIDER ?? "gemini"}`)
  }
})
