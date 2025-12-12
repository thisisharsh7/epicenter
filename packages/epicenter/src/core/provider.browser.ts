/**
 * Browser-specific provider types.
 *
 * In browser environments, there's no filesystem access, so `storageDir` and
 * `epicenterDir` are not available in the provider context.
 */

import type { ProviderContextBase, ProviderExports } from './provider.shared';
import type { WorkspaceSchema } from './schema';

// Re-export shared types
export type {
	InferProviderExports,
	ProviderExports,
	WorkspaceProviderMap,
} from './provider.shared';
export { defineProviderExports } from './provider.shared';

/**
 * Browser provider context.
 *
 * Browser providers don't have access to filesystem paths (`storageDir`, `epicenterDir`).
 * Use browser-native storage APIs like IndexedDB instead.
 *
 * @example IndexedDB persistence provider
 * ```typescript
 * const persistenceProvider: Provider = ({ ydoc }) => {
 *   const persistence = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineProviderExports({
 *     whenSynced: persistence.whenSynced,
 *     destroy: () => persistence.destroy(),
 *   });
 * };
 * ```
 */
export type ProviderContext<TSchema extends WorkspaceSchema = WorkspaceSchema> =
	ProviderContextBase<TSchema>;

/**
 * A provider function that attaches external capabilities to a workspace.
 *
 * Providers can be:
 * - **Persistence**: Save/load YDoc state (IndexedDB)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Observability**: Logging, debugging, analytics
 *
 * Browser providers typically handle async operations internally and return
 * synchronously, using `whenSynced` to signal when data is ready.
 *
 * @example Persistence provider with whenSynced
 * ```typescript
 * const persistenceProvider: Provider = ({ ydoc }) => {
 *   const persistence = new IndexeddbPersistence(ydoc.guid, ydoc);
 *   return defineProviderExports({
 *     whenSynced: persistence.whenSynced,
 *     destroy: () => persistence.destroy(),
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
