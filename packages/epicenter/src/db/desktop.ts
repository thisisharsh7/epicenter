import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Y from 'yjs';
import type { TableSchema } from '../core/column-schemas';
import { createEpicenterDb } from './core';

/**
 * Create an Epicenter database with file persistence.
 * Loads the database from disk if it exists, otherwise creates a new one.
 * Automatically saves changes to disk by default.
 *
 * **Platform:** Node.js/Desktop (Tauri, Electron)
 * Uses filesystem for persistence. Not available in browser environments.
 *
 * @param workspaceId - The workspace ID (used as Y.Doc GUID and filename)
 * @param schema - Table schema definitions
 * @param options - Persistence configuration
 * @returns Database with table helpers and persistence control methods
 *
 * @example
 * ```typescript
 * const db = createEpicenterDB('workspace-123', {
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
 *   autosave: true
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
 *
 * // Control autosave behavior
 * db.disableAutoSave();
 * // ... batch operations
 * db.save(); // manually save
 * db.enableAutoSave();
 * ```
 */
export function createEpicenterDbFromDisk<
	TSchemas extends Record<string, TableSchema>,
>(
	workspaceId: string,
	schema: TSchemas,
	options?: {
		/**
		 * Directory where YJS documents are stored
		 * @default './data/workspaces'
		 */
		storagePath?: string;
		/**
		 * Enable automatic persistence on document updates
		 * @default true
		 */
		autosave?: boolean;
	},
) {
	const { storagePath = './data/workspaces', autosave = true } = options ?? {};

	// Ensure storage directory exists
	if (!fs.existsSync(storagePath)) {
		fs.mkdirSync(storagePath, { recursive: true });
	}

	const filePath = path.join(storagePath, `${workspaceId}.yjs`);

	// Create and load YDoc
	const ydoc = new Y.Doc({ guid: workspaceId });

	// Try to load from disk
	try {
		const savedState = fs.readFileSync(filePath);
		Y.applyUpdate(ydoc, savedState);
		console.log(`[Persistence] Loaded workspace ${workspaceId} from ${filePath}`);
	} catch {
		console.log(`[Persistence] Creating new workspace ${workspaceId}`);
	}

	// Create database
	const db = createEpicenterDb(ydoc, schema);

	// Save function (reused by both manual save and autosave)
	function save(): void {
		const state = Y.encodeStateAsUpdate(ydoc);
		fs.writeFileSync(filePath, state);
	}

	// Autosave management
	let autoSaveCleanup: (() => void) | null = null;

	function setupAutoSave(): void {
		if (autoSaveCleanup) return; // Already enabled

		ydoc.on('update', save);
		autoSaveCleanup = () => ydoc.off('update', save);
	}

	function teardownAutoSave(): void {
		if (autoSaveCleanup) {
			autoSaveCleanup();
			autoSaveCleanup = null;
		}
	}

	// Setup autosave if enabled
	if (autosave) {
		setupAutoSave();
	}

	return {
		...db,

		/**
		 * Manually save the database to disk
		 */
		save,

		/**
		 * Enable automatic saving on every document update
		 */
		enableAutoSave() {
			setupAutoSave();
		},

		/**
		 * Disable automatic saving (useful for batch operations)
		 */
		disableAutoSave() {
			teardownAutoSave();
		},
	};
}
