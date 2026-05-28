# @rific/expo-sync

A generic SQLite sync engine for Expo. Handles schema management, upsert/delete, and cursor-based sync state — so you can focus on fetching data, not wiring up tables.

Works with `expo-sqlite`'s `SQLiteDatabase` out of the box.

## Installation

```sh
npm install @rific/expo-sync
```

## Usage

```ts
import * as SQLite from 'expo-sqlite'
import { SyncEngine } from '@rific/expo-sync'

const db = await SQLite.openDatabaseAsync('my.db')

const sync = new SyncEngine(db)

sync.register({
  name: 'products',
  schema: {
    id: 'TEXT',
    name: 'TEXT',
    price: 'REAL',
    stock: 'INTEGER',
  },
  primaryKey: 'id',
})

// Creates _sync_state and all registered tables (safe to call on every launch)
await sync.init()
```

### Syncing records

```ts
// Fetch from your API, using the last cursor to get only new changes
const cursor = await sync.getCursor('products')
const { records, nextCursor } = await fetchProducts({ since: cursor })

for (const record of records) {
  if (record.deleted) {
    await sync.remove('products', record.id)
  } else {
    await sync.push('products', record)
  }
}

await sync.setCursor('products', nextCursor)
```

### Transforming records

Use `transform` to reshape API responses before they hit SQLite:

```ts
sync.register({
  name: 'orders',
  schema: {
    id: 'TEXT',
    customer_id: 'TEXT',
    total: 'REAL',
    placed_at: 'TEXT',
  },
  transform: (record: ApiOrder) => ({
    id: record.id,
    customer_id: record.customerId,
    total: record.total,
    placed_at: record.placedAt,
  }),
})
```

## API

### `new SyncEngine(db)`

Creates a sync engine. `db` must satisfy the `Database` interface (automatically satisfied by `expo-sqlite`'s `SQLiteDatabase`).

### `.register(config)`

Registers a channel (table). Returns `this` for chaining.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Table name in SQLite |
| `schema` | `Record<string, ColumnType>` | Column definitions |
| `primaryKey` | `string` | Primary key column. Defaults to `'id'` |
| `transform` | `(record: TRecord) => TRow \| Promise<TRow>` | Optional transform before write |

### `.init()`

Creates `_sync_state` and all registered tables if they don't exist. Safe to call on every app launch.

### `.push(name, record)`

Upserts a record into the named channel's table.

### `.remove(name, id)`

Deletes a record by primary key from the named channel's table.

### `.getCursor(name)`

Returns the last saved cursor for a channel, or `null` if none exists.

### `.setCursor(name, cursor)`

Saves a cursor for a channel along with a `syncedAt` timestamp.

## License

MIT
