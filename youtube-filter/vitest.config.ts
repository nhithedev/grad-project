import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^~(.*)$/,
        replacement: path.resolve(__dirname, "$1")
      }
    ]
  },
  test: {
    globals: true
  }
})
