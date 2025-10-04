# Unified Plugin Architecture

Everything is a plugin. The vault is just a plugin that aggregates other plugins.

## Core Concept

```typescript
// Before: Two concepts (plugins and vault)
const plugin = definePlugin({...});
const vault = createVault({ plugins: [...], path: '...', databaseUrl: '...' });

// After: One concept (just plugins)
const vault = definePlugin({
  id: 'vault',
  dependencies: [usersPlugin, postsPlugin],
  tables: {},
  methods: (api) => ({})
});
```

## How It Works

### 1. Define Plugins

Each plugin defines its tables and methods:

```typescript
import { definePlugin, defineQuery, defineMutation } from '@epicenter/vault';
import { z } from 'zod';

const usersPlugin = definePlugin({
  id: 'users',

  tables: {
    users: {
      id: id(),
      name: text(),
      email: text(),
    }
  },

  methods: (api) => ({
    createUser: defineMutation({
      input: z.object({
        name: z.string().min(1),
        email: z.string().email()
      }),
      description: 'Create a new user with name and email',
      handler: async ({ name, email }) => {
        // api.users.users already has all table helpers injected!
        const { data, error } = await api.users.users.create({
          id: generateId(),
          name,
          email,
        });
        return data;
      }
    })
  })
});
```

### 2. Compose Plugins

The "vault" is just a plugin that lists others as dependencies:

```typescript
const vault = definePlugin({
  id: 'vault',
  dependencies: [usersPlugin, postsPlugin, commentsPlugin],
  tables: {}, // No tables of its own
  methods: (api) => ({
    // Optional: Add app-level orchestration methods
    // Or just return empty object
  })
});

// epicenter.config.ts
export default vault;
```

### 3. Runtime Injection

The Epicenter CLI provides the database and storage:

```typescript
// The CLI does this internally:
const app = await runPlugin(vault, {
  databaseUrl: './data/app.db',
  storagePath: './data'
});

// Now you have the full app with all plugins initialized
```

## API Shape

The namespace pattern is: `app.pluginId.tableName.method()`

```typescript
// Table helpers (auto-injected)
app.users.users.getById(id)       // Result<User | null, Error>
app.users.users.create(data)      // Result<User, Error>
app.posts.posts.update(id, data)  // Result<Post | null, Error>
app.posts.comments.delete(id)     // Result<boolean, Error>

// Plugin methods
app.users.createUser(name, email)
app.posts.createPost(authorId, title)

// Drizzle query builder
app.posts.posts
  .select()
  .where(eq(app.posts.posts.authorId, userId))
  .all()
```

## Key Benefits

### 1. **Single Concept**
No distinction between "vault" and "plugin". Everything is a plugin.

### 2. **Automatic Table Helpers**
Every table automatically gets:
- `getById()`, `findById()`, `get()`
- `create()`, `update()`, `delete()`, `upsert()`
- `getAll()`, `count()`
- `select()` (Drizzle query builder)

### 3. **Clean Dependencies**
Plugins declare dependencies and access them through the api parameter:

```typescript
const postsPlugin = definePlugin({
  dependencies: [usersPlugin],

  methods: (api) => ({
    createPost: defineMutation({
      input: z.object({
        authorId: z.string(),
        title: z.string().min(1)
      }),
      description: 'Create a new post for a user',
      handler: async ({ authorId, title }) => {
        // Access dependency's tables
        const { data: author } = await api.users.users.getById(authorId);
        if (!author) return null;

        // Access own tables
        return api.posts.posts.create({
          id: generateId(),
          title,
          authorId
        });
      }
    })
  })
});
```

### 4. **No Initialization Dance**
No more initialization waiting. The runtime handles everything.

### 5. **True Modularity**
Any plugin can be the root. You could have multiple "vaults" for different parts of your app.

## Migration from Old Architecture

### Before
```typescript
import { createVault } from '@vault/core';

const vault = createVault({
  path: './data',
  databaseUrl: './data.db',
  plugins: [usersPlugin, postsPlugin]
});

await app.ready;
```

### After
```typescript
import { definePlugin } from '@vault/core';
import { runPlugin } from '@vault/runtime';

const vault = definePlugin({
  id: 'vault',
  dependencies: [usersPlugin, postsPlugin],
  tables: {},
  methods: () => ({})
});

// Runtime injection (handled by CLI)
const app = await runPlugin(vault, {
  databaseUrl: './data.db',
  storagePath: './data'
});
```

## Complete Example

```typescript
// plugins/users.ts
export const usersPlugin = definePlugin({
  id: 'users',
  tables: {
    users: {
      id: id(),
      name: text(),
      email: text(),
    }
  },
  methods: (api) => ({
    createUser: defineMutation({
      input: z.object({
        name: z.string().min(1),
        email: z.string().email()
      }),
      description: 'Create a new user',
      handler: async ({ name, email }) => {
        const { data } = await api.users.users.create({
          id: generateId(),
          name,
          email,
        });
        return data;
      }
    })
  })
});

// plugins/posts.ts
export const postsPlugin = definePlugin({
  id: 'posts',
  dependencies: [usersPlugin],
  tables: {
    posts: {
      id: id(),
      title: text(),
      authorId: text(),
    }
  },
  methods: (api) => ({
    createPost: defineMutation({
      input: z.object({
        authorId: z.string(),
        title: z.string().min(1)
      }),
      description: 'Create a new post for a user',
      handler: async ({ authorId, title }) => {
        const { data: author } = await api.users.users.getById(authorId);
        if (!author) return null;

        const { data } = await api.posts.posts.create({
          id: generateId(),
          title,
          authorId,
        });
        return data;
      }
    })
  })
});

// epicenter.config.ts
export default definePlugin({
  id: 'app',
  dependencies: [usersPlugin, postsPlugin],
  tables: {},
  methods: () => ({})
});

// Usage (in your app)
const app = await runPlugin(config);

// Everything is available through clean namespaces
await app.users.createUser('Alice', 'alice@example.com');
await app.posts.createPost(userId, 'My Post');
const { data: users } = await app.users.users.getAll();
```

## Architecture Benefits

1. **Simplicity**: One concept (plugins) instead of two (plugins + vault)
2. **Composability**: Plugins can aggregate other plugins naturally
3. **Flexibility**: Runtime provides database/storage, not hardcoded in vault
4. **Type Safety**: Full TypeScript inference throughout
5. **Clean API**: Clear namespace pattern without surprises

The vault is dead. Long live plugins!