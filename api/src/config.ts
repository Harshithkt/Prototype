import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: resolve(fileURLToPath(import.meta.url), '../../../.env') })

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://analytics:analytics@localhost:5433/analytics',
  readonlyDatabaseUrl:
    process.env.DATABASE_URL_READONLY ??
    'postgres://analytics_ro:analytics_ro@localhost:5433/analytics',
  writeKey: process.env.WRITE_KEY ?? 'demo_write_key',
  llm: {
    apiKey: process.env.NEBIUS_API_KEY?.trim() || undefined,
    baseUrl: process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1',
    model: process.env.NEBIUS_MODEL ?? 'openai/gpt-oss-120b',
  },
}

// The seeded project is pinned to fixed dates so every run produces the same
// data. The dashboard treats DATA_END as "today".
export const demo = {
  dataStart: '2026-08-29',
  dataEnd: '2026-10-27',
  shipDate: '2026-10-08', // day 41 of 60
  plans: ['free', 'pro', 'enterprise'],
  platforms: ['web', 'mobile'],
}
