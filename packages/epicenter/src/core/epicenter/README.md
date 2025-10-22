# Epicenter

Epicenter is a composition layer that brings multiple workspaces together into a unified application. While workspaces define individual domains with their own data and actions, Epicenter provides a single client interface to access all workspace actions.

## What is Epicenter?

Epicenter is a collection of workspaces that work together. It provides:

- **Unified client interface**: Access all workspace actions through a single typed client
- **Flat dependency resolution**: All transitive workspace dependencies must be declared at the root level
- **Type-safe composition**: Full TypeScript inference for all workspace actions
- **Lifecycle management**: Single destroy() call cleans up all workspaces

## Epicenter vs Workspace

### Workspace
A workspace is a self-contained domain module:
- Defines its own schema (tables)
- Defines its own indexes (SQLite, markdown, vector, etc.)
- Defines its own actions (queries and mutations)
- Can depend on other workspaces

### Epicenter
An epicenter is a composition of workspaces:
- No schema, indexes, or actions of its own
- Simply aggregates multiple workspaces
- Provides a unified client interface
- Manages workspace initialization and cleanup

Think of it this way:
- **Workspace**: A module (like a library)
- **Epicenter**: An application (composed of modules)

## Usage Example

```typescript
// Define individual workspaces
const pagesWorkspace = defineWorkspace({
  id: 'pages',
  name: 'pages',
  schema: { /* ... */ },
  indexes: ({ db }) => ({ /* ... */ }),
  actions: ({ db, indexes }) => ({
    createPage: defineMutation({ /* ... */ }),
    getPages: defineQuery({ /* ... */ }),
  }),
});

const authWorkspace = defineWorkspace({
  id: 'auth',
  name: 'auth',
  schema: { /* ... */ },
  indexes: ({ db }) => ({ /* ... */ }),
  actions: ({ db, indexes }) => ({
    login: defineMutation({ /* ... */ }),
    logout: defineMutation({ /* ... */ }),
  }),
});

// Compose them into an epicenter
const myApp = defineEpicenter({
  id: 'my-app',
  workspaces: [pagesWorkspace, authWorkspace],
});

// Create a unified client
const client = await createEpicenterClient(myApp);

// Access workspace actions by workspace name
await client.auth.login({ email: '...', password: '...' });
const { data: pages } = await client.pages.getPages();

// Cleanup when done
client.destroy();
```

## Flat Dependency Resolution

Epicenter uses a flat/hoisted dependency model (like VS Code extensions or pnpm):

```typescript
// If workspace A depends on B, and B depends on C,
// then Epicenter's workspaces array must include ALL THREE:
const epicenter = defineEpicenter({
  id: 'my-app',
  workspaces: [workspaceA, workspaceB, workspaceC], // Flat list
});
```

This model:
- Makes all dependencies explicit and auditable
- Prevents "dependency hell" with deeply nested trees
- Allows version resolution (highest version wins)
- Ensures deterministic initialization order (topological sort)

If you forget to include a transitive dependency, you'll get a clear error at runtime:
```
Missing dependency: workspace "A" depends on "C",
but it was not found in workspaces array.

Fix: Add "C" to workspaces array (flat/hoisted resolution).
```

## Type Safety

Epicenter provides full TypeScript inference:

```typescript
const epicenter = defineEpicenter({
  id: 'my-app',
  workspaces: [pages, auth],
});

const client = await createEpicenterClient(epicenter);

// TypeScript knows about all workspace actions:
client.pages.createPage // ✓ Type-safe
client.pages.getPages   // ✓ Type-safe
client.auth.login       // ✓ Type-safe
client.auth.logout      // ✓ Type-safe
client.invalid.action   // ✗ Compile error
```

The client type is inferred from the workspace configs, so you get full autocomplete and type checking.

## Epicenter vs createWorkspaceClient

Both `createEpicenterClient` and `createWorkspaceClient` use the same initialization logic under the hood (`initializeWorkspaces`), which returns an object of all initialized workspace clients:

```typescript
// What happens internally for BOTH functions:
const allClients = initializeWorkspaces([A, B, C]);
// => { workspaceA: clientA, workspaceB: clientB, workspaceC: clientC }
```

All workspaces are initialized in both cases. **The only difference is what they return.**

- **createEpicenterClient**: Returns the entire object of workspace clients
  ```typescript
  const client = await createEpicenterClient({ workspaces: [A, B, C] });
  // Returns: { workspaceA: clientA, workspaceB: clientB, workspaceC: clientC }
  client.workspaceA.doSomething(); // ✓ All workspaces accessible
  client.workspaceB.doSomething(); // ✓
  client.workspaceC.doSomething(); // ✓
  ```

- **createWorkspaceClient**: Returns only the specified workspace client from the object
  ```typescript
  const client = await createWorkspaceClient(workspaceC); // C depends on A, B
  // Returns: clientC (accessed from the full object)
  client.doSomething(); // ✓ Only C's actions available
  client.workspaceA; // undefined - other workspaces not exposed on return value
  ```

In other words, **createWorkspaceClient** returns a subset of **createEpicenterClient**.

## Architecture

```
┌─────────────────────────────────────────┐
│           Epicenter Client              │
│  (Unified interface to all workspaces)  │
└─────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
        ▼           ▼           ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Workspace A │ │ Workspace B │ │ Workspace C │
│             │ │             │ │             │
│ • Schema    │ │ • Schema    │ │ • Schema    │
│ • Indexes   │ │ • Indexes   │ │ • Indexes   │
│ • Actions   │ │ • Actions   │ │ • Actions   │
└─────────────┘ └─────────────┘ └─────────────┘
```

Each workspace maintains its own:
- YJS document (collaborative data)
- Database abstraction (tables API)
- Indexes (synchronized snapshots)
- Actions (business logic)

Epicenter orchestrates initialization and provides a unified interface.

## Implementation Details

### config.ts
Defines `EpicenterConfig` type and `defineEpicenter` function with validation:
- Validates epicenter ID is a non-empty string
- Validates workspaces is a non-empty array
- Checks for duplicate workspace names (throws error)
- Checks for duplicate workspace IDs (throws error)

### client.ts
Defines `EpicenterClient` type and `createEpicenterClient` function:
- Uses `initializeWorkspaces` from workspace/client for initialization
- Implements flat/hoisted dependency resolution
- Provides destroy() method that cleans up all workspaces
- Maps workspace names to their action clients

### index.ts
Central export point that re-exports from config.ts and client.ts.
