# Plugin System - Enhanced Drizzle Tables with Runtime Injection

A unified plugin architecture that combines **Drizzle ORM** with **dual storage** (markdown files + SQLite database). Everything is a plugin - there's no special "vault" concept. The runtime injects database and storage dependencies when plugins are executed.

## 🎯 Core Philosophy

**Your tables ARE Drizzle tables** - just enhanced with dual-storage superpowers.

```typescript
// Plugin tables map directly to Drizzle
tables: {
  posts: {
    id: text({ primaryKey: true }),
    title: text(),
    content: text({ nullable: true })
  }
}

// Enhanced table with dual storage
await api.blog.posts.create({ id: '1', title: 'Hello' });  // → markdown + SQLite
const posts = await api.blog.posts.select().where(eq(api.blog.posts.published, true));  // → pure Drizzle
```

## ✨ Features

- 🎛️ **Enhanced Drizzle Tables** - True Drizzle tables with custom methods via Proxy
- 📝 **Dual storage** - Markdown files as source of truth, SQLite for performance  
- 🔍 **Pure Drizzle compatibility** - Full query builder, joins, and SQL power
- 🎯 **Type-safe dependencies** - Plugin system with dependency injection
- 🚀 **Built-in CRUD** - Enhanced methods for dual-storage operations
- 🔒 **NOT NULL by default** - Safe column definitions with explicit nullable option
- 🔄 **Native file watching** - Bun's fs.watch for real-time sync

## 🚀 Quick Start

### Installation

```bash
bun add @repo/vault
# or
npm install @repo/vault
```

### Basic Usage

```typescript
import { definePlugin, runPlugin, defineQuery, defineMutation, id, text, integer, boolean, date } from '@repo/vault';
import { eq, desc, gte } from 'drizzle-orm';
import { z } from 'zod';

// 1. Define your plugin
const blogPlugin = definePlugin({
  id: 'blog',

  tables: {
    posts: {
      id: id(),                         // Auto-generated ID
      title: text(),                    // NOT NULL by default
      content: text({ nullable: true }), // Explicitly nullable
      published: boolean({ default: false }),
      views: integer({ default: 0 }),
      createdAt: date({ nullable: true })
    }
  },

  methods: (api) => ({
    getPopularPosts: defineQuery({
      input: z.object({
        minViews: z.number().default(100)
      }),
      handler: async (input) => {
        return api.blog.posts.select()
          .where(gte(api.blog.posts.views, input.minViews))
          .orderBy(desc(api.blog.posts.views))
          .all();
      }
    }),

    createPost: defineMutation({
      input: z.object({
        title: z.string().min(1),
        content: z.string().optional(),
        published: z.boolean().default(false)
      }),
      handler: async (input) => {
        return api.blog.posts.create({
          title: input.title,
          content: input.content || null,
          published: input.published,
          views: 0,
          createdAt: new Date()
        });
      }
    })
  })
});

// 2. Create an app plugin that aggregates others (optional)
const app = definePlugin({
  id: 'app',
  dependencies: [blogPlugin],
  tables: {}, // No tables of its own
  methods: () => ({}) // No methods needed
});

// 3. Run the plugin with runtime injection
const runtime = await runPlugin(app, {
  databaseUrl: './my-app.db',    // SQLite database
  storagePath: './my-vault'       // Markdown storage directory
});

// 4. Use enhanced table helpers
const { data: post } = await runtime.blog.posts.create({
  id: 'first-post',
  title: 'Welcome!',
  content: 'This gets saved to both markdown and SQLite!',
  published: true,
  views: 0,
  createdAt: new Date()
});

// 5. Query with pure Drizzle
const publishedPosts = await runtime.blog.posts.select()
  .where(eq(runtime.blog.posts.published, true))
  .orderBy(desc(runtime.blog.posts.createdAt))
  .limit(10);

// 6. Use plugin methods with validation
const popular = await runtime.blog.getPopularPosts({ minViews: 50 });

// 7. Create posts with validated input
const newPost = await runtime.blog.createPost({
  title: 'My Second Post',
  content: 'Content here...',
  published: false
});
```

## 📖 API Reference

### Enhanced Table Methods

Each `api.pluginId.tableName` provides these enhanced methods:

#### `create(data)` → `Promise<Record>`

Creates a new record in both markdown and SQLite storage.

```typescript
const post = await api.blog.posts.create({
  id: 'first-post',
  title: 'Welcome to Vault',
  content: 'This gets saved to both markdown and SQLite!',
  published: true,
  views: 0,
  createdAt: new Date()
});
```

#### `findById(id)` → `Promise<Record | null>`

Fast lookup from SQLite by primary key.

```typescript
const post = await api.blog.posts.findById('first-post');
if (post) {
  console.log(`Title: ${post.title}`);
}
```

#### `update(id, data)` → `Promise<Record | null>`

Updates both markdown and SQLite storage.

```typescript
const updated = await api.blog.posts.update('first-post', {
  published: true,
  views: 100
});
```

#### `delete(id)` → `Promise<boolean>`

Removes from both markdown and SQLite storage.

