# Workspace

A workspace is a self-contained domain module with its own schema, providers, and exports. Workspaces are composed into an Epicenter to create your application.

## What is a Workspace?

When you create an Epicenter client, each workspace becomes a property on that client:

```typescript
const blogWorkspace = defineWorkspace({ id: 'blog', ... });
const authWorkspace = defineWorkspace({ id: 'auth', ... });

const epicenter = await createClient([blogWorkspace, authWorkspace]);

// Each workspace is accessible by its ID:
epicenter.blog.createPost(...)  // blogWorkspace actions
epicenter.auth.login(...)       // authWorkspace actions
```

Each workspace has:

- **Tables**: Define your data structure with typed columns
- **Providers**: Unified map of capabilities including persistence, sync, and materializers (SQLite, markdown, vector, etc.)
- **Exports**: Business logic (queries and mutations) with access to tables and providers

## Workspace Clients

A **workspace client** is not a standalone concept. It's a single workspace extracted from an **Epicenter client**.

```typescript
// An Epicenter client is an object of workspace clients:
type EpicenterClient = {
	[workspaceId: string]: WorkspaceClient;
};

// createClient(workspaces) returns the full object:
const epicenter = await createClient([A, B, C]);
// => { workspaceA: clientA, workspaceB: clientB, workspaceC: clientC }

// createClient(workspace) returns one workspace from that object:
const client = await createClient(workspaceC);
// => clientC (equivalent to epicenter.workspaceC)
```

Both `createClient(workspaces)` and `createClient(workspace)` use the same initialization logic. They initialize all workspaces, including dependencies. The only difference is what they return: the full object vs. a single workspace client.

### Browser vs Node.js Initialization

Workspace clients have different initialization patterns depending on the environment:

**Browser (synchronous)**:
```typescript
// Browser: No await needed - returns immediately
const client = createWorkspaceClient(workspace);

// Client is usable immediately, but providers may still be syncing
client.getAllPosts();

// Wait for all providers to sync if needed
await client.whenSynced;
```

**Node.js (async)**:
```typescript
// Node.js: Await required - fully initializes before returning
const client = await createWorkspaceClient(workspace);

// Everything is ready, no whenSynced needed
client.getAllPosts();
```

Browser clients expose a `whenSynced` promise that resolves when all providers (like IndexedDB persistence) have finished their initial sync. Node clients don't have `whenSynced` because initialization is fully awaited.

See [Synchronous Client Initialization](/docs/articles/sync-client-initialization.md) for the rationale behind this pattern.

---

# Workspace Dependencies

When you have workspaces that depend on other workspaces, you hit a type recursion problem. If workspace A depends on B, which depends on C, which depends on D, and TypeScript tries to infer the full dependency chain recursively, the type system eventually gives up with "Type instantiation is excessively deep and possibly infinite."

Epicenter solves this using a minimal constraint pattern: dependency arrays are constrained to `AnyWorkspaceConfig[]` (which only includes `id`, `name`, and `actions`), stopping recursive type inference. At runtime, all workspace configs are complete; the minimal constraint is purely for type safety.

## The Type System

```typescript
// Minimal constraint for dependencies
type AnyWorkspaceConfig = {
	id: string;
	exports: (context: any) => WorkspaceExports;
};

// Full workspace config
type WorkspaceConfig<
	TDeps extends readonly AnyWorkspaceConfig[],
	TSchema extends WorkspaceSchema,
	TProviderMap extends WorkspaceProviderMap,
	TExports extends WorkspaceExports,
> = {
	id: string;
	tables: TSchema;
	dependencies?: TDeps;
	providers: Record<string, Provider>;
	exports: (ctx: {
		tables: Tables<TSchema>;
		providers: TProviderMap;
		workspaces: DependencyActionsMap<TDeps>;
	}) => TActionMap;
};
```

## How It Works

**At compile time**: Dependencies are constrained to `AnyWorkspaceConfig[]`. This minimal interface (id, name, actions) prevents TypeScript from recursively inferring the entire dependency tree. Without this constraint, TypeScript would try to infer `WorkspaceConfig<WorkspaceConfig<WorkspaceConfig<...>>>` infinitely.

**At runtime**: All workspace configs have full properties (schema, indexes, setupYDoc, etc.). The minimal constraint is purely for type inference. Dependencies are resolved flat with hoisting (like VS Code extensions): all transitive dependencies must be declared at the root level.

**Accessing dependencies**: The `actions` function receives a `workspaces` object that maps dependency names to their action maps:

```typescript
// Dependencies are keyed by their 'name' property
type DependencyActionsMap<TDeps extends readonly AnyWorkspaceConfig[]> = {
	[W in TDeps[number] as W['name']]: ReturnType<W['actions']>;
};
```

