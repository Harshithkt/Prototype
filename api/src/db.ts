import pg from 'pg'

// bigint and numeric arrive as strings by default; counts here always fit a double.
pg.types.setTypeParser(20, Number)
pg.types.setTypeParser(1700, Number)
// Keep DATE as 'YYYY-MM-DD'. The default parser builds a local-midnight Date,
// which shifts the day for anyone not on UTC.
pg.types.setTypeParser(1082, (value) => value)

export type Db = pg.Pool | pg.PoolClient

export function createPool(connectionString: string) {
  return new pg.Pool({ connectionString, options: '-c timezone=UTC' })
}
