import type * as Y from 'yjs';
import type { Tables } from './db/core';
import type { WorkspaceSchema } from './schema';
import type { ProviderDir, StorageDir } from './types';

/**
 * Context provided to each provider function.
 *
 * Providers began as data indexes (SQLite, markdown) but have evolved to handle
 * many workspace capabilities: persistence, sync, authentication, and more.
 *
 * @property id - The workspace ID (e.g., 'blog', 'content-hub')
 * @property providerId - This provider's key in the providers map (e.g., 'sqlite', 'persistence')
 * @property ydoc - The YJS document that providers can attach to
 * @property schema - The workspace schema (table definitions)
 * @property tables - The Epicenter tables instance for observing/querying data
 * @property storageDir - Project root directory for user-facing content (e.g., markdown vault)
 * @property providerDir - Provider's dedicated directory for internal artifacts (databases, logs, tokens)
 *
 * ## Path Context
 *
 * Providers receive two path variables for different purposes:
 *
 * - **`storageDir`**: Project root. Use for user-facing content that lives outside `.epicenter/`.
 *   Example: markdown files in `./vault/`, config files, user-editable content.
 *
 * - **`providerDir`**: Provider's isolated directory at `.epicenter/providers/{providerId}/`.
 *   Use for internal artifacts like databases, logs, caches, and tokens.
 *   This directory is gitignored.
 *
 * Both are `undefined` in browser environments where filesystem access isn't available.
 *
 * @example Persistence provider (stores YJS state)
 * ```typescript
 * const persistenceProvider: Provider = ({ id, providerDir }) => {
 *   if (!providerDir) throw new Error('Requires Node.js');
 *   const filePath = path.join(providerDir, `${id}.yjs`);
 *   // Load/save ydoc state...
 * };
 * ```
 *
 * @example SQLite index (internal artifacts)
 * ```typescript
 * const sqliteProvider: Provider = ({ id, providerDir }) => {
 *   const dbPath = path.join(providerDir, `${id}.db`);
 *   const logPath = path.join(providerDir, 'logs', `${id}.log`);
 *   // ...
 * };
 * ```
 *
 * @example Markdown provider (user content + internal logs)
 * ```typescript
 * const markdownProvider: Provider = ({ id, storageDir, providerDir }, config) => {
 *   // User content: resolve relative to project root
 *   const contentDir = path.resolve(storageDir, config.directory);
 *
 *   // Internal logs: use provider directory
 *   const logPath = path.join(providerDir, 'logs', `${id}.log`);
 * };
 * ```
 *
 * @example Auth provider (tokens and credentials)
 * ```typescript
 * const gmailProvider: Provider = ({ providerDir }) => {
 *   const tokenPath = path.join(providerDir, 'token.json');
 *   // OAuth tokens stored in provider's isolated directory
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
		storageDir: StorageDir | undefined;
		providerDir: ProviderDir | undefined;
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
 * const sqliteProvider: Provider<MySchema, SqliteExports> = async ({ id, providerDir, tables }) => {
 *   const client = new Database(path.join(providerDir, `${id}.db`));
 *   const sqliteDb = drizzle({ client });
 *   // Set up observers...
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
