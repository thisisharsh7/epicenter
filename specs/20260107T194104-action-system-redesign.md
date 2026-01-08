# Action System Redesign

**Status:** Draft  
**Created:** 2026-01-07  
**Author:** Braden Wong

## Overview

Reintroduce actions as a lightweight boundary layer for exposing workspace functionality via HTTP, MCP, and CLI. Actions are plain objects defined separately from capabilities, passed to `createServer` and `createCLI` as a second argument.

This design avoids the complexity of the previous action system (8+ overloads, `ctx` object, unclear registration timing) while preserving the benefits of declarative contracts for cross-boundary invocation.

## Background

### Why Actions Were Removed (PR #1209)

The previous action system was removed because:

1. **8+ function overloads**: Tracking sync/async, `Result<T,E>` vs raw `T`, with/without input created combinatorial explosion
2. **Redundant `ctx` object**: Handlers received `(input, ctx)` where `ctx` was essentially the workspace client
3. **Unclear registration timing**: Should actions be registered at workspace definition, `.create()`, or server creation?
4. **Contract/handler separation complexity**: Added ceremony without clear value

### What We Learned

The "just write functions" approach that replaced actions is simpler for internal logic, but we lose:

- Automatic MCP tool generation
- Automatic OpenAPI documentation
- Automatic CLI command generation
- Input validation at boundaries
- Introspectable action metadata

### The New Insight

**Capabilities and actions serve different purposes:**

- **Capabilities**: Internal runtime APIs (SQLite connections, file watchers, sync providers)
- **Actions**: External boundary contracts (what can be invoked remotely, with validation)

Actions should be defined **after** client creation, **separately** from capabilities, and passed to adapters (server, CLI) explicitly.

## Proposed Design

### The Flow

```
1. Define Workspace Schema
        ↓
2. Create Client with Capabilities
        ↓
3. Define Actions (wrapping client methods)
        ↓
4. Pass to Server/CLI
```

### Code Example

```typescript
import { defineWorkspace, defineAction } from '@epicenter/hq';
import { type } from 'arktype';

// Step 1: Define workspace
const workspace = defineWorkspace({
	id: 'blog',
	guid: 'abc-123',
	tables: { posts: { id: id(), title: text(), content: text() } },
	kv: {},
});

// Step 2: Create client with capabilities
const client = await workspace.create({ sqlite, persistence, markdown });

// Step 3: Define actions (wrapping client methods)
const actions = {
	posts: {
		getAll: defineAction({
			type: 'query',
			handler: () => client.tables.posts.getAllValid(),
		}),
		create: defineAction({
			type: 'mutation',
			input: type({ title: 'string', content: 'string' }),
			handler: ({ title, content }) => {
				const id = generateId();
				client.tables.posts.upsert({ id, title, content });
				return { id };
			},
		}),
		get: defineAction({
			type: 'query',
			input: type({ id: 'string' }),
			output: type({ id: 'string', title: 'string', content: 'string' }),
			handler: ({ id }) => client.tables.posts.get({ id }),
		}),
	},
	sync: {
		markdown: defineAction({
			type: 'mutation',
			description: 'Sync markdown files to YJS',
			handler: () => client.capabilities.markdown.pullFromMarkdown(),
		}),
	},
};

// Step 4: Pass to server and/or CLI
const server = createServer(client, { actions });
const cli = createCLI(client, { actions });
```

## Type Definitions

### Action Type

````typescript
import type { StandardSchemaV1, StandardSchemaWithJSONSchema } from './schema';

/**
 * Action - a plain object with handler and metadata for cross-boundary invocation.
 *
 * Actions enable:
 * - REST API endpoints (GET for queries, POST for mutations)
 * - MCP tool definitions
 * - CLI commands
 * - OpenAPI documentation
 *
 * @template TInput - Input schema (must support JSON Schema generation)
 * @template TOutput - Handler return type (inferred if not specified)
 */
export type Action<
	TInput extends StandardSchemaWithJSONSchema | undefined = undefined,
	TOutput = unknown,
