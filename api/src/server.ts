import { buildApp } from './app.js'
import { config } from './config.js'
import { createPool } from './db.js'

const app = buildApp({
  db: createPool(config.databaseUrl),
  readonlyDb: createPool(config.readonlyDatabaseUrl),
  llm: config.llm.apiKey
    ? { apiKey: config.llm.apiKey, baseUrl: config.llm.baseUrl, model: config.llm.model }
    : undefined,
})

await app.listen({ port: config.port, host: '127.0.0.1' })
console.log(
  `API on http://localhost:${config.port} · assistant: ${
    config.llm.apiKey ? `live (${config.llm.model})` : 'scripted fallback'
  }`,
)
