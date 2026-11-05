import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { config } from '../src/config.js'

export const TEST_DATABASE = 'analytics_test'

export async function setup() {
  const admin = new pg.Client({ connectionString: config.databaseUrl })
  await admin.connect()
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`)
  await admin.query(`CREATE DATABASE ${TEST_DATABASE}`)
  await admin.end()

  const url = new URL(config.databaseUrl)
  url.pathname = `/${TEST_DATABASE}`
  const test = new pg.Client({ connectionString: url.toString() })
  await test.connect()
  await test.query(await readFile(resolve(import.meta.dirname, '../db/schema.sql'), 'utf8'))
  await test.end()
}
