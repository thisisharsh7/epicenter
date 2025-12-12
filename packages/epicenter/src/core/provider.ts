import type * as Y from 'yjs';
import type { Tables } from './db/core';
import type { WorkspaceSchema } from './schema';
import type { EpicenterDir, StorageDir } from './types';

/**
 * Context provided to each provider function.
 *
 * Provides workspace metadata, the YJS document, and table access for providers.
 *
 * @property id - The workspace ID (e.g., 'blog', 'content-hub')
 * @property providerId - This provider's key in the providers map (e.g., 'sqlite', 'persistence')
 * @property ydoc - The YJS document that providers can attach to
 * @property schema - The workspace schema (table definitions)
 * @property tables - The Epicenter tables instance for observing/querying data
 * @property storageDir - Absolute storage directory path resolved from epicenter config
 *   - Node.js: Resolved to absolute path (defaults to `process.cwd()` if not specified in config)
 *   - Browser: `undefined` (filesystem operations not available)
 * @property epicenterDir - Absolute path to the `.epicenter` directory
 *   - Computed as `path.join(storageDir, '.epicenter')`
 *   - `undefined` in browser environment
 *
 * @example Persistence provider (uses ydoc only)
 * ```typescript
 * const persistenceProvider: Provider = ({ id, ydoc, epicenterDir }) => {
 *   if (!epicenterDir) throw new Error('Requires Node.js');
 *   const filePath = path.join(epicenterDir, `${id}.yjs`);
 *   // Load/save ydoc state...
 * };
 * ```
 *
 * @example Materializer provider (uses tables)
 * ```typescript
 * const sqliteProvider: Provider<MySchema, SqliteExports> = ({ id, providerId, tables, epicenterDir }) => {
 *   // Observe table changes, sync to SQLite...
 *   return defineProviderExports({
 *     destroy: () => client.close(),
 *     db: sqliteDb,
 *   });
 * };
 * ```
 */
export type ProviderContext<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
> = {
	id: string;
	providerId: string;
	ydoc: Y.Doc;
	schema: TSchema;
	tables: Tables<TSchema>;
	storageDir: StorageDir | undefined;
	epicenterDir: EpicenterDir | undefined;
};

/**
 * Provider exports type - an object with optional lifecycle hooks and any exported resources.
 *
 * Providers that materialize views (SQLite, markdown, vector, etc.) can return exports
 * that are accessible in the workspace exports factory via `providers.providerName.exportName`.
 *
 * **Lifecycle hooks:**
 * - `whenSynced`: Optional promise that resolves when the provider has completed initial sync
 * - `destroy()`: Optional cleanup function called during workspace cleanup
 *
 * @example Browser provider (sync construction, deferred sync)
 * ```typescript
 * return defineProviderExports({
 *   whenSynced: persistence.whenSynced,
 *   destroy: () => persistence.destroy(),
 * });
 * ```
 *
 * @example Node provider (async construction)
 * ```typescript
 * return defineProviderExports({
 *   destroy: () => client.close(),
 *   db: sqliteDb,
 *   posts: postsTable,
 * });
 * ```
 *
 * @see https://github.com/yjs/y-indexeddb - Inspiration for the whenSynced pattern
 */
export type ProviderExports = {
	/**
	 * Optional promise that resolves when the provider has completed initial sync.
	 *
	 * This follows the y-indexeddb pattern: construction is synchronous,
	 * but providers may load data asynchronously in the background.
	 *
	 * If provided, this will be included in the workspace's aggregated `whenSynced`.
	 *
	 * @example
	 * ```typescript
	 * const persistence = new IndexeddbPersistence(ydoc.guid, ydoc);
	 * return defineProviderExports({
	 *   whenSynced: persistence.whenSynced,
	 *   destroy: () => persistence.destroy(),
	 * });
	 * ```
	 */
	whenSynced?: Promise<void>;

	/**
	 * Optional cleanup function called during workspace cleanup.
	 */
	destroy?: () => void | Promise<void>;

	[key: string]: unknown;
};

/**
 * A provider function that attaches external capabilities to a workspace.
 *
 * Providers can be:
 * - **Persistence**: Save/load YDoc state (filesystem, IndexedDB)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Materializers**: Sync data to external stores (SQLite, markdown, vector DB)
 * - **Observability**: Logging, debugging, analytics
 *
 * Providers can be synchronous or asynchronous. All providers are awaited during initialization.
 * Providers can optionally return exports that are accessible in the workspace exports factory.
 *
 * @example Persistence provider (no exports)
 * ```typescript
 * const persistenceProvider: Provider = ({ ydoc }) => {
 *   new IndexeddbPersistence('my-db', ydoc);
 * };
 * ```
 *
 * @example Materializer provider (with exports)
 * ```typescript
 * const sqliteProvider: Provider<MySchema, SqliteExports> = async ({ tables, epicenterDir }) => {
 *   const client = new Database(path.join(epicenterDir, 'data.db'));
 *   const sqliteDb = drizzle({ client });
 *
 *   // Set up observers...
 *
 *   return defineProviderExports({
 *     destroy: () => client.close(),
 *     db: sqliteDb,
 *   });
 * };
 * ```
 */
export type Provider<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TExports extends ProviderExports = ProviderExports,
> = (
	context: ProviderContext<TSchema>,
) => TExports | void | Promise<TExports | void>;

/**
 * A collection of workspace providers indexed by provider name.
 *
 * Each workspace can have multiple providers (persistence, sync, materializers, etc.)
 * that attach to the workspace and optionally provide exports.
 */
export type WorkspaceProviderMap = Record<string, ProviderExports>;

/**
 * Infer the exports type from a provider function.
 *
 * Extracts the return type from a provider, unwrapping Promise and excluding void.
 * Returns `Record<string, never>` (empty object) for providers that return void.
 *
 * @example
 * ```typescript
 * // Provider that returns exports
 * const myProvider = ({ ydoc }) => defineProviderExports({ db: sqlite });
 * type Exports = InferProviderExports<typeof myProvider>;
 * // Exports = { db: typeof sqlite }
 *
 * // Provider that returns void (side effects only)
 * const sideEffectProvider = ({ ydoc }) => { ydoc.on('update', ...); };
 * type Exports = InferProviderExports<typeof sideEffectProvider>;
 * // Exports = Record<string, never>
 * ```
 */
export type InferProviderExports<P> = P extends (context: any) => infer R
	? Awaited<R> extends void | undefined
		? Record<string, never>
		: Exclude<Awaited<R>, void | undefined>
	: Record<string, never>;

/**
 * Define provider exports with type safety (identity function).
 *
 * @example
 * ```typescript
 * return defineProviderExports({
 *   destroy: () => client.close(),
 *   db: sqliteDb,
 *   findById: async (id: string) => { ... }
 * });
 * // Type is inferred as { destroy: () => void, db: typeof sqliteDb, findById: (id: string) => Promise<...> }
 * ```
 */
export function defineProviderExports<T extends ProviderExports>(
	exports: T,
): T {
	return exports;
}