> = {
	/** 'query' for read operations (GET), 'mutation' for write operations (POST) */
	type: 'query' | 'mutation';

	/** Human-readable description for docs and MCP tool descriptions */
	description?: string;

	/** Input schema for validation and JSON Schema generation */
	input?: TInput;

	/** Output schema for documentation (optional, can be inferred) */
	output?: StandardSchemaWithJSONSchema;

	/** The handler function. Receives validated input if `input` is defined. */
	handler: TInput extends StandardSchemaWithJSONSchema
		? (
				input: StandardSchemaV1.InferOutput<TInput>,
			) => TOutput | Promise<TOutput>
		: () => TOutput | Promise<TOutput>;
};

/**
 * Actions can nest to any depth.
 * Leaves must be Action objects (have `type` and `handler`).
 *
 * @example Flat structure
 * ```typescript
 * const actions = {
 *   getUser: { type: 'query', handler: ... },
 *   createUser: { type: 'mutation', handler: ... },
 * };
 * ```
 *
 * @example Nested structure
 * ```typescript
 * const actions = {
 *   users: {
 *     getAll: { type: 'query', handler: ... },
 *     create: { type: 'mutation', handler: ... },
 *   },
 * };
 * ```
 */
export type Actions = {
	[key: string]: Action<any, any> | Actions;
};
````

### Helper Function

````typescript
/**
 * Define an action with full type inference.
 *
 * This is an identity function that provides type inference for:
 * - TInput: Inferred from the `input` schema
 * - TOutput: Inferred from the handler return type
 * - Handler signature: Conditional based on whether `input` is defined
 *
 * Without this helper, you'd need `satisfies Action` and lose input type inference.
 *
 * @example No input - handler has no arguments
 * ```typescript
 * const getAllPosts = defineAction({
 *   type: 'query',
 *   handler: () => client.tables.posts.getAllValid(),
 * });
 * ```
 *
 * @example With input - handler receives typed input
 * ```typescript
 * const createPost = defineAction({
 *   type: 'mutation',
 *   input: type({ title: 'string' }),
 *   handler: ({ title }) => {
 *     // TypeScript knows: title is string
 *     client.tables.posts.upsert({ id: generateId(), title });
 *   },
 * });
 * ```
 */
export function defineAction<
	TInput extends StandardSchemaWithJSONSchema | undefined = undefined,
	TOutput = unknown,
>(action: Action<TInput, TOutput>): Action<TInput, TOutput> {
	return action;
}
````

### Why No `defineActions`?

A `defineActions` helper is **not necessary** because:

1. Each leaf action is already typed via `defineAction`
2. TypeScript infers the nested structure automatically from the leaves
3. It would just be an identity function with no type inference benefit

```typescript
// This works fine - TypeScript infers the full structure
const actions = {
  posts: {
    create: defineAction({ ... }), // Already typed
    getAll: defineAction({ ... }), // Already typed
  },
};
// actions.posts.create is fully typed ✓
```

## Server and CLI Integration

### createServer Signature

```typescript
/**
 * Create an HTTP server from a workspace client and actions.
 *
 * @param client - The workspace client
 * @param options - Server options including actions to expose
 */
function createServer(
	client: WorkspaceClient,
	options: {
		actions: Actions;
		port?: number;
	},
): Server;
```

### createCLI Signature

```typescript
/**
 * Create a CLI from a workspace client and actions.
 *
 * @param client - The workspace client
 * @param options - CLI options including actions to expose
 */
function createCLI(
	client: WorkspaceClient,
	options: {
		actions: Actions;
	},
): CLI;
```

### Route/Command Generation

From the action tree, adapters generate:

| Adapter     | Action Path    | Generated                           |
| ----------- | -------------- | ----------------------------------- |
| **HTTP**    | `posts.create` | `POST /posts/create`                |
| **HTTP**    | `posts.getAll` | `GET /posts/getAll`                 |
| **MCP**     | `posts.create` | Tool `posts_create`                 |
| **CLI**     | `posts.create` | `cli posts create --title "Hello"`  |
| **OpenAPI** | `posts.create` | Operation with input/output schemas |

## Design Decisions

### Why Plain Objects Instead of Callable Functions?

The old system made actions callable (`action(input)`). The new system uses plain objects because:

1. **Simpler types**: No need for callable + properties hybrid
2. **Easier introspection**: Just read `action.type`, `action.input`, etc.
3. **No confusion**: Actions are data describing behavior, not the behavior itself
4. **Adapters invoke**: The server/CLI adapter calls `action.handler(input)`, not user code

### Why `StandardSchemaWithJSONSchema` for Input?