```typescript
const success = await api.blog.posts.delete('first-post');
console.log(success ? 'Deleted' : 'Not found');
```

#### `select()` → `Drizzle Query Builder`

Returns Drizzle's query builder for complex queries.

```typescript
const publishedPosts = await api.blog.posts.select()
  .where(eq(api.blog.posts.published, true))
  .orderBy(desc(api.blog.posts.createdAt))
  .limit(10);
```

### Full Drizzle Compatibility

Enhanced tables work everywhere Drizzle tables are expected:

```typescript
// Complex joins
const postsWithComments = await api.db.select({
  post: api.blog.posts,
  comment: api.comments.comments
}).from(api.blog.posts)
  .join(api.comments.comments, eq(api.blog.posts.id, api.comments.comments.postId))
  .where(eq(api.blog.posts.published, true));

// Raw database access for arbitrary SQL
await api.db.execute(sql`
  UPDATE posts
  SET featured = true
  WHERE views > 1000 AND created_at > date('now', '-7 days')
`);
```

## 🏗️ Column Types

Vault provides NOT NULL by default column helpers that map directly to Drizzle:

```typescript
import { text, integer, real, boolean, date, json, blob } from '@repo/vault';

tables: {
  posts: {
    id: text({ primaryKey: true }),
    title: text(),                    // NOT NULL (default)
    slug: text({ unique: true }),     // NOT NULL + UNIQUE
    content: text({ nullable: true }), // Explicitly nullable
    views: integer({ default: 0 }),   // NOT NULL with default
    price: real({ nullable: true }),  // Nullable decimal
    published: boolean({ default: false }), // NOT NULL boolean
    publishedAt: date({ nullable: true }),  // Nullable timestamp
    metadata: json<{ tags: string[] }>({ default: () => ({ tags: [] }) }), // NOT NULL JSON
    thumbnail: blob({ nullable: true }) // Nullable binary data
  }
}
```

### Column Options

All column types support these options:

- `primaryKey: boolean` - Make this the primary key
- `nullable: boolean` - Allow NULL values (default: false)
- `unique: boolean` - Add UNIQUE constraint
- `default: T | (() => T)` - Default value or function

### Plugin Dependencies

Plugins can depend on other plugins using type-safe references:

```typescript
import { z } from 'zod';
import { defineQuery } from '@repo/vault';

const blogPlugin = definePlugin({ /* ... */ });

const analyticsPlugin = definePlugin({
  id: 'analytics',
  dependencies: [blogPlugin], // Actual plugin object, not string!
  
  tables: {
    stats: {
      id: id(),
      postId: text('post_id'),
      views: integer('views'),
      date: timestamp('date')
    }
  },
  
  methods: (api) => ({
    calculateTopPosts: defineQuery({
      input: z.object({
        limit: z.number().optional().default(10)
      }),
      handler: async (input) => {
        // Access dependent plugin methods (fully typed!)
        const posts = await api.blog.getPublishedPosts({ minViews: 0 });

        // Access dependent plugin tables
        const allPosts = await api.posts.getAll();

        // Use your own tables
        const stats = await api.stats.select()
          .groupBy(api.stats.postId)
          .limit(input.limit);

        return combineData(posts, stats);
      }
    })
  })
});
```

### Plugin Methods with Input Validation

Vault supports two types of plugin methods with automatic input validation using Standard Schema:

#### Query Methods

For read operations that don't modify state:

```typescript
import { z } from 'zod';
import { defineQuery } from '@repo/vault';

const blogPlugin = definePlugin({
  id: 'blog',
  tables: { /* ... */ },
  methods: (api) => ({
    getPostsByAuthor: defineQuery({
      input: z.object({
        authorId: z.string(),
        limit: z.number().optional().default(10)
      }),
      handler: async (input) => {
        // input is automatically validated and typed
        return api.blog.posts
          .select()
          .where(eq(api.blog.posts.authorId, input.authorId))
          .limit(input.limit)
          .all();
      },
      description: 'Get posts by author with optional limit'
    }),
  })
});
```

#### Mutation Methods

For operations that modify state:

```typescript
import { defineMutation } from '@repo/vault';

const blogPlugin = definePlugin({
  id: 'blog',
  tables: { /* ... */ },
  methods: (api) => ({
    createPost: defineMutation({
      input: z.object({
        title: z.string().min(1),
        content: z.string(),
        authorId: z.string()
      }),
      handler: async (input) => {
        // Input is validated and fully typed
        return api.blog.posts.create({
          id: generateId(),
          title: input.title,
          content: input.content,
          authorId: input.authorId,
          publishedAt: null
        });
      },
      description: 'Create a new blog post'
    }),
  })
});
```

#### Standard Schema Support