## Example

```typescript
// Define workspaces
const connectionPoolWorkspace = defineWorkspace({
	id: 'connection-pool',
	name: 'connectionPool',
	tables: {
		/* ... */
	},
	providers: {
		/* ... */
	},
	exports: () => ({
		getConnection: defineQuery({
			/* ... */
		}),
	}),
});

const databaseWorkspace = defineWorkspace({
	id: 'database',
	name: 'database',
	tables: {
		/* ... */
	},
	dependencies: [connectionPoolWorkspace],
	providers: {
		/* ... */
	},
	exports: ({ workspaces }) => ({
		getUser: defineQuery({
			handler: async () => {
				// Access dependency actions by name
				await workspaces.connectionPool.getConnection();
			},
		}),
	}),
});

const authWorkspace = defineWorkspace({
	id: 'auth',
	name: 'auth',
	tables: {
		/* ... */
	},
	dependencies: [databaseWorkspace],
	providers: {
		/* ... */
	},
	exports: ({ workspaces }) => ({
		verifyToken: defineQuery({
			handler: async () => {
				// Full type information for direct dependencies
				await workspaces.database.getUser();
			},
		}),
	}),
});

// Example workspace with flat/hoisted dependencies
const rootWorkspace = defineWorkspace({
	id: 'root',
	name: 'root',
	tables: {
		/* ... */
	},
	// ALL transitive dependencies must be listed here (flat/hoisted)
	dependencies: [authWorkspace, databaseWorkspace, connectionPoolWorkspace],
	providers: {
		/* ... */
	},
	exports: ({ workspaces }) => ({
		login: defineQuery({
			handler: async () => {
				// Access any dependency by name
				await workspaces.auth.verifyToken();
				await workspaces.database.getUser();
				await workspaces.connectionPool.getConnection();
			},
		}),
	}),
});
```

## Epicenter vs Workspace

- **Workspace**: A self-contained domain module (like a library). Defines schema, providers, and exports.
- **Epicenter**: A composition of workspaces (the application). Aggregates multiple workspaces and provides a unified interface.

Think of it this way:

- **Workspace** = Module
- **Epicenter** = Application (composed of modules)

## Sequential Script Execution

Multiple scripts can safely run one after another using the `await using` syntax:

```typescript
// Script 1: Import data
{
	await using client = await createClient(blogWorkspace);
	const data = await readFile('data.json');
	await client.createPost(data);
	// Auto-disposed when block exits
}

// Script 2: Generate content (runs after Script 1 completes)
{
	await using client = await createClient(blogWorkspace);
	const posts = await client.getAllPosts();
	await generateContent(posts);
	// Auto-disposed when block exits
}
```

Each `await using` block:

1. Creates a fresh client
2. Loads current state from `.epicenter/`
3. Runs your code
4. Disposes the client (saves state, cleans up)
5. Next block starts fresh

This ensures scripts run sequentially with no conflicts.

## Flat/Hoisted Dependencies

Like VS Code extensions, Epicenter uses flat dependency resolution:

1. All transitive dependencies must be declared at the root level
2. If workspace A depends on B, and B depends on C, then A must list both B and C in its dependencies array
3. Dependencies are initialized in topological order (Kahn's algorithm)

This model:

- Prevents "dependency hell" with deeply nested trees
- Ensures consistent initialization order
- Makes all dependencies explicit and auditable

## The Three-Stage Dependency Pattern

Workspaces use a three-stage dependency pattern (tables → providers → actions) that avoids TypeScript's circular inference problem:

```typescript
defineWorkspace({
	// Stage 1: Tables (base data structure)
	tables: { posts: { title: text() } },

	// Stage 2: Providers (depend on tables)
	providers: {
		sqlite: (c) => sqliteProvider(c),
	},

	// Stage 3: Actions (depend on tables AND providers)
	exports: ({ tables, providers, workspaces }) => ({
		getPost: defineQuery({
			handler: async () => {
				// Full type information for providers
				return providers.sqlite.posts.select().all();
			},
		}),
	}),
});
```

This works because we **parameterize return values, not function types**. Instead of `TProvidersFn extends () => any` with `ReturnType<TProvidersFn>` (which creates circular inference), we use `TProviderMap` directly and inline the function signature.

See `typescript-inference-problem.md` and `inference-test.ts` in this directory for details.

## When This Matters

This system is mostly invisible until you:

1. Have workspace dependencies (then you must list all transitives at root)
2. Need type information for dependency actions (accessed via `workspaces.dependencyName`)
3. See type errors about "Type instantiation is excessively deep" (the minimal constraint prevents this)

The flat/hoisted model means you always have explicit control over which workspaces are used, and the type system provides full autocomplete for your direct dependencies' actions.
