import type * as Y from 'yjs';
import type { WorkspaceExports } from '../actions';
import type { AnyWorkspaceConfig } from './config';

/**
 * A workspace client is not a standalone concept. It's a single workspace extracted from an Epicenter client.
 *
 * An Epicenter client is an object of workspace clients: `{ workspaceId: WorkspaceClient }`.
 * `createEpicenterClient()` returns the full object. `createWorkspaceClient()` returns one workspace from that object.
 *
 * The client contains all workspace exports: actions, utilities, constants, and helpers.
 * Actions (queries and mutations) are identified at runtime via type guards for API/MCP mapping.
 */
export type WorkspaceClient<TExports extends WorkspaceExports> = TExports & {
	/**
	 * The underlying YJS document for this workspace.
	 *
	 * Exposed for sync providers and advanced use cases.
	 * The document's guid matches the workspace ID.
	 *
	 * @example
	 * ```typescript
	 * const client = await createEpicenterClient(config);
	 * const ydoc = client.blog.$ydoc;
	 * ydoc.on('update', (update) => { ... });
	 * ```
	 */
	$ydoc: Y.Doc;

	/**
	 * Async cleanup method for resource management
	 * - Destroys all providers (awaiting any async cleanup)
	 * - Destroys the YJS document
	 *
	 * Call manually for explicit control:
	 * ```typescript
	 * const workspace = await createWorkspaceClient(config);
	 * // ... use workspace ...
	 * await workspace.destroy();
	 * ```
	 */
	destroy: () => Promise<void>;

	/**
	 * Async disposal for `await using` syntax (TC39 Explicit Resource Management)
	 *
	 * Use for automatic cleanup when scope exits:
	 * ```typescript
	 * await using workspace = await createWorkspaceClient(config);
	 * // ... use workspace ...
	 * // cleanup happens automatically when scope exits
	 * ```
	 */
	[Symbol.asyncDispose]: () => Promise<void>;
};

/**
 * Maps an array of workspace configs to an object of WorkspaceClients keyed by workspace id.
 *
 * Takes an array of workspace configs and merges them into a single object where:
 * - Each key is a workspace id
 * - Each value is a WorkspaceClient with all exports and lifecycle management
 *
 * This allows accessing workspace exports as `client.workspaceId.exportName()`.
 *
 * Note: Workspaces can export actions, utilities, constants, and helpers.
 * Actions (queries/mutations) get special treatment at the server/MCP level via iterActions().
 *
 * @example
 * ```typescript
 * // Given workspace configs:
 * const authWorkspace = defineWorkspace({ id: 'auth', exports: () => ({ login: ..., logout: ..., validateToken: ... }) })
 * const storageWorkspace = defineWorkspace({ id: 'storage', exports: () => ({ upload: ..., download: ..., MAX_FILE_SIZE: ... }) })
 *
 * // WorkspacesToClients<[typeof authWorkspace, typeof storageWorkspace]> produces:
 * {
 *   auth: WorkspaceClient<{ login: ..., logout: ... }>,  // Only actions exposed
 *   storage: WorkspaceClient<{ upload: ..., download: ... }>  // Only actions exposed
 * }
 * ```
 */
export type WorkspacesToClients<WS extends readonly AnyWorkspaceConfig[]> = {
	[W in WS[number] as W extends { id: infer TId extends string }
		? TId
		: never]: W extends {
		exports: (context: any) => infer TExports extends WorkspaceExports;
	}
		? WorkspaceClient<TExports>
		: never;
};

// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: initializeWorkspaces is implemented separately in:
// - client.browser.ts (SYNCHRONOUS - no await on provider factories)
// - client.node.ts (ASYNC - awaits provider factories for filesystem I/O)
//
// The implementations are nearly identical except for async/await handling.
// This duplication is intentional for clarity - you can read each file
// top-to-bottom without jumping between files.
// ═══════════════════════════════════════════════════════════════════════════════