Methods support any validation library that implements the [Standard Schema](https://github.com/standard-schema/standard-schema) specification:

- **Zod**: `z.object({ name: z.string() })`
- **Valibot**: `v.object({ name: v.string() })`
- **ArkType**: `type({ name: 'string' })`
- **Yup**: `yup.object({ name: yup.string() })`

#### Method Properties

Each method has additional properties for introspection:

```typescript
// Check method type
console.log(runtime.blog.createPost.type); // 'mutation'
console.log(runtime.blog.getPostsByAuthor.type); // 'query'

// Access input schema
console.log(runtime.blog.createPost.input); // The Zod schema

// Access handler function
console.log(runtime.blog.createPost.handler); // The handler function
```

### The Magic: `.select()` Returns Drizzle

The `.select()` method on any table returns the full Drizzle query builder:

```typescript
// Simple query
api.posts.select().where(eq(posts.author, 'john'))

// Is exactly equivalent to:
db.select().from(posts).where(eq(posts.author, 'john'))

// Complex aggregations work too!
const stats = await api.posts.select({
  author: api.posts.author,
  totalPosts: count(),
  avgViews: avg(api.posts.views),
  maxViews: max(api.posts.views)
})
  .groupBy(api.posts.author)
  .having(gt(count(), 5))
  .orderBy(desc(avg(api.posts.views)));
```

## Dual Storage System

### Markdown as Source of Truth

- All data is stored in markdown files
- Human-readable and git-friendly
- Prevents data loss
- Easy to edit manually

### SQLite for Performance

- Fast queries and aggregations
- Full SQL power via Drizzle
- Automatically synced from markdown
- Can be rebuilt anytime with `sync()`

### Write Operations

All write operations update both layers:

```typescript
const result = await api.posts.create({ ... });

console.log(result.status.markdown); // { success: true }
console.log(result.status.sqlite);   // { success: true }

// If SQLite fails, markdown still succeeds (no data loss)
if (!result.status.sqlite.success) {
  await api.posts.sync(); // Rebuild SQLite from markdown
}
```

## File Watching (Bun Native)

Start automatic file watching to sync markdown changes to SQLite:

```typescript
// Start watching for changes
await api.serve();

// Changes to markdown files are automatically synced
// Stop watching when done
api.stop();
```

Uses Bun's native `fs.watch` for better performance compared to external watchers.

## Advanced Usage

### Working with Columns

```typescript
const table = {
  // Column names are passed as the first argument
  userId: text('user_id').primaryKey(),
  firstName: text('first_name'),
  lastName: text('last_name', true),      // Nullable
  createdAt: timestampNow('created_at'),  // Auto-set timestamp
  metadata: json<UserMeta>('metadata')    // Typed JSON
};
```

### Batch Operations

```typescript
// All CRUD methods support arrays
await api.posts.create([
  { id: '1', title: 'Post 1', ... },
  { id: '2', title: 'Post 2', ... },
  { id: '3', title: 'Post 3', ... }
]);

await api.posts.update([
  { id: '1', views: 100 },
  { id: '2', views: 200 }
]);

await api.posts.delete(['1', '2', '3']);
```


### Direct Drizzle Access

For complex operations, you have full Drizzle access:

```typescript
import { sql } from 'drizzle-orm';

// Raw SQL
const results = await api.posts.select()
  .where(sql`${api.posts.title} LIKE '%typescript%'`);

// Transactions (coming soon)
// await api.transaction(async (tx) => {
//   await tx.posts.create({ ... });
//   await tx.comments.create({ ... });
// });
```

## API Reference

### Core Functions

#### `definePlugin(config)`

Create a plugin with tables and methods.

#### `runPlugin(plugin, config)`

Run a plugin with runtime injection of database and storage.

### Method Helpers

#### `defineQuery(config)`

Create a query method with input validation and type safety.

```typescript
defineQuery({
  input: z.object({ id: z.string() }),
  handler: async (input) => { /* ... */ },
  description?: 'Optional description'
})
```

#### `defineMutation(config)`

Create a mutation method with input validation and type safety.

```typescript
defineMutation({
  input: z.object({ title: z.string() }),
  handler: async (input) => { /* ... */ },
  description?: 'Optional description'
})
```

#### `isQuery(method)` / `isMutation(method)`

Type guards to check if a method is a query or mutation.

```typescript
if (isQuery(someMethod)) {
  // method is typed as QueryMethod
}
```

### Column Helpers

- `text(name, nullable?)` - Text column (NOT NULL by default)
- `integer(name, nullable?)` - Integer column
- `real(name, nullable?)` - Real/float column
- `numeric(name, nullable?)` - Numeric/decimal column
- `boolean(name, nullable?)` - Boolean column (0/1)
- `timestamp(name, nullable?)` - Timestamp column
- `timestampNow(name)` - Timestamp with CURRENT_TIMESTAMP
- `json<T>(name, nullable?)` - JSON column with optional typing
- `blob(name, mode?, nullable?)` - Binary data column
- `id(name?)` - Auto-incrementing primary key

### Built-in Table Methods

- `get(id | ids[])` - Get by ID(s)
- `getAll()` - Get all records
- `count()` - Count records
- `select()` - Drizzle query builder
- `create(data | data[])` - Create record(s)
- `update(data | data[])` - Update record(s)
- `delete(id | ids[])` - Delete record(s)
- `upsert(data | data[])` - Create or update
- `getFromDisk(id)` - Read from markdown
- `getAllFromDisk()` - Read all from markdown
- `sync()` - Rebuild SQLite from markdown

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup and guidelines.

## License

MIT