Input schemas must support JSON Schema generation for:

- MCP tool `inputSchema`
- OpenAPI request body schemas
- CLI flag generation

`StandardSchemaWithJSONSchema` ensures the schema can be converted to JSON Schema. ArkType and Zod (v4.2+) both satisfy this constraint.

### Why Output is Optional?

1. TypeScript can infer the handler return type
2. Output schema is only needed for explicit documentation
3. Most actions don't need it
4. Keeps the common case simple

### Why No Overloads?

The old system had 8 overloads per function to track:

- With/without input (2x)
- Sync/async handler (2x)
- Returns `Result<T,E>` vs raw `T` (2x)

The new system avoids this by:

1. **Conditional handler type**: If `input` is defined, handler receives it; otherwise no args
2. **Union return type**: Handler returns `T | Promise<T>` - runtime handles both
3. **No Result tracking**: Handler can return `Result` or raw value - adapters handle both

### Why Separate from Capabilities?

Capabilities are internal runtime APIs that may:

- Not be JSON-serializable
- Have complex dependencies
- Manage resources and lifecycle

Actions are external boundary contracts that must:

- Have JSON-serializable inputs/outputs
- Be introspectable without runtime initialization
- Be safe to expose publicly

Mixing them creates confusion about what's internal vs external.

## Implementation Plan

- [ ] **Create `core/actions.ts`** with new types
  - [ ] `Action` type with conditional handler signature
  - [ ] `Actions` type for nested structure
  - [ ] `defineAction()` helper function
  - [ ] `isAction()`, `isQuery()`, `isMutation()` type guards
- [ ] **Update `server/server.ts`**
  - [ ] Accept `{ actions }` as second argument to `createServer`
  - [ ] Walk action tree to generate routes
  - [ ] Use `action.type` to determine HTTP method (GET vs POST)
  - [ ] Validate input with `action.input` schema
- [ ] **Update `cli/cli.ts`**
  - [ ] Accept `{ actions }` as second argument to `createCLI`
  - [ ] Walk action tree to generate commands
  - [ ] Convert `action.input` to CLI flags via JSON Schema
- [ ] **Update MCP integration**
  - [ ] Walk action tree to generate tools
  - [ ] Use `action.input` for tool `inputSchema`
  - [ ] Use `action.description` for tool description
- [ ] **Update exports in `index.ts`**
  - [ ] Export `Action`, `Actions` types
  - [ ] Export `defineAction` function
  - [ ] Export type guards
- [ ] **Update documentation**
  - [ ] `packages/epicenter/README.md`
  - [ ] `packages/epicenter/src/server/README.md`
  - [ ] `packages/epicenter/src/cli/README.md`

## Files to Change

| File                                      | Changes                           |
| ----------------------------------------- | --------------------------------- |
| `packages/epicenter/src/core/actions.ts`  | New file with types and helpers   |
| `packages/epicenter/src/server/server.ts` | Accept actions, generate routes   |
| `packages/epicenter/src/cli/cli.ts`       | Accept actions, generate commands |
| `packages/epicenter/src/index.ts`         | Export new types and functions    |
| `packages/epicenter/README.md`            | Update documentation              |

## Migration Notes

This is a **new feature**, not a breaking change. The previous action system was already removed.

Users can adopt actions incrementally:

```typescript
// Before: No actions, just functions
const client = await workspace.create({ sqlite });
function createPost(title: string) { ... }
app.post('/posts', (req) => createPost(req.body.title));

// After: With actions
const client = await workspace.create({ sqlite });
const actions = {
  posts: {
    create: defineAction({
      type: 'mutation',
      input: type({ title: 'string' }),
      handler: ({ title }) => { ... },
    }),
  },
};
const server = createServer(client, { actions });
```

## Comparison with Old System

| Aspect          | Old System              | New System                     |
| --------------- | ----------------------- | ------------------------------ |
| Overloads       | 8 per function          | 0                              |
| Handler context | `(input, ctx)`          | `(input)` - closes over client |
| Registration    | `.withActions()` chain  | Separate, passed to server/CLI |
| Callable        | Yes, `action(input)`    | No, plain object               |
| Type complexity | High (4 generic params) | Low (2 generic params)         |
| Lines of code   | ~743                    | ~100 estimated                 |

## Review

_To be filled in after implementation_
