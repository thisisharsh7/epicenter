import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Y from 'yjs';
import type { TableSchema } from '../core/column-schemas';
import { createEpicenterDb } from './core';

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
 *   storagePath: './data/workspaces'
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
	options?: {
		/**
		 * Directory where YJS documents are stored
		 * @default './data/workspaces'
		 */
		storagePath?: string;
	},
) {
	const persistence = createFilePersistence(options);
	const ydoc = persistence.load(workspaceId);
	return createEpicenterDb(ydoc, tableSchemas);
}

/**
 * Create a file persistence manager for YJS documents.
 * Encapsulates storage path and provides methods for loading, saving, and managing documents.
 */
function createFilePersistence({
	storagePath = './data/workspaces',
}: {
	/**
	 * Directory where YJS documents are stored
	 * @default './data/workspaces'
	 */
	storagePath?: string;
} = {}) {
	// Ensure storage directory exists
	if (!fs.existsSync(storagePath)) {
		fs.mkdirSync(storagePath, { recursive: true });
	}

	function getPath(workspaceId: string): string {
		return path.join(storagePath, `${workspaceId}.yjs`);
	}

	return {
		/**
		 * Load YDoc from disk (or create new). Sets up auto-save by default.
		 */
		load(
			workspaceId: string,
			{ autoSave = true }: { autoSave?: boolean } = {},
		): Y.Doc {
			const ydoc = new Y.Doc({ guid: workspaceId });

			// Try to load from disk
			try {
				const savedState = fs.readFileSync(getPath(workspaceId));
				Y.applyUpdate(ydoc, savedState);
				console.log(
					`[Persistence] Loaded workspace ${workspaceId} from ${getPath(workspaceId)}`,
				);
			} catch {
				console.log(`[Persistence] Creating new workspace ${workspaceId}`);
			}

			if (autoSave) {
				this.watch(ydoc);
			}

			return ydoc;
		},

		/**
		 * Manually save a YDoc to disk
		 */
		save(ydoc: Y.Doc): void {
			const state = Y.encodeStateAsUpdate(ydoc);
			fs.writeFileSync(getPath(ydoc.guid), state);
		},

		/**
		 * Setup auto-save observer (if you want manual control)
		 */
		watch(ydoc: Y.Doc): () => void {
			const handler = () => this.save(ydoc);
			ydoc.on('update', handler);
			return () => ydoc.off('update', handler);
		},

		/**
		 * Delete document from disk
		 */
		delete(workspaceId: string): boolean {
			try {
				fs.unlinkSync(getPath(workspaceId));
				console.log(`[Persistence] Deleted workspace ${workspaceId}`);
				return true;
			} catch {
				return false;
			}
		},

		/**
		 * Check if document exists
		 */
		exists(workspaceId: string): boolean {
			return fs.existsSync(getPath(workspaceId));
		},

		/**
		 * List all persisted workspace IDs
		 */
		list(): string[] {
			return fs
				.readdirSync(storagePath)
				.filter((file) => file.endsWith('.yjs'))
				.map((file) => file.replace('.yjs', ''));
		},
	};
}
