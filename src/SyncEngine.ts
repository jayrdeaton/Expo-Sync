import { ChannelConfig, Database, SQLiteValue } from './types'

type AnyChannel = ChannelConfig<unknown, Record<string, SQLiteValue>>

export class SyncEngine {
  private readonly db: Database
  private readonly channels = new Map<string, AnyChannel>()

  constructor(db: Database) {
    this.db = db
  }

  register<TRecord, TRow extends Record<string, SQLiteValue>>(config: ChannelConfig<TRecord, TRow>): this {
    this.channels.set(config.name, config as AnyChannel)
    return this
  }

  async init(): Promise<void> {
    await this.db.execAsync(`CREATE TABLE IF NOT EXISTS _sync_state (channel TEXT PRIMARY KEY, cursor TEXT, syncedAt TEXT)`)
    for (const [, channel] of this.channels) {
      const pk = channel.primaryKey ?? 'id'
      const cols = Object.entries(channel.schema)
        .map(([col, type]) => `${col} ${type}${col === pk ? ' PRIMARY KEY' : ''}`)
        .join(', ')
      await this.db.execAsync(`CREATE TABLE IF NOT EXISTS ${channel.name} (${cols})`)
    }
  }

  async push<TRecord>(name: string, record: TRecord): Promise<void> {
    const channel = this.requireChannel(name)
    const row = channel.transform ? await channel.transform(record as unknown) : (record as Record<string, SQLiteValue>)
    const cols = Object.keys(row)
    const values = cols.map((k) => row[k])
    await this.db.runAsync(`INSERT OR REPLACE INTO ${name} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, values)
  }

  async remove(name: string, id: SQLiteValue): Promise<void> {
    const channel = this.requireChannel(name)
    const pk = channel.primaryKey ?? 'id'
    await this.db.runAsync(`DELETE FROM ${name} WHERE ${pk} = ?`, [id])
  }

  async getCursor(name: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ cursor: string | null }>(`SELECT cursor FROM _sync_state WHERE channel = ?`, [name])
    return row?.cursor ?? null
  }

  async setCursor(name: string, cursor: string): Promise<void> {
    await this.db.runAsync(`INSERT OR REPLACE INTO _sync_state (channel, cursor, syncedAt) VALUES (?, ?, ?)`, [name, cursor, new Date().toISOString()])
  }

  private requireChannel(name: string): AnyChannel {
    const channel = this.channels.get(name)
    if (!channel) throw new Error(`[expo-sync] Unknown channel: "${name}"`)
    return channel
  }
}
