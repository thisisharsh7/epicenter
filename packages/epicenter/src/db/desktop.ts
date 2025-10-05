import type { TableSchema } from '../core/column-schemas';
import { createEpicenterDb } from './core';
import type { FilePersistenceConfig } from './file-persistence';
import { loadYDoc } from './file-persistence';

/**
 * Create an Epicenter database with file persistence.
 * Loads the database from disk if it exists, otherwise creates a new one.
 * Automatically saves changes to disk.
 *
 * **Platform:** Node.js/Desktop (Tauri, Electron)
 * Uses filesystem for persistence. Not available in browser environments.
 *
 * @param workspaceId - The workspace ID (used as Y.Doc GUID and filename)
 * @param tableSchemas - Table schema definitions
 * @param options - Persistence configuration
 * @returns Object with table helpers and document utilities
 *
 * @example
 * ```typescript
 * const db = createEpicenterDbFromDisk('workspace-123', {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     content: richText({ nullable: true }),
 *     tags: multiSelect({ options: ['tech', 'personal', 'work'] as const }),
 *     viewCount: integer(),
 *     published: boolean(),
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text(),
 *     text: text(),
 *   }
 * }, {
 *   storagePath: './data/workspaces',
 *   autoSave: true
 * });
 *
 * // Database is loaded from disk and ready to use
 * db.tables.posts.insert({
 *   id: '1',
 *   title: 'My First Post',
 *   content: new Y.XmlFragment(),
 *   tags: new Y.Array(),
 *   viewCount: 0,
 *   published: false,
 * });
 * ```
 */
export function createEpicenterDbFromDisk<
	TSchemas extends Record<string, TableSchema>,
>(
	workspaceId: string,
	tableSchemas: TSchemas,
	options?: FilePersistenceConfig,
) {
	// Load from disk (or create new if doesn't exist)
	const ydoc = loadYDoc(workspaceId, options);

	// Wrap with table helpers
	return createEpicenterDb(ydoc, tableSchemas);
}
