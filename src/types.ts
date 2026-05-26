export type SQLiteValue = string | number | null

export type ColumnType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'

/** Minimal database interface — satisfied by expo-sqlite's SQLiteDatabase out of the box. */
export interface Database {
  execAsync(source: string): Promise<void>
  runAsync(source: string, params: SQLiteValue[]): Promise<unknown>
  getFirstAsync<T>(source: string, params: SQLiteValue[]): Promise<T | null>
}

export interface ChannelConfig<TRecord = unknown, TRow extends Record<string, SQLiteValue> = Record<string, SQLiteValue>> {
  /** Table name in SQLite. */
  name: string
  /** Column definitions: key = column name, value = SQLite type. */
  schema: Record<string, ColumnType>
  /** Column used as the primary key. Defaults to 'id'. */
  primaryKey?: string
  /** Optional transform applied to each record before it is written to SQLite. */
  transform?: (record: TRecord) => TRow | Promise<TRow>
}
