import { SyncEngine } from '../SyncEngine'
import type { Database } from '../types'

function createDb(): jest.Mocked<Database> {
  return {
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest.fn().mockResolvedValue(null)
  }
}

// ─── register ────────────────────────────────────────────────────────────────

describe('register', () => {
  it('returns this for chaining', () => {
    const engine = new SyncEngine(createDb())
    expect(engine.register({ name: 'logs', schema: { id: 'TEXT' } })).toBe(engine)
  })

  it('supports chaining multiple channels', () => {
    const engine = new SyncEngine(createDb())
    expect(
      engine
        .register({ name: 'logs', schema: { id: 'TEXT' } })
        .register({ name: 'flags', schema: { id: 'TEXT' } })
    ).toBe(engine)
  })
})

// ─── init ─────────────────────────────────────────────────────────────────────

describe('init', () => {
  it('creates _sync_state table', async () => {
    const db = createDb()
    await new SyncEngine(db).init()
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS _sync_state'))
  })

  it('creates a table per registered channel', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'logs', schema: { id: 'TEXT', level: 'INTEGER' } })
    engine.register({ name: 'flags', schema: { id: 'TEXT', logId: 'TEXT' } })
    await engine.init()
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS logs'))
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS flags'))
  })

  it('marks default primary key column correctly', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'logs', schema: { id: 'TEXT', message: 'TEXT' } })
    await engine.init()
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('id TEXT PRIMARY KEY'))
  })

  it('marks custom primaryKey column correctly', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'items', schema: { itemId: 'TEXT', name: 'TEXT' }, primaryKey: 'itemId' })
    await engine.init()
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('itemId TEXT PRIMARY KEY'))
  })
})

// ─── push ─────────────────────────────────────────────────────────────────────

describe('push', () => {
  it('upserts record when no transform configured', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'flags', schema: { id: 'TEXT', logId: 'TEXT' } })
    await engine.push('flags', { id: 'flag-1', logId: 'log-1' })
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO flags'),
      expect.arrayContaining(['flag-1', 'log-1'])
    )
  })

  it('runs transform before upsert', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    const transform = jest.fn().mockResolvedValue({ id: '1', level: 2, message: 'hello' })
    engine.register({ name: 'logs', schema: { id: 'TEXT', level: 'INTEGER', message: 'TEXT' }, transform })
    await engine.push('logs', { id: '1', encrypted: 'opaque-blob' })
    expect(transform).toHaveBeenCalledWith({ id: '1', encrypted: 'opaque-blob' })
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO logs'),
      expect.arrayContaining(['1', 2, 'hello'])
    )
  })

  it('supports async transform', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    const transform = jest.fn().mockResolvedValue({ id: 'x', message: 'decrypted' })
    engine.register({ name: 'logs', schema: { id: 'TEXT', message: 'TEXT' }, transform })
    await engine.push('logs', { id: 'x', encrypted: 'blob' })
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO logs'), expect.arrayContaining(['x', 'decrypted']))
  })

  it('throws for unknown channel', async () => {
    await expect(new SyncEngine(createDb()).push('nope', {})).rejects.toThrow('Unknown channel: "nope"')
  })
})

// ─── remove ───────────────────────────────────────────────────────────────────

describe('remove', () => {
  it('deletes by default primary key', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'flags', schema: { id: 'TEXT', logId: 'TEXT' } })
    await engine.remove('flags', 'flag-1')
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM flags WHERE id = ?', ['flag-1'])
  })

  it('deletes by custom primary key', async () => {
    const db = createDb()
    const engine = new SyncEngine(db)
    engine.register({ name: 'items', schema: { itemId: 'TEXT', name: 'TEXT' }, primaryKey: 'itemId' })
    await engine.remove('items', 'item-1')
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM items WHERE itemId = ?', ['item-1'])
  })

  it('throws for unknown channel', async () => {
    await expect(new SyncEngine(createDb()).remove('nope', 'id-1')).rejects.toThrow('Unknown channel: "nope"')
  })
})

// ─── getCursor ────────────────────────────────────────────────────────────────

describe('getCursor', () => {
  it('returns null when no cursor stored', async () => {
    expect(await new SyncEngine(createDb()).getCursor('logs')).toBeNull()
  })

  it('returns the stored cursor value', async () => {
    const db = createDb()
    db.getFirstAsync.mockResolvedValueOnce({ cursor: 'cursor-abc' })
    expect(await new SyncEngine(db).getCursor('logs')).toBe('cursor-abc')
  })

  it('returns null when cursor column is null', async () => {
    const db = createDb()
    db.getFirstAsync.mockResolvedValueOnce({ cursor: null })
    expect(await new SyncEngine(db).getCursor('logs')).toBeNull()
  })

  it('queries _sync_state with the correct channel name', async () => {
    const db = createDb()
    await new SyncEngine(db).getCursor('flags')
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('_sync_state'), ['flags'])
  })
})

// ─── setCursor ────────────────────────────────────────────────────────────────

describe('setCursor', () => {
  it('upserts the cursor into _sync_state', async () => {
    const db = createDb()
    await new SyncEngine(db).setCursor('logs', 'cursor-xyz')
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO _sync_state'),
      expect.arrayContaining(['logs', 'cursor-xyz'])
    )
  })

  it('includes syncedAt timestamp', async () => {
    const db = createDb()
    await new SyncEngine(db).setCursor('logs', 'c')
    const params = (db.runAsync.mock.calls[0] as any[])[1] as string[]
    expect(params[2]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
