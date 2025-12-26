/**
 * Node/Bun-specific provider types.
 *
 * In Node/Bun environments, providers have access to filesystem paths
 * (`storageDir`, `epicenterDir`) for file-based persistence.
 */

import type { ProviderContextBase, ProviderExports } from './provider.shared';
import type { WorkspaceSchema } from './schema';
import type { EpicenterDir, ProjectDir } from './types';

// Re-export shared types
export type {
	InferProviderExports,
	ProviderExports,
	WorkspaceProviderMap,
} from './provider.shared';
export { defineProviderExports } from './provider.shared';

/**
 * Node/Bun provider context.
 *
 * Extends the base context with filesystem paths. Unlike the browser context,
 * `storageDir` and `epicenterDir` are guaranteed to be defined (not undefined).
 *
 * @example Filesystem persistence provider
 * ```typescript
 * const persistenceProvider: Provider = async ({ id, ydoc, epicenterDir }) => {
 *   // epicenterDir is guaranteed to exist - no undefined check needed!
 *   const filePath = path.join(epicenterDir, `${id}.yjs`);
 *
 *   // Load state
 *   const savedState = await Bun.file(filePath).arrayBuffer();
 *   Y.applyUpdate(ydoc, new Uint8Array(savedState));
 *
 *   // Save on updates
 *   ydoc.on('update', () => Bun.write(filePath, Y.encodeStateAsUpdate(ydoc)));
 *
 *   return defineProviderExports({
 *     destroy: () => { ... }
 *   });
 * };
 * ```
 *
 * @example SQLite materializer provider
 * ```typescript
 * const sqliteProvider: Provider<MySchema> = async ({ id, tables, epicenterDir }) => {
 *   const dbPath = path.join(epicenterDir, `${id}.db`);
 *   const client = new Database(dbPath);
 *   const db = drizzle({ client });
 *
 *   // Set up table observers...
 *
 *   return defineProviderExports({
 *     destroy: () => client.close(),
 *     db,
 *   });
 * };
 * ```
 */
export type ProviderContext<TSchema extends WorkspaceSchema = WorkspaceSchema> =
	ProviderContextBase<TSchema> & {
		/**
		 * Absolute project directory path resolved from epicenter config.
		 * Defaults to `process.cwd()` if not specified in config.
		 */
		projectDir: ProjectDir;

		/**
		 * Absolute path to the `.epicenter` directory.
		 * Computed as `path.join(projectDir, '.epicenter')`.
		 */
		epicenterDir: EpicenterDir;
	};

/**
 * A provider function that attaches external capabilities to a workspace.
 *
 * Providers can be:
 * - **Persistence**: Save/load YDoc state (filesystem)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Materializers**: Sync data to external stores (SQLite, markdown, vector DB)
 * - **Observability**: Logging, debugging, analytics
 *
 * Node/Bun providers are fully awaited during initialization, so they can
 * perform async filesystem operations before returning.
 *
 * All providers must explicitly return a `ProviderExports` object, even if empty.
 * This ensures cleanup responsibilities are always considered.
 *
 * @example Persistence provider
 * ```typescript
 * const persistenceProvider: Provider = async ({ id, ydoc, epicenterDir }) => {
 *   const filePath = path.join(epicenterDir, `${id}.yjs`);
 *   const handler = () => Bun.write(filePath, Y.encodeStateAsUpdate(ydoc));
 *   ydoc.on('update', handler);
 *
 *   return defineProviderExports({
 *     destroy: () => ydoc.off('update', handler),
 *   });
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
 *
 * @example Side-effect only provider (no cleanup needed)
 * ```typescript
 * const loggingProvider: Provider = ({ ydoc }) => {
 *   console.log('Workspace initialized:', ydoc.guid);
 *   return defineProviderExports({});
 * };
 * ```
 */
export type Provider<
	TSchema extends WorkspaceSchema = WorkspaceSchema,
	TExports extends ProviderExports = ProviderExports,
> = (context: ProviderContext<TSchema>) => TExports | Promise<TExports>;
