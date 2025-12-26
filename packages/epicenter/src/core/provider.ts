import type * as Y from 'yjs';
import type { Tables } from './db/core';
import type { WorkspaceSchema } from './schema';
import type { ProviderPaths } from './types';

/**
 * Context provided to each provider function.
 *
 * @property id - The workspace ID (e.g., 'blog', 'content-hub')
 * @property providerId - This provider's key in the providers map (e.g., 'sqlite', 'persistence')
 * @property ydoc - The YJS document that providers can attach to
 * @property schema - The workspace schema (table definitions)
 * @property tables - The Epicenter tables instance for observing/querying data
 * @property paths - Filesystem paths (`undefined` in browser environments)
 *
 * @example Persistence provider
 * ```typescript
 * const persistenceProvider: Provider = ({ id, paths, ydoc }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const filePath = path.join(paths.provider, `${id}.yjs`);
 *   // Load existing YDoc state from disk, set up auto-save on updates...
 * };
 * ```
 *
 * @example Markdown provider (user content + internal logs)
 * ```typescript
 * const markdownProvider: Provider = ({ id, paths }, config) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   // User content: resolve relative to project root (not gitignored)
 *   const contentDir = path.resolve(paths.project, config.directory);
 *   // Internal logs: use provider directory (gitignored)
 *   const logPath = path.join(paths.provider, 'logs', `${id}.log`);
 * };
 * ```
 *
 * @example Auth provider (tokens)
 * ```typescript
 * const gmailAuthProvider: Provider = ({ paths }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const tokenPath = path.join(paths.provider, 'token.json');
 *   return { loadTokens: () => Bun.file(tokenPath).json() };
 * };
 * ```
 */
export type ProviderContext<TSchema extends WorkspaceSchema = WorkspaceSchema> =
	{
		id: string;
		providerId: string;
		ydoc: Y.Doc;
		schema: TSchema;
		tables: Tables<TSchema>;
		paths: ProviderPaths | undefined;
	};

/**
 * Provider exports type - an object with optional cleanup function and any exported resources.
 *
 * Providers that materialize views (SQLite, markdown, vector, etc.) can return exports
 * that are accessible in the workspace exports factory via `providers.providerName.exportName`.
 *
 * The `destroy()` function is optional and will be called during workspace cleanup if present.
 *
 * @example
 * ```typescript
 * return defineProviderExports({
 *   destroy: () => client.close(),
 *   db: sqliteDb,
 *   posts: postsTable,
 * });
 * ```
 */
export type ProviderExports = {
	destroy?: () => void | Promise<void>;
	[key: string]: unknown;
};

/**
 * A provider function that attaches external capabilities to a workspace.
 *
 * Providers handle many workspace capabilities:
 * - **Persistence**: Save/load YDoc state (filesystem, IndexedDB)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Materializers**: Sync data to external stores (SQLite, markdown, vector DB)
 * - **Authentication**: OAuth tokens, API keys, credentials storage
 * - **Observability**: Logging, debugging, analytics
 *
 * Providers can be synchronous or asynchronous. All providers are awaited during initialization.
 * Providers can optionally return exports that are accessible in the workspace exports factory.
 *
 * @example Materializer provider (with exports)
 * ```typescript
 * const sqliteProvider: Provider<MySchema, SqliteExports> = async ({ id, paths, tables }) => {
 *   if (!paths) throw new Error('Requires Node.js');
 *   const client = new Database(path.join(paths.provider, `${id}.db`));
 *   const sqliteDb = drizzle({ client });
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
