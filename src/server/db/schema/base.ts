import { sql } from 'drizzle-orm'
import { integer, text } from 'drizzle-orm/sqlite-core'

const nowInMilliseconds = sql`(cast(strftime('%s', 'now') as integer) * 1000)`

export function idColumn() {
  return text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
}

export function createdAtColumn() {
  return integer('created_at', { mode: 'timestamp_ms' }).notNull().default(nowInMilliseconds)
}

export function updatedAtColumn() {
  return integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(nowInMilliseconds)
    .$onUpdateFn(() => new Date())
}
