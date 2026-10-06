import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

type Value = string | number | bigint | Uint8Array | null
type Row = Record<string, Value>
interface Statement { all(...values: Value[]): Row[]; get(...values: Value[]): Row | undefined; run(...values: Value[]): { changes: number | bigint }; columns(): { name: string }[] }
interface SQLite { prepare(sql: string): Statement; exec(sql: string): void; close(): void }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SQLite }

/** Real in-memory SQLite with the small D1 surface used by Drizzle/routes. */
export function testDatabase(lastMigration = 7) {
  const sqlite = new DatabaseSync(':memory:')
  const directory = resolve('drizzle')
  for (const name of readdirSync(directory).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    if (Number(name.slice(0, 4)) <= lastMigration) sqlite.exec(readFileSync(resolve(directory, name), 'utf8'))
  }
  sqlite.exec('PRAGMA foreign_keys = ON')
  class Prepared {
    constructor(readonly query: string, readonly values: Value[] = []) {}
    bind(...values: Value[]) { return new Prepared(this.query, values) }
    async all() {
      const statement = sqlite.prepare(this.query)
      const results = statement.all(...this.values)
      const changes = Number(sqlite.prepare('select changes() as changes').get()?.changes ?? 0)
      return { results, success: true, meta: { changes, duration: 0, last_row_id: 0, size_after: 0, rows_read: results.length, rows_written: changes } }
    }
    async raw() {
      const statement = sqlite.prepare(this.query)
      const rows = statement.all(...this.values)
      const columns = statement.columns().map((column) => column.name)
      return rows.map((row) => columns.map((column) => row[column]))
    }
    async run() { return this.all() }
    async first(column?: string) { const row = sqlite.prepare(this.query).get(...this.values); return row ? (column ? row[column] : row) : null }
  }
  const db = {
    prepare(query: string) { return new Prepared(query) },
    async batch(statements: Prepared[]) {
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
    async exec(query: string) { sqlite.exec(query); return { count: 1, duration: 0 } },
  } as unknown as D1Database
  return { db, sqlite }
}
